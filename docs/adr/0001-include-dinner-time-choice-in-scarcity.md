# Include dinner-time choice in scarcity

Date-only scoring treated one opening like many, leaving 38 of 40 restaurants
tied at zero. Keep the seven-day window, but count distinct dinner start times
per night, deduplicating seating types.

```text
night points = 100 with no opening; otherwise 50 / (1 + available times)
score = average across assessed dinner nights
```

This equally weights no-opening frequency and limited choice, with diminishing
returns for additional times. Non-service dates are excluded; unconfirmed dates
still prevent scoring.

The formula is a booking-difficulty heuristic, not an occupancy estimate: total
capacity and occupied slots are unknown. Formula changes require versioning and
rescoring saved observations.
