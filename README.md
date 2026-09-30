# Resy SF reservation scarcity

A local SQLite/Drizzle dataset for prioritizing San Francisco restaurants that
are hard to access through public Resy reservations for two. Zod validates
collection artifacts before import; source evidence and history are preserved.

## Run

```sh
vp install
vp run data --help
vp run data migrate
for file in data/collections/*.json; do
  vp run data import "$file" || break
done
vp run data report
```

`DATABASE_URL` selects the SQLite file, defaulting to `dev.db`; configuration also
reads `.env.local` and `.env`. The checked-in `dev.db` is the exercise snapshot
for review. Collection JSON and Drizzle migrations reproduce it. Other databases
and SQLite sidecars remain ignored. Exact re-imports are no-ops; changed evidence
needs a new collection ID. Imports are atomic per artifact.

## Score

Dinner means a public regular reservation for two starting 18:00–21:00 inclusive
in San Francisco local time. Public tasting menus, counter seats, and outdoor
tables count; events, waitlists, and card/member-only offers do not.

Collect tomorrow through day 28. Compare restaurants over the same days 1–7 for
the headline score, with separate supporting bands for days 8–14, 15–21, and
22–28:

```text
score = 100 × unavailable dinner dates / assessed dinner dates
assessed = available dates + unavailable dates
```

Dates have equal weight. One qualifying slot makes a date available; slot counts
do not reveal table capacity. Confirmed non-service dates leave the denominator.
Publish a band only if every date is assessed or confirmed non-service, with at
least one assessed date. Missing, unknown, unreleased, or failed dates produce a
null score. Closed, other-platform, event-only, and unresolved venues remain
unscored. An empty calendar alone does not establish released, booked inventory.

The fixed 0–100 scale does not change when the subset grows. A common headline
week prevents short booking windows from earning points for unreleased weeks.
Show denominators and policies because service schedules still differ. Higher
means observed scarcity, not proven demand, occupancy, prestige, or a forecast.

The `restaurant_ranking` view selects each venue's latest completed collection;
`report` sorts scores descending, nulls last, then names without breaking score
ties. Show observation intervals: the view can mix collection dates and never
silently substitutes older complete scores for newer incomplete captures.

## Initial dataset: September 30, 2026

**No publishable headline scores yet.** The database contains 14 discovered
listings, three confirmed SF dinner venues, and 32 dated observations. Discovery
covered the initial Climbing, Top Rated, and New on Resy sections without
pagination. This depth-first convenience subset is not a citywide ranking.

An early Esme capture recorded 28 dates: three available, four Monday closures,
and 21 unknown because its two-person release policy was unestablished. Later
inventory preflights returned HTTP 500 across Esme, Rintaro, and Flour + Water,
also reproduced by the parent browser session. Expansion stopped rather than
retrying broadly or calling failures booked. The underlying cause is unresolved.

[Collection artifacts](data/collections/) contain source quotes, timestamps,
selection rules, each scout's procedure, and limitations. Use `data inspect`
(see `--help`) for full stored evidence. Resume with a new snapshot after a
representative browser session can load inventory successfully. The importer is
rerunnable; unattended browser collection and forecasting are not implemented.

[CONTEXT.md](CONTEXT.md) defines the domain terms.

## Verify

```sh
vp check
vp test
vp build
```

Tests use migrated in-memory SQLite databases, not the collected dataset.
