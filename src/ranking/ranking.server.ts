import { and, eq, sql } from "drizzle-orm";

import * as tables from "../db/schema.ts";
import { addDays } from "../scarcity/model.ts";
import type { Observation } from "../scarcity/model.ts";
import { availableDinnerTimes } from "../scarcity/score.ts";
import { readRanking } from "../scarcity/store.ts";
import type { ScarcityDatabase } from "../scarcity/store.ts";

/** Return booking choices, not the collection's source quotes and internal notes. */
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
      week: Array.from({ length: 7 }, (_, index) => {
        const diningDate = addDays(row.anchorDate, index + 1);

        return {
          diningDate,
          status: daysByVenue.get(row.resyUrl)?.get(diningDate) ?? ("missing" as const),
        };
      }),
    }));

    const selectedIndex = rows.findIndex((row) => row.resyUrl === selectedUrl);
    const selected = rows[selectedIndex];
    const restaurant = restaurants[selectedIndex];
    let detail = null;

    if (selected && restaurant) {
      detail = {
        restaurant,
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
          .map(({ detail: observation }) => ({
            diningDate: observation.diningDate,
            status: observation.status,
            times: availableDinnerTimes(observation),
          })),
      };
    }

    return { restaurants, detail };
  });
}
