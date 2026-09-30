import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { addDays } from "../scarcity/model.ts";
import type { Evidence } from "../scarcity/model.ts";
import { formatDay, formatInstant, formatScore, formatWeekday, statusLabel } from "./format.ts";
import type { DayStatus } from "./format.ts";
import type { RestaurantDetailData } from "./ranking.functions.ts";

function SourceNotes({ evidence }: { evidence: Evidence[] }) {
  const unique = new Map(
    evidence.map((item) => [`${item.url}\n${item.observedAt}\n${item.quote}`, item]),
  );

  return (
    <ul className="source-notes">
      {[...unique].map(([key, item]) => {
        const url = new URL(item.url);

        return (
          <li key={key}>
            <blockquote>{item.quote}</blockquote>
            <p>
              {url.hostname === "api.resy.com" ? (
                <span>Captured Resy API response</span>
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer">
                  {url.hostname} <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              )}{" "}
              <span>· {formatInstant(item.observedAt)}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function RestaurantDetail({ detail }: { detail: RestaurantDetailData }) {
  const { restaurant, observations } = detail;
  const [selectedDate, setSelectedDate] = useState(addDays(restaurant.anchorDate, 1));
  const byDate = new Map(observations.map((observation) => [observation.diningDate, observation]));

  const days = Array.from({ length: 28 }, (_, index) => {
    const diningDate = addDays(restaurant.anchorDate, index + 1);
    const status: DayStatus = byDate.get(diningDate)?.status ?? "missing";

    return { diningDate, status };
  });

  const selected = byDate.get(selectedDate);
  const selectedStatus = selected?.status ?? "missing";
  const sourceEvidence = selected ? [...selected.evidence] : [];

  if (selected?.status === "unavailable")
    sourceEvidence.push(selected.releaseEvidence, selected.serviceEvidence);
  const showCalendar = restaurant.eligibility !== "excluded" && observations.length > 0;

  return (
    <article className="restaurant-detail" aria-label={`${restaurant.name} evidence`}>
      <header className="detail-heading">
        <p>{restaurant.address ?? "Street address not verified"}</p>
        <a href={restaurant.resyUrl} target="_blank" rel="noreferrer">
          Open on Resy <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </header>
      {restaurant.score === null ? (
        <p className="review-reason">
          {restaurant.eligibility === "eligible"
            ? restaurant.scoreReason
            : restaurant.eligibilityReason}
        </p>
      ) : null}
      {showCalendar ? (
        <div className="detail-grid">
          <section aria-label="Dinner availability by date">
            <div className="band-scores">
              {detail.bands.map((band) => (
                <div key={band.startDay}>
                  <span>
                    Days {band.startDay}–{band.endDay}
                  </span>
                  <strong>{band.score === null ? "—" : formatScore(band.score)}</strong>
                  <small>
                    {band.score === null
                      ? "Incomplete"
                      : `${band.unavailable}/${band.assessed} no opening`}
                  </small>
                </div>
              ))}
            </div>
            <div className="dinner-calendar">
              {days.slice(0, 7).map((day) => (
                <span className="weekday-label" key={day.diningDate}>
                  {formatWeekday(day.diningDate)}
                </span>
              ))}
              {days.map((day) => (
                <button
                  key={day.diningDate}
                  type="button"
                  data-status={day.status}
                  aria-pressed={day.diningDate === selectedDate}
                  aria-label={`${formatDay(day.diningDate)}: ${statusLabel[day.status]}`}
                  onClick={() => setSelectedDate(day.diningDate)}
                >
                  {Number(day.diningDate.slice(-2))}
                </button>
              ))}
            </div>
            <ul className="calendar-legend">
              <li>
                <span className="day-mark" data-status="available" />
                Available
              </li>
              <li>
                <span className="day-mark" data-status="unavailable" />
                No opening
              </li>
              <li>
                <span className="day-mark" data-status="non_service" />
                No service
              </li>
              <li>
                <span className="day-mark" data-status="unknown" />
                Unknown / unchecked
              </li>
            </ul>
          </section>
          <section className="date-evidence" aria-live="polite">
            <h2>
              {formatDay(selectedDate)} <span>{statusLabel[selectedStatus]}</span>
            </h2>
            {selected?.status === "available" ? (
              <p>
                Observed dinner starts:{" "}
                {[...new Set(selected.slots.map((slot) => slot.time))].join(", ")}. Local time,
                party of two.
              </p>
            ) : null}
            {selectedStatus === "missing" ? (
              <p>
                This date was not captured for this restaurant. It is not counted as unavailable.
              </p>
            ) : null}
            {selectedStatus === "unknown" ? (
              <p>
                The evidence does not establish availability or a released, unavailable dinner date.
                This date prevents a score for its week.
              </p>
            ) : null}
            {selectedStatus === "unavailable" ? (
              <p>
                No qualifying public dinner opening was observed. Release and regular service are
                supported by the sources below; this does not prove full occupancy.
              </p>
            ) : null}
            {selected ? (
              <p className="observed-at">Observed {formatInstant(selected.observedAt)}</p>
            ) : null}
            {sourceEvidence.length > 0 ? (
              <details className="evidence-disclosure">
                <summary>Evidence for this date</summary>
                <SourceNotes evidence={sourceEvidence} />
              </details>
            ) : null}
          </section>
        </div>
      ) : null}
      {restaurant.bookingPolicy ? (
        <p className="booking-policy">
          <strong>Booking policy.</strong> {restaurant.bookingPolicy}
        </p>
      ) : null}
      <details className="evidence-disclosure">
        <summary>Restaurant sources &amp; collection notes</summary>
        <SourceNotes evidence={detail.evidence} />
        <p className="collection-selection">{detail.collection.selection}</p>
        <ul className="collection-limitations">
          {detail.collection.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
