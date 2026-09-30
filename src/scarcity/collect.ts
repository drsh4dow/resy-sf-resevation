/* eslint-disable no-await-in-loop -- Rate-limit requests and bound receipt parsing memory; each page determines the next. */
import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { addDays, collectionSchema, localDate } from "./model.ts";
import type { Collection, Evidence, Observation, RestaurantCapture } from "./model.ts";
import {
  ResySearch,
  SEARCH_URL,
  searchResponseSchema,
  venueResponseSchema,
  venueUrl,
} from "./resy.ts";
import type { NativeSearchHit, SearchHit, VenueDetails } from "./resy.ts";

const manifestSchema = z.object({
  id: z.string(),
  startedAt: z.iso.datetime(),
  days: z.number().int().min(1).max(28),
  query: z.string(),
});

const searchCaptureSchema = z.object({
  observedAt: z.iso.datetime(),
  day: z.iso.date(),
  page: z.number().int().positive(),
  response: searchResponseSchema,
});

const detailCaptureSchema = z.object({
  observedAt: z.iso.datetime(),
  response: venueResponseSchema,
});

type SearchCapture = z.infer<typeof searchCaptureSchema>;

type DetailCapture = z.infer<typeof detailCaptureSchema>;

const failureSchema = z.object({ observedAt: z.iso.datetime(), message: z.string() });

type Artifact =
  | z.infer<typeof manifestSchema>
  | SearchCapture
  | DetailCapture
  | Collection
  | z.infer<typeof failureSchema>;

type DayCoverage = {
  pages: Set<number>;
  ids: Set<string>;
  rows: number;
  expectedPages: number;
  expectedVenues: number;
  stableTotals: boolean;
};

async function save(path: string, value: Artifact) {
  const partial = `${path}.${randomUUID()}.partial`;
  await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });

  try {
    // Publish a complete file atomically without replacing an existing receipt.
    await link(partial, path);
  } finally {
    await unlink(partial);
  }
}

function source(url: string, observedAt: string, quote: string): Evidence {
  return { url, observedAt, quote };
}

/** Positive evidence suffices for access; absence never automatically means sold out. */
export function observeSearch(hit: SearchHit, day: string, observedAt: string): Observation {
  const base = { diningDate: day, observedAt };

  const evidence = source(
    SEARCH_URL,
    observedAt,
    `All-day search for ${day}, party_size=2; venue ID ${hit.id.resy}, ${hit.name}.`,
  );

  if (hit.is_tock_inventory) {
    return {
      ...base,
      status: "unknown",
      evidence: [
        { ...evidence, quote: `${evidence.quote} Tock inventory, not Resy reservations.` },
      ],
    };
  }

  const availability = hit.availability;
  const slots: Extract<Observation, { status: "available" }>["slots"] = [];

  for (const slot of availability.slots) {
    const date = slot.date.start.slice(0, 10);
    const localTime = slot.date.start.slice(11);
    const time = localTime.slice(0, 5);
    const template = availability.templates[String(slot.template.id)];

    if (date !== day || localTime < "18:00:00" || localTime > "21:00:00") continue;

    if (slot.is_global_dining_access || slot.exclusive.id !== 0 || !slot.exclusive.is_eligible)
      continue;

    if (!template || template.is_event !== 0 || template.is_pickup !== 0) continue;
    slots.push({ time, type: slot.config.type, price: null });
  }

  const times = availability.slots.map((slot) => `${slot.date.start} ${slot.config.type}`);
  evidence.quote += ` Returned ${times.length} slots: ${times.join("; ") || "none"}.`;

  if (availability.status !== null || Object.keys(availability.gating_errors).length > 0) {
    evidence.quote += " Inventory status/gating errors require review.";

    return { ...base, status: "unknown", evidence: [evidence] };
  }

  if (slots.length > 0) return { ...base, status: "available", evidence: [evidence], slots };
  evidence.quote +=
    " No verified qualifying regular dinner slot; release, service and completeness require review.";

  return { ...base, status: "unknown", evidence: [evidence] };
}

function assessRestaurant(
  hit: NativeSearchHit,
  observedAt: string,
  details: DetailCapture | undefined,
): RestaurantCapture {
  const url = venueUrl(hit);

  const evidence = [
    source(
      SEARCH_URL,
      observedAt,
      `Search venue ID ${hit.id.resy}; locality=${hit.locality}; region=${hit.region}; is_tock_inventory=${hit.is_tock_inventory}.`,
    ),
  ];

  const restaurant: RestaurantCapture = {
    name: hit.name,
    resyUrl: url,
    address: null,
    geography: "unknown",
    eligibility: "unresolved",
    reason: "Physical address and regular dinner eligibility require verification.",
    bookingPolicy: null,
    evidence,
    observations: [],
  };

  if (hit.locality && (hit.locality !== "San Francisco" || hit.region !== "CA")) {
    restaurant.geography = "outside_san_francisco";
    restaurant.eligibility = "excluded";
    restaurant.reason = `Search reports ${hit.locality}, ${hit.region}, outside San Francisco.`;

    return restaurant;
  }

  if (!details) return restaurant;

  const { response, observedAt: detailTime } = details;
  const address = response.location;
  restaurant.address = [address.address_1, address.locality, address.region, address.postal_code]
    .filter(Boolean)
    .join(", ");
  evidence.push(
    source(
      url,
      detailTime,
      `Venue ID ${response.id.resy}; address: ${restaurant.address}; country=${address.country_iso3166}; is_active=${response.is_active}.`,
    ),
  );

  if (
    address.address_1 &&
    address.locality.trim().toLowerCase() === "san francisco" &&
    address.region === "CA" &&
    address.country_iso3166 === "US"
  ) {
    restaurant.geography = "san_francisco";
  } else if (address.locality && address.postal_code && !address.postal_code.startsWith("941")) {
    // A 941xx address with a misspelled city stays unresolved, rather than being excluded.
    restaurant.geography = "outside_san_francisco";
    restaurant.eligibility = "excluded";
    restaurant.reason = `Venue details locate this restaurant at ${restaurant.address}, outside San Francisco.`;
  }

  for (const content of response.content) {
    if (content.body && ["need_to_know", "about", "from_the_venue"].includes(content.name)) {
      evidence.push(source(url, detailTime, content.body));
    }
  }

  if (response.is_active !== 1) {
    restaurant.eligibility = "excluded";
    restaurant.reason =
      "Resy marks this listing inactive; not evidence of high reservation demand.";
  }

  return restaurant;
}

/** Rebuild a collection from immutable, sanitized receipts, including an interrupted run. */
export async function assembleSearch(directory: string) {
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
  );

  const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  files.sort((a, b) => a.localeCompare(b));
  const details = new Map<number, DetailCapture>();

  for (const file of files.filter((name) => name.startsWith("venue-"))) {
    const detail = detailCaptureSchema.parse(
      JSON.parse(await readFile(join(directory, file), "utf8")),
    );

    details.set(detail.response.id.resy, detail);
  }

  const restaurants = new Map<number, RestaurantCapture>();
  const tockListings = new Map<number, string>();
  const pagesByDay = new Map<string, DayCoverage>();
  let finishedAt = manifest.startedAt;

  for (const file of files.filter((name) => name.startsWith("search-"))) {
    const capture = searchCaptureSchema.parse(
      JSON.parse(await readFile(join(directory, file), "utf8")),
    );

    if (capture.observedAt > finishedAt) finishedAt = capture.observedAt;
    const meta = capture.response.meta;

    const coverage = pagesByDay.get(capture.day) ?? {
      pages: new Set<number>(),
      ids: new Set<string>(),
      rows: 0,
      expectedPages: meta.total_pages,
      expectedVenues: meta.total,
      stableTotals: true,
    };

    coverage.pages.add(capture.page);
    coverage.rows += capture.response.search.hits.length;
    coverage.stableTotals &&=
      meta.total === coverage.expectedVenues && meta.total_pages === coverage.expectedPages;

    for (const hit of capture.response.search.hits) {
      coverage.ids.add(`${hit.is_tock_inventory ? "tock" : "resy"}:${hit.id.resy}`);
    }

    pagesByDay.set(capture.day, coverage);

    for (const hit of capture.response.search.hits) {
      if (hit.is_tock_inventory) {
        tockListings.set(
          hit.id.resy,
          `Excluded external Tock search result: ${hit.name}, ${hit.locality}, ${hit.region}; ID ${hit.id.resy}; https://www.exploretock.com/${hit.url_slug}/. Not a Resy venue page.`,
        );
        continue;
      }

      let restaurant = restaurants.get(hit.id.resy);

      if (!restaurant) {
        restaurant = assessRestaurant(hit, capture.observedAt, details.get(hit.id.resy));
        restaurants.set(hit.id.resy, restaurant);
      }

      if (restaurant.resyUrl !== venueUrl(hit))
        throw new Error(`Conflicting identity for venue ${hit.id.resy}`);

      // Availability-ranked pagination can repeat venues while inventory changes. Keep the first observation.
      if (restaurant.observations.some((observation) => observation.diningDate === capture.day))
        continue;

      if (restaurant.geography === "outside_san_francisco") continue;
      restaurant.observations.push(observeSearch(hit, capture.day, capture.observedAt));
    }
  }

  for (const detail of details.values()) {
    if (detail.observedAt > finishedAt) finishedAt = detail.observedAt;
  }

  for (const restaurant of restaurants.values()) {
    restaurant.observations.sort((a, b) => a.diningDate.localeCompare(b.diningDate));

    if (
      restaurant.eligibility !== "excluded" &&
      restaurant.geography === "san_francisco" &&
      restaurant.observations.some((observation) => observation.status === "available")
    ) {
      restaurant.eligibility = "eligible";
      restaurant.reason =
        "Verified SF street address and public regular dinner inventory in this collection.";
    }
  }

  const coverage = [...pagesByDay].map(([day, result]) => ({
    day,
    pages: result.pages.size,
    expectedPages: result.expectedPages,
    uniqueVenues: result.ids.size,
    expectedVenues: result.expectedVenues,
    duplicateRows: result.rows - result.ids.size,
    reconciled:
      result.stableTotals &&
      result.pages.size === result.expectedPages &&
      result.ids.size === result.expectedVenues &&
      result.rows === result.ids.size &&
      [...result.pages].every((page) => page >= 1 && page <= result.expectedPages),
  }));

  const failures: string[] = [];

  if (files.includes("failure.json")) {
    const failure = failureSchema.parse(
      JSON.parse(await readFile(join(directory, "failure.json"), "utf8")),
    );

    failures.push(`Collection stopped at ${failure.observedAt}: ${failure.message}`);
  }

  const collection = collectionSchema.parse({
    schemaVersion: 1,
    id: manifest.id,
    startedAt: manifest.startedAt,
    finishedAt,
    discoveryUrl: "https://resy.com/cities/san-francisco-ca/search",
    discoveryComplete: false,
    selection: manifest.query
      ? `Search query ${JSON.stringify(manifest.query)}; a convenience pilot, not a citywide ranking.`
      : "All accessible pages of the observed SF search within a 32.2km radius; geographic exclusions retained.",
    collector: "Resy public search API, reconstructed from agent-browser HAR; search-collector-v1",
    procedure: [
      "Replay the browser's public search POST with party_size=2, All Day, page size 20, availability=true (includes zero-slot venues), and Tock inventory included for explicit exclusion.",
      `Observe tomorrow through day ${manifest.days}; collect pages sequentially with one second between requests and no automatic retries.`,
      "Deduplicate venue IDs; verify SF street addresses with GET /3/venue. Retain source text; count only public, non-event, non-pickup slots from 18:00 through 21:00 inclusive.",
      "Keep empty or ambiguous inventory unknown. No automated interpretation of release policies, service calendars, or closures.",
      `Search pagination reconciliation: ${JSON.stringify(coverage)}`,
      "Save allowlisted, Zod-validated responses as immutable receipts. Headers, cookies and reservation tokens are omitted. Assemble receipts without network access; import the resulting collection separately.",
      ...tockListings.values(),
    ],
    limitations: [
      "Search is not an independently verified census of every Resy SF listing, even when returned totals reconcile. Availability-ranked pages can move during collection.",
      "Slot completeness is not guaranteed by an API contract. No-slot dates remain unknown until independently reviewed with release and service evidence.",
      "Official closure, event-only and other-platform policies require human review where inventory does not establish regular dinner access. A positive slot does not prove restaurant popularity.",
      "Prices are not inferred from cancellation fees or template payment flags.",
      ...failures,
      "Uncollected dates and missing venues remain missing, not unavailable. External Tock listings are retained in collection provenance, not assigned invented Resy venue URLs. Nearby-city Resy venues remain excluded restaurant records.",
      ...(coverage.some((day) => !day.reconciled)
        ? ["At least one date's pagination did not reconcile; see per-date coverage."]
        : []),
      ...(coverage.length < manifest.days
        ? [
            "Collection ended before all requested dates were captured; retained receipts are partial.",
          ]
        : []),
    ],
    restaurants: [...restaurants.values()],
  });

  await save(join(directory, "collection.json"), collection);

  return collection;
}

export async function collectSearch(
  directory: string,
  harPath: string,
  days: number,
  query: string,
) {
  const client = await ResySearch.fromHar(harPath);

  const manifest = manifestSchema.parse({
    id: `search-${randomUUID()}`,
    startedAt: new Date().toISOString(),
    days,
    query,
  });

  await mkdir(directory); // Refuse existing directories: a retry is a new immutable snapshot.
  await save(join(directory, "manifest.json"), manifest);
  const anchor = localDate(manifest.startedAt);
  const detailed = new Set<number>();
  const deadline = Date.now() + 60 * 60 * 1000;
  let capturedPages = 0;

  try {
    for (let offset = 1; offset <= days; offset++) {
      const day = addDays(anchor, offset);
      let totalPages = 1;

      for (let page = 1; page <= totalPages; page++) {
        if (Date.now() >= deadline || localDate(new Date().toISOString()) !== anchor) {
          throw new Error("Collection time budget or SF date boundary reached");
        }

        const response = await client.search(day, page, query);

        if (response.meta.page !== page || response.meta.total_pages > 100)
          throw new Error("Unexpected search pagination");
        const observedAt = new Date().toISOString();
        await save(join(directory, `search-${day}-${String(page).padStart(3, "0")}.json`), {
          observedAt,
          day,
          page,
          response,
        });
        capturedPages++;
        totalPages = response.meta.total_pages;
        console.error(
          `${day} page ${page}/${totalPages}: ${response.search.hits.length} listings (${response.meta.total} reported)`,
        );

        for (const hit of response.search.hits) {
          if (
            hit.is_tock_inventory ||
            hit.locality !== "San Francisco" ||
            hit.region !== "CA" ||
            detailed.has(hit.id.resy)
          )
            continue;
          const details: VenueDetails = await client.venue(hit);
          await save(join(directory, `venue-${hit.id.resy}.json`), {
            observedAt: new Date().toISOString(),
            response: details,
          });
          detailed.add(hit.id.resy);
        }
      }
    }
  } catch (error) {
    await save(join(directory, "failure.json"), {
      observedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Collection failed",
    });
    throw error;
  } finally {
    if (capturedPages > 0) {
      const collection = await assembleSearch(directory);
      console.error(
        `Saved ${collection.restaurants.length} restaurant records to ${join(directory, "collection.json")}`,
      );
    }
  }
}
