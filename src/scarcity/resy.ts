import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

export const SEARCH_URL = "https://api.resy.com/3/venuesearch/search";

const identity = {
  id: z.object({ resy: z.number().int().positive() }),
  name: z.string().min(1),
  url_slug: z.string().regex(/^[\w-]+$/),
  locality: z.string(),
  region: z.string(),
  location: z.object({ url_slug: z.string().regex(/^[\w-]+$/) }),
};

const slotSchema = z.object({
  date: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  }),
  config: z.object({ type: z.string().min(1) }),
  template: z.object({ id: z.number().int() }),
  is_global_dining_access: z.boolean(),
  exclusive: z.object({ id: z.number().int(), is_eligible: z.boolean() }),
});

const nativeHitSchema = z.object({
  ...identity,
  is_tock_inventory: z.literal(false),
  availability: z.object({
    slots: z.array(slotSchema),
    templates: z.record(
      z.string(),
      z.object({
        is_event: z.number().nullable().optional(),
        is_pickup: z.number().nullable().optional(),
      }),
    ),
    // Keep error names, never opaque error payloads or reservation tokens.
    gating_errors: z
      .record(z.string(), z.unknown())
      .transform((errors) => Object.fromEntries(Object.keys(errors).map((name) => [name, true]))),
    status: z.string().nullable(),
  }),
});

export const searchResponseSchema = z.object({
  meta: z.object({
    page: z.number().int().positive(),
    per_page: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    total_pages: z.number().int().nonnegative(),
  }),
  search: z.object({
    hits: z.array(
      z.discriminatedUnion("is_tock_inventory", [
        nativeHitSchema,
        z.object({ ...identity, is_tock_inventory: z.literal(true) }),
      ]),
    ),
  }),
});

export const venueResponseSchema = z.object({
  id: z.object({ resy: z.number().int().positive() }),
  name: z.string(),
  is_active: z.number(),
  location: z.object({
    address_1: z.string().nullable(),
    locality: z.string(),
    region: z.string(),
    postal_code: z.string().nullable(),
    country_iso3166: z.string(),
  }),
  content: z.array(z.object({ name: z.string(), body: z.string().trim().nullable() })),
});

export type SearchHit = z.output<typeof searchResponseSchema>["search"]["hits"][number];

export type NativeSearchHit = Extract<SearchHit, { is_tock_inventory: false }>;

export type VenueDetails = z.output<typeof venueResponseSchema>;

export function venueUrl(hit: NativeSearchHit): string {
  return `https://resy.com/cities/${hit.location.url_slug}/venues/${hit.url_slug}`;
}

export function searchRequest(day: string, page: number, query: string) {
  return {
    availability: true,
    include_tock_inventory: true,
    page,
    per_page: 20,
    slot_filter: { day, party_size: 2 },
    types: ["venue"],
    order_by: "availability",
    geo: { latitude: 37.7577, longitude: -122.4376, radius: 32200 },
    query,
  };
}

const harSchema = z.object({
  log: z.object({
    entries: z.array(
      z.object({
        request: z.object({
          method: z.string(),
          url: z.string(),
          headers: z.array(z.object({ name: z.string(), value: z.string() })),
        }),
        response: z.object({ status: z.number() }),
      }),
    ),
  }),
});

/** Credentials stay in memory. Only public, allowlisted response fields leave this client. */
export class ResySearch {
  private constructor(private readonly headers: Headers) {}

  static async fromHar(path: string): Promise<ResySearch> {
    const har = harSchema.parse(JSON.parse(await readFile(path, "utf8")));

    const entry = har.log.entries.find(
      ({ request, response }) =>
        request.url === SEARCH_URL && request.method === "POST" && response.status === 200,
    );

    if (!entry) throw new Error("HAR must contain a successful Resy search POST");

    const headers = new Headers();

    const allowed = new Set([
      "accept",
      "accept-language",
      "authorization",
      "content-type",
      "referer",
      "user-agent",
      "x-origin",
      "x-session-id",
    ]);

    for (const { name, value } of entry.request.headers) {
      if (allowed.has(name.toLowerCase())) headers.set(name, value);
    }

    if (!headers.has("authorization")) throw new Error("Search HAR has no authorization header");

    return new ResySearch(headers);
  }

  private async request(url: string, body?: ReturnType<typeof searchRequest>): Promise<Response> {
    // Sequential requests, at least one second apart; no automatic retries on blocks or failures.
    await delay(1000);

    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) throw new Error(`Resy returned HTTP ${response.status}`);

    return response;
  }

  async search(day: string, page: number, query: string) {
    const response = await this.request(SEARCH_URL, searchRequest(day, page, query));

    return searchResponseSchema.parse(await response.json());
  }

  async venue(hit: NativeSearchHit): Promise<VenueDetails> {
    const query = new URLSearchParams({
      url_slug: hit.url_slug,
      location: hit.location.url_slug,
    });

    const result = await this.request(`https://api.resy.com/3/venue?${query}`);
    const response = venueResponseSchema.parse(await result.json());

    if (response.id.resy !== hit.id.resy) throw new Error("Venue detail ID does not match search");

    return response;
  }
}
