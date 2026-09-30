import {
  check,
  foreignKey,
  integer,
  primaryKey,
  real,
  sqliteTable,
  sqliteView,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { Evidence, Observation, RestaurantCapture } from "../scarcity/model.ts";

export const todos = sqliteTable("todos", {
  id: integer({ mode: "number" }).primaryKey({
    autoIncrement: true,
  }),
  title: text().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const collections = sqliteTable("collections", {
  id: text().primaryKey(),
  inputHash: text("input_hash").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  scoreVersion: text("score_version").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  anchorDate: text("anchor_date").notNull(),
  discoveryUrl: text("discovery_url").notNull(),
  discoveryComplete: integer("discovery_complete", { mode: "boolean" }).notNull(),
  selection: text().notNull(),
  collector: text().notNull(),
  procedure: text({ mode: "json" }).$type<string[]>().notNull(),
  limitations: text({ mode: "json" }).$type<string[]>().notNull(),
});

export const restaurantSnapshots = sqliteTable(
  "restaurant_snapshots",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id),
    resyUrl: text("resy_url").notNull(),
    name: text().notNull(),
    address: text(),
    geography: text().$type<RestaurantCapture["geography"]>().notNull(),
    eligibility: text().$type<RestaurantCapture["eligibility"]>().notNull(),
    reason: text().notNull(),
    bookingPolicy: text("booking_policy"),
    evidence: text({ mode: "json" }).$type<Evidence[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.resyUrl] })],
);

export const dinnerObservations = sqliteTable(
  "dinner_observations",
  {
    collectionId: text("collection_id").notNull(),
    resyUrl: text("resy_url").notNull(),
    diningDate: text("dining_date").notNull(),
    observedAt: text("observed_at").notNull(),
    status: text().$type<Observation["status"]>().notNull(),
    // Preserve the validated discriminated record, including slots and release evidence.
    detail: text({ mode: "json" }).$type<Observation>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.resyUrl, table.diningDate] }),
    foreignKey({
      columns: [table.collectionId, table.resyUrl],
      foreignColumns: [restaurantSnapshots.collectionId, restaurantSnapshots.resyUrl],
    }),
  ],
);

export const scarcityScores = sqliteTable(
  "scarcity_scores",
  {
    collectionId: text("collection_id").notNull(),
    resyUrl: text("resy_url").notNull(),
    startDay: integer("start_day").notNull(),
    endDay: integer("end_day").notNull(),
    available: integer().notNull(),
    unavailable: integer().notNull(),
    nonService: integer("non_service").notNull(),
    unreleased: integer().notNull(),
    unknown: integer().notNull(),
    collectionError: integer("collection_error").notNull(),
    missing: integer().notNull(),
    assessed: integer().notNull(),
    score: real(),
    reason: text(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.resyUrl, table.startDay] }),
    foreignKey({
      columns: [table.collectionId, table.resyUrl],
      foreignColumns: [restaurantSnapshots.collectionId, restaurantSnapshots.resyUrl],
    }),
    check("score_range", sql`${table.score} is null or ${table.score} between 0 and 100`),
    check(
      "seven_dates",
      sql`${table.available} + ${table.unavailable} + ${table.nonService} + ${table.unreleased} + ${table.unknown} + ${table.collectionError} + ${table.missing} = 7`,
    ),
  ],
);

// Never silently substitute an older, better-covered score for the latest snapshot.
export const restaurantRanking = sqliteView("restaurant_ranking", {
  resyUrl: text("resy_url").notNull(),
  name: text().notNull(),
  address: text(),
  collectionId: text("collection_id").notNull(),
  observedFrom: text("observed_from").notNull(),
  observedThrough: text("observed_through").notNull(),
  anchorDate: text("anchor_date").notNull(),
  geography: text().$type<RestaurantCapture["geography"]>().notNull(),
  eligibility: text().$type<RestaurantCapture["eligibility"]>().notNull(),
  eligibilityReason: text("eligibility_reason").notNull(),
  bookingPolicy: text("booking_policy"),
  score: real(),
  scoreReason: text("score_reason"),
  assessed: integer().notNull(),
  available: integer().notNull(),
  unavailable: integer().notNull(),
  nonService: integer("non_service").notNull(),
  unreleased: integer().notNull(),
  unknown: integer().notNull(),
  collectionError: integer("collection_error").notNull(),
  missing: integer().notNull(),
  earliestAvailableDate: text("earliest_available_date"),
  weekendAvailableDates: integer("weekend_available_dates").notNull(),
}).as(sql`
  with latest as (
    select r.*, c.started_at, c.finished_at, c.anchor_date,
      row_number() over (
        partition by r.resy_url order by c.finished_at desc, c.started_at desc, c.id desc
      ) as recency
    from restaurant_snapshots r
    join collections c on c.id = r.collection_id
  )
  select r.resy_url, r.name, r.address, r.collection_id,
    r.started_at as observed_from, r.finished_at as observed_through,
    r.anchor_date, r.geography, r.eligibility, r.reason as eligibility_reason,
    r.booking_policy, s.score, s.reason as score_reason,
    s.assessed, s.available, s.unavailable, s.non_service,
    s.unreleased, s.unknown, s.collection_error, s.missing,
    (select min(o.dining_date) from dinner_observations o
      where o.collection_id = r.collection_id and o.resy_url = r.resy_url
        and o.status = 'available') as earliest_available_date,
    (select count(*) from dinner_observations o
      where o.collection_id = r.collection_id and o.resy_url = r.resy_url
        and o.status = 'available'
        and strftime('%w', o.dining_date) in ('5', '6')) as weekend_available_dates
  from latest r
  join scarcity_scores s on s.collection_id = r.collection_id
    and s.resy_url = r.resy_url and s.start_day = 1
  where r.recency = 1
`);
