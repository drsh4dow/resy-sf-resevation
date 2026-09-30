import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { assembleSearch, observeSearch } from "./collect.ts";
import { searchResponseSchema } from "./resy.ts";
import { scoreRestaurant } from "./score.ts";

const observedAt = "2026-09-30T22:00:00.000Z";

const day = "2026-10-01";

const identity = {
  id: { resy: 42 },
  name: "Example restaurant",
  url_slug: "example",
  locality: "San Francisco",
  region: "CA",
  location: { url_slug: "san-francisco-ca" },
};

function slot(time: string, template = 1) {
  return {
    date: { start: `${day} ${time}` },
    config: { type: "Dining Room", token: "private-reservation-token" },
    template: { id: template },
    is_global_dining_access: false,
    exclusive: { id: 0, is_eligible: true },
  };
}

const nativeHit = {
  ...identity,
  is_tock_inventory: false,
  availability: {
    slots: [slot("18:00:00")],
    templates: {
      "1": { is_event: 0, is_pickup: 0 },
      "2": { is_event: 1, is_pickup: 0 },
      "3": { is_event: 0, is_pickup: 1 },
    },
    gating_errors: {},
    status: null,
  },
};

const meta = { page: 1, per_page: 20, total: 1, total_pages: 1 };

test("only public regular dinner starts in the inclusive window establish access; tokens are discarded", () => {
  const response = searchResponseSchema.parse({
    meta,
    search: {
      hits: [
        {
          ...nativeHit,
          availability: {
            ...nativeHit.availability,
            slots: [
              slot("17:59:00"),
              slot("18:00:00"),
              slot("21:00:00"),
              slot("21:00:01"),
              slot("19:00:00", 2),
              slot("19:15:00", 3),
              slot("19:30:00", 99),
              { ...slot("20:00:00"), is_global_dining_access: true },
              { ...slot("20:15:00"), exclusive: { id: 7, is_eligible: true } },
              { ...slot("20:30:00"), exclusive: { id: 0, is_eligible: false } },
              { ...slot("20:45:00"), date: { start: "2026-10-02 20:45:00" } },
            ],
          },
        },
      ],
    },
  });

  expect(JSON.stringify(response)).not.toContain("private-reservation-token");
  const hit = response.search.hits[0];

  if (!hit) throw new Error("Missing test venue");
  expect(observeSearch(hit, day, observedAt)).toMatchObject({
    status: "available",
    slots: [
      { time: "18:00", type: "Dining Room", price: null },
      { time: "21:00", type: "Dining Room", price: null },
    ],
  });
});

test("empty, gated and other-platform inventory cannot establish unavailability or access", () => {
  const response = searchResponseSchema.parse({
    meta,
    search: {
      hits: [
        { ...nativeHit, availability: { ...nativeHit.availability, slots: [] } },
        {
          ...nativeHit,
          availability: {
            ...nativeHit.availability,
            gating_errors: { blocked: { token: "secret" } },
          },
        },
        { ...identity, is_tock_inventory: true, availability: { slots: [slot("18:00:00")] } },
      ],
    },
  });

  expect(JSON.stringify(response)).not.toContain("secret");

  for (const hit of response.search.hits) {
    expect(observeSearch(hit, day, observedAt).status).toBe("unknown");
  }
});

test("interrupted receipts assemble offline without fabricating missing dates or overwriting evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "resy-assembly-test-"));

  try {
    const response = searchResponseSchema.parse({
      meta: { ...meta, total: 4, total_pages: 2 },
      search: {
        hits: [
          nativeHit,
          { ...identity, id: { resy: 43 }, url_slug: "external", is_tock_inventory: true },
          { ...nativeHit, id: { resy: 44 }, url_slug: "oakland-venue" },
        ],
      },
    });

    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        id: "interrupted-test",
        startedAt: observedAt,
        days: 7,
        query: "",
      }),
    );
    await writeFile(
      join(directory, "search-2026-10-01-001.json"),
      JSON.stringify({
        observedAt,
        day,
        page: 1,
        response,
      }),
    );

    const details = {
      id: identity.id,
      name: identity.name,
      is_active: 1,
      location: {
        address_1: "1 Example St",
        locality: "San Francisco",
        region: "CA",
        postal_code: "94103",
        country_iso3166: "US",
      },
      content: [],
    };

    await writeFile(
      join(directory, "venue-42.json"),
      JSON.stringify({ observedAt, response: details }),
    );
    await writeFile(
      join(directory, "venue-44.json"),
      JSON.stringify({
        observedAt,
        response: {
          ...details,
          id: { resy: 44 },
          location: { ...details.location, locality: "Oakland", postal_code: "94612" },
        },
      }),
    );
    await writeFile(
      join(directory, "search-2026-10-02-001.json.interrupted.partial"),
      "{truncated",
    );
    const collection = await assembleSearch(directory);
    expect(collection.discoveryComplete).toBe(false);
    expect(collection.restaurants).toHaveLength(2);
    expect(
      collection.restaurants.find((venue) => venue.resyUrl.endsWith("/oakland-venue")),
    ).toMatchObject({
      geography: "outside_san_francisco",
      eligibility: "excluded",
      observations: [],
    });
    expect(
      collection.procedure.some((step) => step.includes("https://www.exploretock.com/external/")),
    ).toBe(true);
    const restaurant = collection.restaurants[0];

    if (!restaurant) throw new Error("Missing assembled venue");
    expect(restaurant.eligibility).toBe("eligible");
    expect(restaurant.observations).toHaveLength(1);
    expect(scoreRestaurant(restaurant, "2026-09-30")[0]).toMatchObject({
      score: null,
      counts: { available: 1, missing: 6 },
    });
    const original = await readFile(join(directory, "collection.json"), "utf8");
    await expect(assembleSearch(directory)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(join(directory, "collection.json"), "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
