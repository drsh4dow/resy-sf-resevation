import { z } from "zod";

export const TIME_ZONE = "America/Los_Angeles";

export const SCORE_VERSION = "dinner-choice-scarcity-v2";

const nonempty = z.string().trim().min(1);

const timestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const date = z.iso.date();

const httpUrl = z.url({ protocol: /^https?$/ });

const resyUrl = z.url({ protocol: /^https$/, hostname: /^resy\.com$/ }).refine((value) => {
  const url = new URL(value);

  return /^\/cities\/[^/]+\/venues\/[^/]+$/.test(url.pathname) && !url.search && !url.hash;
}, "Use a canonical Resy venue URL without query parameters or a trailing slash");

const localDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function localDate(instant: string): string {
  return localDateFormatter.format(new Date(instant));
}

// Calendar arithmetic uses UTC only to avoid adding 24 hours across local DST changes.
export function addDays(day: string, count: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);

  return value.toISOString().slice(0, 10);
}

export const evidenceSchema = z.strictObject({
  url: httpUrl,
  observedAt: timestamp,
  quote: nonempty,
});

const slotSchema = z.strictObject({
  time: z.string().regex(/^(?:(?:18|19|20):[0-5]\d|21:00)$/),
  type: nonempty,
  price: nonempty.nullable(),
});

const observationBase = z.strictObject({
  diningDate: date,
  observedAt: timestamp,
  evidence: z.array(evidenceSchema).min(1),
});

export const observationSchema = z.discriminatedUnion("status", [
  observationBase.extend({
    status: z.literal("available"),
    slots: z.array(slotSchema).min(1),
  }),
  observationBase.extend({
    status: z.literal("unavailable"),
    // An empty calendar alone cannot establish that released dinner inventory is gone.
    releaseEvidence: evidenceSchema,
    serviceEvidence: evidenceSchema,
  }),
  observationBase.extend({ status: z.literal("non_service") }),
  observationBase.extend({ status: z.literal("unreleased") }),
  observationBase.extend({ status: z.literal("unknown") }),
  observationBase.extend({ status: z.literal("collection_error") }),
]);

export const restaurantCaptureSchema = z
  .strictObject({
    name: nonempty,
    resyUrl,
    address: nonempty.nullable(),
    geography: z.enum(["san_francisco", "outside_san_francisco", "unknown"]),
    eligibility: z.enum(["eligible", "excluded", "unresolved"]),
    reason: nonempty,
    bookingPolicy: nonempty.nullable(),
    evidence: z.array(evidenceSchema).min(1),
    observations: z.array(observationSchema).max(28),
  })
  .superRefine((restaurant, context) => {
    if (restaurant.eligibility === "eligible" && restaurant.geography !== "san_francisco") {
      context.addIssue({
        code: "custom",
        message: "Eligible restaurants must be confirmed within SF",
      });
    }

    const dates = new Set<string>();

    for (const observation of restaurant.observations) {
      if (dates.has(observation.diningDate)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate dining date: ${observation.diningDate}`,
        });
      }

      dates.add(observation.diningDate);
    }
  });

export const collectionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: nonempty,
    startedAt: timestamp,
    finishedAt: timestamp,
    discoveryUrl: httpUrl,
    discoveryComplete: z.boolean(),
    selection: nonempty,
    collector: nonempty,
    procedure: z.array(nonempty).min(1),
    limitations: z.array(nonempty),
    restaurants: z.array(restaurantCaptureSchema).min(1),
  })
  .superRefine((collection, context) => {
    const anchor = localDate(collection.startedAt);
    const start = Date.parse(collection.startedAt);
    const finish = Date.parse(collection.finishedAt);

    if (finish < start || localDate(collection.finishedAt) !== anchor) {
      context.addIssue({
        code: "custom",
        message: "A collection must finish on its starting SF date",
      });
    }

    const urls = new Set<string>();

    for (const restaurant of collection.restaurants) {
      if (urls.has(restaurant.resyUrl)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate restaurant: ${restaurant.resyUrl}`,
        });
      }

      urls.add(restaurant.resyUrl);
      const sources = [...restaurant.evidence];

      for (const observation of restaurant.observations) {
        sources.push(...observation.evidence);

        if (observation.status === "unavailable") {
          sources.push(observation.releaseEvidence, observation.serviceEvidence);
        }

        const observed = Date.parse(observation.observedAt);

        if (observed < start || observed > finish || localDate(observation.observedAt) !== anchor) {
          context.addIssue({
            code: "custom",
            message: "Observation is outside the collection interval",
          });
        }

        if (observation.diningDate <= anchor || observation.diningDate > addDays(anchor, 28)) {
          context.addIssue({ code: "custom", message: "Dining date is outside days 1–28" });
        }
      }

      if (sources.some((source) => Date.parse(source.observedAt) > finish)) {
        context.addIssue({
          code: "custom",
          message: "Evidence was observed after the collection finished",
        });
      }
    }
  });

export type Collection = z.infer<typeof collectionSchema>;

export type RestaurantCapture = z.infer<typeof restaurantCaptureSchema>;

export type Observation = z.infer<typeof observationSchema>;

export type Evidence = z.infer<typeof evidenceSchema>;
