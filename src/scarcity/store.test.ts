import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, it, onTestFinished } from "vite-plus/test";

import * as schema from "../db/schema.ts";
import { addDays, collectionSchema, localDate, observationSchema } from "./model.ts";
import type { Observation, RestaurantCapture } from "./model.ts";
import { importCollection, readRanking } from "./store.ts";

const evidence = {
  url: "https://resy.com/cities/san-francisco-ca/venues/test-restaurant",
  observedAt: "2026-09-30T22:00:00.000Z",
  quote: "Synthetic test evidence; not a real restaurant observation.",
};

function openTestDatabase() {
  const sqlite = new Database(":memory:");
  onTestFinished(() => {
    sqlite.close();
  });
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });

  return db;
}

function observation(offset: number, status: Observation["status"] = "available"): Observation {
  const base = {
    diningDate: addDays("2026-09-30", offset),
    observedAt: evidence.observedAt,
    evidence: [evidence],
  };

  if (status === "available") {
    return observationSchema.parse({
      ...base,
      status,
      slots: [{ time: "18:30", type: "Dining room", price: null }],
    });
  }

  if (status === "unavailable") {
    return observationSchema.parse({
      ...base,
      status,
      releaseEvidence: evidence,
      serviceEvidence: evidence,
    });
  }

  return observationSchema.parse({ ...base, status });
}

function restaurant(observations: Observation[]): RestaurantCapture {
  return {
    name: "Synthetic restaurant",
    resyUrl: evidence.url,
    address: "Synthetic SF address",
    geography: "san_francisco",
    eligibility: "eligible",
    reason: "Synthetic regular dinner service",
    bookingPolicy: "Synthetic 28-day release window",
    evidence: [evidence],
    observations,
  };
}

function collection(
  id: string,
  restaurants: RestaurantCapture[],
  startedAt = "2026-09-30T21:00:00Z",
) {
  return collectionSchema.parse({
    schemaVersion: 1,
    id,
    startedAt,
    finishedAt: "2026-09-30T22:10:00Z",
    discoveryUrl: "https://resy.com/cities/san-francisco-ca",
    discoveryComplete: false,
    selection: "Synthetic test fixtures only",
    collector: "test",
    procedure: ["Construct synthetic observations"],
    limitations: ["Not live evidence"],
    restaurants,
  });
}

it("scores a common week, excludes non-service dates, and retains later bands and inputs", () => {
  const db = openTestDatabase();

  const observations = [
    observation(1, "unavailable"),
    observation(2, "unavailable"),
    observation(3),
    observation(4),
    observation(5),
    observation(6, "non_service"),
    observation(7, "non_service"),
    ...Array.from({ length: 7 }, (_, index) => observation(index + 8, "unavailable")),
  ];

  importCollection(db, collection("first", [restaurant(observations)]));

  expect(readRanking(db)).toMatchObject([
    {
      score: 40,
      available: 3,
      unavailable: 2,
      assessed: 5,
      nonService: 2,
      earliestAvailableDate: "2026-10-03",
      weekendAvailableDates: 1,
    },
  ]);
  expect(db.select().from(schema.scarcityScores).all()).toMatchObject([
    { startDay: 1, score: 40 },
    { startDay: 8, score: 100 },
    { startDay: 15, score: null, missing: 7 },
    { startDay: 22, score: null, missing: 7 },
  ]);
  expect(db.select().from(schema.dinnerObservations).all()[0].detail).toEqual(observations[0]);
});

it.each(["unreleased", "unknown", "collection_error"] as const)(
  "does not publish a score when one dinner date is %s",
  (status) => {
    const db = openTestDatabase();

    const observations = Array.from({ length: 6 }, (_, index) =>
      observation(index + 1, "unavailable"),
    );

    observations.push(observation(7, status));
    importCollection(db, collection(status, [restaurant(observations)]));
    expect(readRanking(db)[0]).toMatchObject({ score: null, assessed: 6 });
  },
);

it("keeps missing dates and excluded restaurants unscored rather than interpreting absence as demand", () => {
  const db = openTestDatabase();
  const partial = restaurant([observation(1, "unavailable")]);

  const excluded = restaurant(
    Array.from({ length: 7 }, (_, index) => observation(index + 1, "unavailable")),
  );

  excluded.resyUrl = `${evidence.url}-excluded`;
  excluded.eligibility = "excluded";
  excluded.reason = "Event-only listing";
  importCollection(db, collection("partial", [partial, excluded]));
  expect(readRanking(db)).toMatchObject([{ score: null }, { score: null }]);
  expect(db.select().from(schema.scarcityScores).all()).toContainEqual(
    expect.objectContaining({
      resyUrl: partial.resyUrl,
      startDay: 1,
      missing: 6,
    }),
  );
});

it("retries imports without duplication, rejects changed evidence, and preserves snapshot history", () => {
  const db = openTestDatabase();

  const full = restaurant(
    Array.from({ length: 7 }, (_, index) => observation(index + 1, "unavailable")),
  );

  const first = collection("first", [full]);
  expect(importCollection(db, first).imported).toBe(true);
  expect(importCollection(db, first).imported).toBe(false);
  expect(db.select().from(schema.dinnerObservations).all()).toHaveLength(7);

  const changed = collection("first", [restaurant([])]);
  expect(() => importCollection(db, changed)).toThrow("different evidence");
  expect(readRanking(db)[0].score).toBe(100);

  const latest = collection("latest", [restaurant([])], "2026-09-30T20:00:00Z");
  latest.finishedAt = "2026-09-30T22:15:00.000Z";
  importCollection(db, collectionSchema.parse(latest));
  importCollection(db, collection("older-imported-last", [full], "2026-09-30T21:30:00Z"));
  expect(readRanking(db)[0]).toMatchObject({ collectionId: "latest", score: null, missing: 7 });
  expect(db.select().from(schema.restaurantSnapshots).all()).toHaveLength(3);
});

it("keeps a fixed score as the subset grows and sorts scored restaurants ahead of unresolved ones", () => {
  const db = openTestDatabase();

  const full = restaurant(
    Array.from({ length: 7 }, (_, index) => observation(index + 1, "unavailable")),
  );

  importCollection(db, collection("first", [full]));
  const open = restaurant(Array.from({ length: 7 }, (_, index) => observation(index + 1)));
  open.resyUrl = `${evidence.url}-open`;
  const unresolved = restaurant([]);
  unresolved.resyUrl = `${evidence.url}-unresolved`;
  unresolved.eligibility = "unresolved";
  importCollection(db, collection("expansion", [open, unresolved]));
  expect(readRanking(db).map((row) => row.score)).toEqual([100, 0, null]);
});

it("validates dates, geography, dinner times, and evidence at the import boundary", () => {
  const valid = collection("valid", [restaurant([observation(1)])]);
  const duplicate = structuredClone(valid);
  duplicate.restaurants[0].observations.push(observation(1));
  expect(collectionSchema.safeParse(duplicate).success).toBe(false);

  const outside = structuredClone(valid);
  outside.restaurants[0].geography = "outside_san_francisco";
  expect(collectionSchema.safeParse(outside).success).toBe(false);

  const past = structuredClone(valid);
  past.restaurants[0].observations[0].diningDate = "2026-09-30";
  expect(collectionSchema.safeParse(past).success).toBe(false);

  const event = structuredClone(valid);
  event.restaurants[0].resyUrl += "/events/special-dinner";
  expect(collectionSchema.safeParse(event).success).toBe(false);

  const futureEvidence = structuredClone(valid);
  futureEvidence.restaurants[0].evidence[0].observedAt = "2026-10-01T22:00:00Z";
  expect(collectionSchema.safeParse(futureEvidence).success).toBe(false);

  expect(
    observationSchema.safeParse({
      diningDate: "2026-10-01",
      observedAt: evidence.observedAt,
      status: "unavailable",
      evidence: [evidence],
    }).success,
  ).toBe(false);
  expect(
    observationSchema.safeParse({
      diningDate: "2026-10-01",
      observedAt: evidence.observedAt,
      status: "available",
      evidence: [evidence],
      slots: [{ time: "21:30", type: "Dinner", price: null }],
    }).success,
  ).toBe(false);
});

it("uses SF calendar dates across UTC midnight and daylight-saving changes", () => {
  expect(localDate("2026-10-01T01:00:00Z")).toBe("2026-09-30");
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  const crossed = collection("crossed", [restaurant([])]);
  crossed.finishedAt = "2026-10-01T08:00:00Z";
  expect(collectionSchema.safeParse(crossed).success).toBe(false);
});
