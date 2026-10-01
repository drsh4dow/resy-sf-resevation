import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { addDays } from "../scarcity/model.ts";
import { formatDay, formatDinnerTime, formatWeekday, statusLabel } from "./format.ts";
import type { DayStatus } from "./format.ts";
import type { RestaurantDetailData } from "./ranking.functions.ts";

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
  const showCalendar = restaurant.eligibility !== "excluded" && observations.length > 0;

  return (
    <article className="restaurant-detail" aria-label={`${restaurant.name} availability`}>
      <header className="detail-heading">
        <p>{restaurant.address ?? "Address not verified"}</p>
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
            <h2 className="calendar-heading">
              {formatDay(days[0].diningDate)} – {formatDay(days[27].diningDate)}
            </h2>
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
                Unconfirmed
              </li>
            </ul>
          </section>
          <section className="date-availability" aria-live="polite">
            <h2>{formatDay(selectedDate)}</h2>
            {selected?.status === "available" ? (
              <>
                <p>
                  {selected.times.length} dinner time{selected.times.length === 1 ? "" : "s"}{" "}
                  available
                </p>
                <ul className="dinner-times" aria-label="Available dinner times">
                  {selected.times.map((time) => (
                    <li key={time}>{formatDinnerTime(time)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{statusLabel[selectedStatus]}</p>
            )}
          </section>
        </div>
      ) : null}
    </article>
  );
}
