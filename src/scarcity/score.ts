import { addDays } from "./model.ts";
import type { Observation, RestaurantCapture } from "./model.ts";

/** Seating types at the same time are one choice, not evidence of extra capacity. */
export function availableDinnerTimes(observation: Observation): string[] {
  if (observation.status !== "available") return [];

  return [...new Set(observation.slots.map((slot) => slot.time))].toSorted();
}

export function scoreRestaurant(restaurant: RestaurantCapture, anchorDate: string) {
  const observations = new Map(restaurant.observations.map((item) => [item.diningDate, item]));

  return [1, 8, 15, 22].map((startDay) => {
    const counts = {
      available: 0,
      unavailable: 0,
      non_service: 0,
      unreleased: 0,
      unknown: 0,
      collection_error: 0,
      missing: 0,
    };

    let limitedChoice = 0;

    for (let offset = startDay; offset < startDay + 7; offset++) {
      const observation = observations.get(addDays(anchorDate, offset));

      if (observation) {
        counts[observation.status]++;

        if (observation.status === "available" || observation.status === "unavailable") {
          limitedChoice += 1 / (1 + availableDinnerTimes(observation).length);
        }
      } else {
        counts.missing++;
      }
    }

    const assessed = counts.available + counts.unavailable;

    const incomplete =
      counts.unreleased + counts.unknown + counts.collection_error + counts.missing;

    let score: number | null = null;
    let reason: string | null = null;

    if (restaurant.eligibility !== "eligible") {
      reason = restaurant.reason;
    } else if (incomplete > 0) {
      reason =
        "Not every date has a released, assessed dinner service or confirmed non-service status";
    } else if (assessed === 0) {
      reason = "No regular dinner service dates in this band";
    } else {
      // Equal weight for no-opening frequency and limited choice. The reciprocal
      // rewards extra times with diminishing returns, without assuming total capacity.
      score = (50 * (counts.unavailable + limitedChoice)) / assessed;
    }

    return { startDay, endDay: startDay + 6, counts, assessed, score, reason };
  });
}
