import { addDays } from "./model.ts";
import type { RestaurantCapture } from "./model.ts";

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

    for (let offset = startDay; offset < startDay + 7; offset++) {
      const observation = observations.get(addDays(anchorDate, offset));

      if (observation) {
        counts[observation.status]++;
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
      score = (100 * counts.unavailable) / assessed;
    }

    return { startDay, endDay: startDay + 6, counts, assessed, score, reason };
  });
}
