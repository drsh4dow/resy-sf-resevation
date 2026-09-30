import { createHash } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { localDate, SCORE_VERSION } from "./model.ts";
import type { Collection } from "./model.ts";
import { scoreRestaurant } from "./score.ts";

type ScarcityDatabase = BetterSQLite3Database<typeof schema>;

/** Import one validated, immutable collection atomically. Exact retries are no-ops. */
export function importCollection(db: ScarcityDatabase, collection: Collection) {
  const inputHash = createHash("sha256").update(JSON.stringify(collection)).digest("hex");
  const anchorDate = localDate(collection.startedAt);

  return db.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(schema.collections)
      .where(eq(schema.collections.id, collection.id))
      .get();

    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new Error(
          `Collection ${collection.id} already exists with different evidence; use a new ID`,
        );
      }

      return { imported: false, restaurants: collection.restaurants.length };
    }

    transaction
      .insert(schema.collections)
      .values({
        id: collection.id,
        inputHash,
        schemaVersion: collection.schemaVersion,
        scoreVersion: SCORE_VERSION,
        startedAt: collection.startedAt,
        finishedAt: collection.finishedAt,
        anchorDate,
        discoveryUrl: collection.discoveryUrl,
        discoveryComplete: collection.discoveryComplete,
        selection: collection.selection,
        collector: collection.collector,
        procedure: collection.procedure,
        limitations: collection.limitations,
      })
      .run();

    for (const restaurant of collection.restaurants) {
      const { observations, ...assessment } = restaurant;
      const identity = { collectionId: collection.id, resyUrl: restaurant.resyUrl };
      transaction
        .insert(schema.restaurantSnapshots)
        .values({
          ...assessment,
          collectionId: collection.id,
        })
        .run();

      for (const observation of observations) {
        transaction
          .insert(schema.dinnerObservations)
          .values({
            ...identity,
            diningDate: observation.diningDate,
            observedAt: observation.observedAt,
            status: observation.status,
            detail: observation,
          })
          .run();
      }

      for (const band of scoreRestaurant(restaurant, anchorDate)) {
        transaction
          .insert(schema.scarcityScores)
          .values({
            ...identity,
            startDay: band.startDay,
            endDay: band.endDay,
            available: band.counts.available,
            unavailable: band.counts.unavailable,
            nonService: band.counts.non_service,
            unreleased: band.counts.unreleased,
            unknown: band.counts.unknown,
            collectionError: band.counts.collection_error,
            missing: band.counts.missing,
            assessed: band.assessed,
            score: band.score,
            reason: band.reason,
          })
          .run();
      }
    }

    return { imported: true, restaurants: collection.restaurants.length };
  });
}

export function readRanking(db: ScarcityDatabase) {
  // SQLite sorts NULL last with DESC. Equal scores remain ties, ordered by name for display.
  return db
    .select()
    .from(schema.restaurantRanking)
    .orderBy(desc(schema.restaurantRanking.score), schema.restaurantRanking.name)
    .all();
}
