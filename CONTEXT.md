# Resy SF reservation scarcity

This analysis helps prioritize San Francisco restaurants that are hard to access
through public Resy reservations for two. Reservation scarcity is a signal of
exclusivity, not a direct measurement of booking volume or demand.

## Language

**Reservation scarcity**:
The difficulty of finding a publicly available Resy reservation for a party of
two within the comparison's dinner window.
_Avoid_: Occupancy, booking volume, proven demand

**San Francisco restaurant**:
A restaurant physically within San Francisco city limits. Appearance on Resy's
San Francisco discovery page alone does not establish geographic eligibility.

**Dinner window**:
The target reservation start-time window of 6–9 p.m. in San Francisco local time.

**Comparison horizon**:
The next 28 calendar dates after the observation's local date. It excludes today.

**Regular dinner reservation**:
A publicly bookable dinner reservation, including recurring tasting menus and
reservable outdoor or counter seating. Special events, waitlists, notifications,
and offers restricted by membership or card eligibility do not qualify.

**Available dinner date**:
A date with at least one regular dinner reservation for two starting within the
dinner window.

**Available dinner time**:
A distinct reservation start time within the dinner window, counted once per
night across seating types. It measures choice, not the number of free tables.

**Booking window**:
The period for which a restaurant has released reservations at the time of an
observation. Dates beyond that window are unreleased, not sold out.

**Assessable dinner date**:
A date within the comparison horizon established as released for regular dinner
reservations, with sufficient evidence to determine availability. Non-service
days, unreleased dates, and uncertain observations do not count as booked dates.

**Scarcity score**:
A fixed-scale booking-difficulty heuristic combining nights without openings
and limited dinner-time choices with equal weight. Higher means harder access;
excluded and unresolved restaurants have no score, rather than a score of zero.
_Avoid_: Popularity score, occupancy rate

**Headline score**:
The scarcity score for days 1–7 after the observation date. It is publishable
only when every date in that week is either assessed or confirmed non-service,
and at least one date offers regular dinner service.

**Supporting band**:
One of the later seven-day comparisons: days 8–14, 15–21, or 22–28. Each band
uses the same scoring and completeness rules as the headline score.

**Unavailable dinner date**:
An assessed date without a qualifying public reservation despite evidence of
regular dinner service and released inventory. This does not establish actual
occupancy or the reason inventory is unavailable.

**Excluded restaurant**:
A discovered restaurant outside the comparison's scope, with a recorded reason,
such as closure, geography, lunch-only service, or use of Resy only for events.

**Unresolved restaurant**:
A restaurant for which the available evidence does not establish whether regular
Resy dinner reservations can be assessed. Missing availability alone does not
establish that a restaurant is fully booked.

**Observation time**:
The instant at which reservation availability was checked, distinct from the
future dining date being checked.

**Dining date**:
The San Francisco local calendar date on which a reservation would take place.

**Lead time**:
The number of local calendar days between the observation date and dining date.

**Collection snapshot**:
A timestamped set of observations gathered during a collection run. It describes
availability observed during that run, not necessarily at one simultaneous
instant or over a sustained period.

**Persistent scarcity**:
Reservation scarcity supported by observations across successive collection
snapshots. A single snapshot does not establish persistence or predict future
availability.
