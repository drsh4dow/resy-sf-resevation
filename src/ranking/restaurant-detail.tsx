import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { addDays } from "../scarcity/model.ts";
import { availabilityDayClasses, DayMark } from "./availability-day.tsx";
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
    <article aria-label={`${restaurant.name} availability`}>
      <header className="flex flex-wrap items-center justify-between gap-2.5 text-xs/normal text-muted-foreground">
        <p>{restaurant.address ?? "Address not verified"}</p>
        <a
          className="inline-flex items-center gap-0.75 text-link hover:underline"
          href={restaurant.resyUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open on Resy <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </header>
      {restaurant.score === null ? (
        <p className="mt-3.5 border-l-2 border-warning-border bg-warning px-3 py-2.5 text-[13px] leading-[1.6] text-warning-emphasis">
          {restaurant.eligibility === "eligible"
            ? restaurant.scoreReason
            : restaurant.eligibilityReason}
        </p>
      ) : null}
      {showCalendar ? (
        <div className="mt-6 grid grid-cols-[minmax(250px,360px)_minmax(0,1fr)] gap-11 tablet:gap-7 mobile:grid-cols-1 mobile:gap-6">
          <section aria-label="Dinner availability by date">
            <h2 className="mb-4 text-[13px] font-[550]">
              {formatDay(days[0].diningDate)} – {formatDay(days[27].diningDate)}
            </h2>
            <div className="grid grid-cols-7 gap-1.5">
              {days.slice(0, 7).map((day) => (
                <span
                  className="pb-0.5 text-center text-[11px] text-muted-foreground"
                  key={day.diningDate}
                >
                  {formatWeekday(day.diningDate)}
                </span>
              ))}
              {days.map((day) => (
                <button
                  key={day.diningDate}
                  type="button"
                  className={availabilityDayClasses(day.status, "calendar")}
                  data-status={day.status}
                  aria-pressed={day.diningDate === selectedDate}
                  aria-label={`${formatDay(day.diningDate)}: ${statusLabel[day.status]}`}
                  onClick={() => setSelectedDate(day.diningDate)}
                >
                  {Number(day.diningDate.slice(-2))}
                </button>
              ))}
            </div>
            <ul className="mt-3.75 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-[11px] text-muted-foreground *:flex *:items-center *:gap-1.25">
              <li>
                <DayMark status="available" />
                Available
              </li>
              <li>
                <DayMark status="unavailable" />
                No opening
              </li>
              <li>
                <DayMark status="non_service" />
                No service
              </li>
              <li>
                <DayMark status="unknown" />
                Unconfirmed
              </li>
            </ul>
          </section>
          <section aria-live="polite">
            <h2 className="text-[15px] font-semibold">{formatDay(selectedDate)}</h2>
            {selected?.status === "available" ? (
              <>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {selected.times.length} dinner time{selected.times.length === 1 ? "" : "s"}{" "}
                  available
                </p>
                <ul
                  className="mt-4 flex list-none flex-wrap gap-2"
                  aria-label="Available dinner times"
                >
                  {selected.times.map((time) => (
                    <li
                      className="rounded-sm border bg-card px-2.5 py-1.5 text-[13px] tabular-nums"
                      key={time}
                    >
                      {formatDinnerTime(time)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {statusLabel[selectedStatus]}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </article>
  );
}
