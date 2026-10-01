# Resy SF · Reservation scarcity

A ranked comparison of public Resy dinner access for two, with available dates
and dinner-time choices behind each score. It measures reservation
scarcity, not occupancy or booking volume.

## Run the page

Install [Vite+](https://viteplus.dev/guide/), then run from the repository root:

```sh
vp install
vp dev --port 3000
```

Open **<http://localhost:3000>**. The checked-in `dev.db` is ready to use;
no Resy credentials, collection run, or database setup is needed.

Expand a restaurant to inspect its 28-day calendar and available dinner times.
**Needs review** holds incomplete or unresolved venues; **Excluded** explains
out-of-scope listings. Search filters the selected group. Expanded rows have
shareable URLs.

## The snapshot

Collected **September 30, 2026**, for **October 1–28**. Collection is stopped;
the page reads saved observations, not live inventory.

| Latest classification               | Restaurants |
| :---------------------------------- | ----------: |
| Scored                              |          40 |
| Needs review                        |          79 |
| Excluded                            |          75 |
| Total native Resy listings retained |         194 |

The highest headline scores are **7 Adams: 75.2** (5/7 dates without an opening)
and **Izakaya Rintaro: 67.9** (4/7). The other 38 scores range from 3.6 to 13.3,
reflecting their available dinner-time choices. These are leaders within the
scored subset, not a citywide claim.

Broad search found 193 native Resy listings across 28 dates. City-list discovery
added Esin, excluded by its Danville address. Another 141 external Tock listings
remain in provenance, not the ranking. Twelve candidates received policy
review, prioritizing ambiguous eligibility and potentially scarce inventory.
This uses the exercise's subset allowance; unresolved cases remain unscored.

## Scoring

A qualifying opening is a public, regular reservation for **two**, starting
**18:00–21:00 inclusive**, in `America/Los_Angeles`. Public tasting menus,
counter seats, and outdoor tables count; events, waitlists, takeout, and
card/member-only inventory do not.

For each assessed dinner date, let `n` be its distinct available start times:

```text
night points = 100 if n = 0; otherwise 50 / (1 + n)
score = mean(night points)
```

This is an equal-weight blend of the proportion of nights without openings and
mean limited choice, `1 / (1 + n)`. The reciprocal gives diminishing returns for
extra times without inventing total capacity. The weights are a heuristic, not
calibrated against bookings or occupancy. One time earns 25 points, four earn
10, and no opening earns 100.

- The headline compares days 1–7 after observation. Later seven-day bands remain
  in the data export but are not shown on the page.
- Each assessed date has equal weight. Seating types at the same start time
  count once. Neither available times nor their sum reveals table capacity.
- Confirmed non-service dates leave the denominator. Every date must be
  accounted for, with at least one assessed service date, to publish a score.
- Unknown, missing, unreleased, or failed dates produce a **null score**.
  Closed, event-only, other-platform-only, and out-of-city venues cannot earn
  scarcity points.

The fixed 0–100 scale does not change as the subset grows. Scores approach zero
as choices increase; 100 means no openings on any assessed date. Total inventory
and occupied slots are unknown. The score does not predict future demand.

## Process

1. Capture successful public search requests in a browser, then replay all-day,
   party-of-two searches sequentially across the horizon.
2. Validate and sanitize responses with Zod. Check venue addresses rather than
   trusting Resy's broad SF discovery region.
3. Keep empty results unknown until release policies, service schedules, and
   regular dinner eligibility support a no-opening assessment.
4. Import immutable collections into SQLite and compute scores. Always use a
   restaurant's latest collection, never an older, more complete score.

[Collection artifacts](data/collections/) preserve timestamps, source evidence,
procedures, selection rules, and limitations. Credential-bearing HARs are not
included. [CONTEXT.md](CONTEXT.md) defines the domain terms.

## Caveats

Resy's inventory-loading failures and inconsistent discovery results limited
what we could verify within the take-home assignment's time window:

- Inventory requests to `/4/find` and `/4/venue/calendar` failed with HTTP 500,
  including browser `OPTIONS` preflights. Esme, Rintaro, and Flour + Water pages
  loaded venue information but not reservation inventory; waits timed out.
  Separate browser sessions reproduced the failures. Their cause remains
  unresolved, so we recorded collection errors, not sold-out dates.
- A successful browser capture allowed collection through
  `POST /3/venuesearch/search` instead. This recovered the 28-day snapshot,
  but search completeness is unproven. Cards display only some returned slots,
  and time filters narrow the results. We used all-day response data rather
  than counting visible buttons; reviewed negatives are not certified sellouts.
- Pagination totals did not always reconcile. On October 1, all 17 pages
  returned 332 unique listings against 334 advertised. Known venues also went
  missing from individual dates or name searches. Those omissions remain
  missing or unknown, never unavailable.
- Eligibility required manual checks: SF discovery included nearby cities and
  Tock inventory, while surviving Resy pages sometimes conflicted with official
  booking links or release policies. Empty inventory alone could not distinguish
  scarcity from another platform, events, non-service, or unreleased dates.

Diagnosing failures, validating the search alternative, and checking policies
used time that otherwise could have expanded coverage. We stopped after the
28-day search capture and targeted policy review, leaving unresolved restaurants
in **Needs review** rather than forcing a score. The
[failure log](data/collections/2026-09-30-inventory-failures.json) and
[search snapshot](data/collections/2026-09-30-search-snapshot.json) retain the
observations and pagination counts.

Published schedules may miss private closures, and unstated release timezones
are interpreted as SF local time. Policy reviews reuse observations and are
not independent samples of persistent scarcity.

## Consume or rebuild the data

Export JSON without the task runner's banner:

```sh
vp exec tsx src/scarcity/cli.ts report > /tmp/resy-ranking.json
```

Or query the `restaurant_ranking` view in `dev.db`:

```sql
SELECT name, ROUND(score, 1) AS score, unavailable, assessed,
       eligibility, score_reason, collection_id
FROM restaurant_ranking
ORDER BY score DESC, name;
```

`collections`, `restaurant_snapshots`, `dinner_observations`, and
`scarcity_scores` retain provenance, history, date-level evidence, and all four
bands. See `vp run data --help` for schema, validation, and inspection commands.

After a scoring change, recompute saved scores without contacting Resy:

```sh
vp run data rescore
```

Rescoring atomically replaces derived scores and updates their version, without
changing source observations or import hashes. It is safe to repeat after an
interruption. The checked-in database uses `dinner-choice-scarcity-v2`.

Rebuild in a separate database, without contacting Resy:

```sh
(
  set -e
  export DATABASE_URL=review.db
  vp run data migrate
  for file in data/collections/*.json; do
    vp run data import "$file"
  done
  vp run data report
)
```

`DATABASE_URL` is a SQLite file path, defaulting to `dev.db`; `.env.local` and
`.env` also apply. Imports are atomic; exact re-imports are no-ops. Corrections
need a **new collection ID**, retaining evidence and original observation times.

## Review and adjust

- [Scoring](src/scarcity/score.ts) and [validation](src/scarcity/model.ts) own
  the methodology; [storage](src/scarcity/store.ts) owns imports and queries.
- [Collection](src/scarcity/collect.ts) owns capture and offline assembly.
- [UI](src/ranking/) and [styles](src/styles.css) own presentation.
  The page is read-only; change assessments through collection imports.

```sh
vp check
vp test
vp build
```

Tests use migrated in-memory SQLite. Run the production build with
`node .output/server/index.mjs` from the repository root.

## Coding-agent conversations

[`.session/`](.session/) contains the raw Pi session files, copied without
modification. The [main conversation thread][main-session] is the largest
session file. The other files contain additional conversations.

[main-session]: .session/2026-09-30T22-22-28-408Z_01a0f469-7a37-701f-a34f-24169719f5df.jsonl
