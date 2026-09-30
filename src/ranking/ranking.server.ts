import { and, eq, sql } from "drizzle-orm";

import * as tables from "../db/schema.ts";
import { addDays } from "../scarcity/model.ts";
import type { Observation } from "../scarcity/model.ts";
import { readRanking } from "../scarcity/store.ts";
import type { ScarcityDatabase } from "../scarcity/store.ts";

/** Summary rows stay small; only the opened restaurant includes slots and source quotes. */
export function readRankingPage(db: ScarcityDatabase, selectedUrl?: string) {
  return db.transaction((transaction) => {
    const rows = readRanking(transaction);

    const observedDays = transaction
      .select({
        resyUrl: tables.dinnerObservations.resyUrl,
        diningDate: tables.dinnerObservations.diningDate,
        status: tables.dinnerObservations.status,
      })
      .from(tables.dinnerObservations)
      .innerJoin(
        tables.restaurantRanking,
        and(
          eq(tables.restaurantRanking.resyUrl, tables.dinnerObservations.resyUrl),
          eq(tables.restaurantRanking.collectionId, tables.dinnerObservations.collectionId),
        ),
      )
      .where(
        sql`${tables.dinnerObservations.diningDate} <= date(${tables.restaurantRanking.anchorDate}, '+7 days')`,
      )
      .all();

    const daysByVenue = new Map<string, Map<string, Observation["status"]>>();

    for (const observation of observedDays) {
      const dates =
        daysByVenue.get(observation.resyUrl) ?? new Map<string, Observation["status"]>();

      dates.set(observation.diningDate, observation.status);
      daysByVenue.set(observation.resyUrl, dates);
    }

    const restaurants = rows.map((row) => ({
      resyUrl: row.resyUrl,
      name: row.name,
      address: row.address,
      anchorDate: row.anchorDate,
      eligibility: row.eligibility,
      eligibilityReason: row.eligibilityReason,
      score: row.score,
      scoreReason: row.scoreReason,
      unavailable: row.unavailable,
      assessed: row.assessed,
      nonService: row.nonService,
      earliestAvailableDate: row.earliestAvailableDate,
      week: Array.from({ length: 7 }, (_, index) => {
        const diningDate = addDays(row.anchorDate, index + 1);

        return {
          diningDate,
          status: daysByVenue.get(row.resyUrl)?.get(diningDate) ?? ("missing" as const),
        };
      }),
    }));

    const selected = rows.find((row) => row.resyUrl === selectedUrl);
    let detail = null;

    if (selected) {
      const identity = and(
        eq(tables.restaurantSnapshots.collectionId, selected.collectionId),
        eq(tables.restaurantSnapshots.resyUrl, selected.resyUrl),
      );

      const snapshot = transaction.select().from(tables.restaurantSnapshots).where(identity).get();

      const collection = transaction
        .select({
          id: tables.collections.id,
          selection: tables.collections.selection,
          limitations: tables.collections.limitations,
        })
        .from(tables.collections)
        .where(eq(tables.collections.id, selected.collectionId))
        .get();

      if (!snapshot || !collection) throw new Error("Ranking references a missing snapshot");
      detail = {
        restaurant: selected,
        evidence: snapshot.evidence,
        collection,
        observations: transaction
          .select({ detail: tables.dinnerObservations.detail })
          .from(tables.dinnerObservations)
          .where(
            and(
              eq(tables.dinnerObservations.collectionId, selected.collectionId),
              eq(tables.dinnerObservations.resyUrl, selected.resyUrl),
            ),
          )
          .orderBy(tables.dinnerObservations.diningDate)
          .all()
          .map((row) => row.detail),
        bands: transaction
          .select()
          .from(tables.scarcityScores)
          .where(
            and(
              eq(tables.scarcityScores.collectionId, selected.collectionId),
              eq(tables.scarcityScores.resyUrl, selected.resyUrl),
            ),
          )
          .orderBy(tables.scarcityScores.startDay)
          .all(),
      };
    }

    return { restaurants, detail };
  });
}
