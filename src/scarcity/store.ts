import { createHash } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import { localDate, SCORE_VERSION } from "./model.ts";
import type { Collection, RestaurantCapture } from "./model.ts";
import { scoreRestaurant } from "./score.ts";

export type ScarcityDatabase = BetterSQLite3Database<typeof schema>;

function storeScores(
  db: ScarcityDatabase,
  collectionId: string,
  restaurant: RestaurantCapture,
  anchorDate: string,
) {
  for (const band of scoreRestaurant(restaurant, anchorDate)) {
    db.insert(schema.scarcityScores)
      .values({
        collectionId,
        resyUrl: restaurant.resyUrl,
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

/** Rebuild derived scores atomically; source evidence and import hashes never change. */
export function rescoreCollections(db: ScarcityDatabase) {
  return db.transaction((transaction) => {
    const collections = transaction.select().from(schema.collections).all();

    for (const collection of collections) {
      transaction
        .delete(schema.scarcityScores)
        .where(eq(schema.scarcityScores.collectionId, collection.id))
        .run();

      const snapshots = transaction
        .select()
        .from(schema.restaurantSnapshots)
        .where(eq(schema.restaurantSnapshots.collectionId, collection.id))
        .all();

      for (const snapshot of snapshots) {
        const observations = transaction
          .select({ detail: schema.dinnerObservations.detail })
          .from(schema.dinnerObservations)
          .where(
            and(
              eq(schema.dinnerObservations.collectionId, collection.id),
              eq(schema.dinnerObservations.resyUrl, snapshot.resyUrl),
            ),
          )
          .all()
          .map((row) => row.detail);

        storeScores(
          transaction,
          collection.id,
          { ...snapshot, observations },
          collection.anchorDate,
        );
      }

      transaction
        .update(schema.collections)
        .set({ scoreVersion: SCORE_VERSION })
        .where(eq(schema.collections.id, collection.id))
        .run();
    }

    return { collections: collections.length, scoreVersion: SCORE_VERSION };
  });
}

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

      storeScores(transaction, collection.id, restaurant, anchorDate);
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
