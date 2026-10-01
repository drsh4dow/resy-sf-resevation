import { Fragment, useState } from "react";
import { ArrowDown, ChevronRight, Search } from "lucide-react";
import { cn } from "cn";

import { DayMark } from "./availability-day.tsx";
import { formatDay, formatScore, formatSnapshot, statusLabel } from "./format.ts";
import type { RankingData, RestaurantRow } from "./ranking.functions.ts";
import { RestaurantDetail } from "./restaurant-detail.tsx";

type Group = "ranked" | "review" | "excluded";

const groups: { id: Group; label: string }[] = [
  { id: "ranked", label: "Ranked" },
  { id: "review", label: "Needs review" },
  { id: "excluded", label: "Excluded" },
];

function groupOf(restaurant: Pick<RestaurantRow, "eligibility" | "score">): Group {
  if (restaurant.eligibility === "excluded") return "excluded";

  return restaurant.score === null ? "review" : "ranked";
}

function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function RankingPage({
  data,
  expandedUrl,
  onToggle,
}: {
  data: RankingData;
  expandedUrl: string | undefined;
  onToggle: (url: string) => void;
}) {
  const [group, setGroup] = useState<Group>(() =>
    data.detail ? groupOf(data.detail.restaurant) : "ranked",
  );

  const [query, setQuery] = useState("");
  const counts: Record<Group, number> = { ranked: 0, review: 0, excluded: 0 };
  let snapshotDate: string | null = null;

  for (const row of data.restaurants) {
    counts[groupOf(row)]++;

    if (!snapshotDate || row.anchorDate > snapshotDate) snapshotDate = row.anchorDate;
  }

  const needle = searchText(query.trim());

  const rows = data.restaurants.filter(
    (row) =>
      groupOf(row) === group && searchText(`${row.name} ${row.address ?? ""}`).includes(needle),
  );

  return (
    <main className="mx-auto max-w-290 px-8 pt-14 pb-20 mobile:px-4 mobile:pt-7.5 mobile:pb-12">
      <header>
        <p className="text-[11px] font-[650] tracking-[0.15em] text-muted-foreground">
          RESY / SAN FRANCISCO
        </p>
        <h1 className="mt-3.5 mb-3 text-[clamp(30px,4vw,44px)] leading-[1.1] font-[620] tracking-[-0.045em]">
          Hard-to-book restaurants
        </h1>
        <p className="text-sm/normal text-muted-foreground mobile:text-xs/[1.8]">
          Party of two{" "}
          <span className="px-1.75 mobile:px-0.75" aria-hidden="true">
            ·
          </span>{" "}
          Dinner, 6–9 p.m.{" "}
          <span className="px-1.75 mobile:px-0.75" aria-hidden="true">
            ·
          </span>{" "}
          San Francisco time
        </p>
        <div className="mt-4.5 flex flex-wrap gap-x-5 gap-y-2 text-xs/normal text-muted-foreground mobile:flex-col mobile:gap-1.5">
          {snapshotDate ? (
            <span>Snapshot: {formatSnapshot(snapshotDate)}</span>
          ) : (
            <span>No data collected yet</span>
          )}
        </div>
        <details className="mt-4.5 mb-8.5 text-[13px] mobile:mb-6.5">
          <summary className="w-fit text-muted-foreground">How the score works</summary>
          <div className="max-w-190 space-y-2.5 pt-2 pb-0.5 leading-[1.7] text-muted-foreground">
            <p>
              <strong className="font-semibold text-foreground">
                Fewer nights and fewer dinner times available mean a higher score.
              </strong>
              {
                " We compare the next seven days for a party of two. Each distinct start time counts once, even if several seating options offer it."
              }
            </p>
            <p>
              Each dinner night contributes 100 points with no opening, or 50 ÷ (1 + available
              times) otherwise: one time gives 25 points; four give 10. The score is the average
              across dinner nights. This gives equal weight to nights without an opening and limited
              time choices.
            </p>
            <p>
              Non-service nights are skipped; unconfirmed dates prevent a score. This is a
              booking-difficulty heuristic, not an occupancy percentage: total tables and occupied
              slots are unknown. Scores approach zero as choices increase; 100 means no openings.
            </p>
          </div>
        </details>
      </header>

      <section aria-label="Restaurant ranking">
        <div className="mb-4 flex items-center justify-between gap-4 mobile:flex-col mobile:items-stretch mobile:gap-3">
          <fieldset className="flex items-center gap-1 mobile:justify-between mobile:gap-0">
            <legend className="sr-only">Restaurant status</legend>
            {groups.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-secondary aria-pressed:bg-primary aria-pressed:text-primary-foreground mobile:px-2.5 mobile:text-xs/normal"
                aria-pressed={group === item.id}
                aria-label={`${item.label}: ${counts[item.id]} restaurants`}
                onClick={() => setGroup(item.id)}
              >
                {item.label}{" "}
                <span className="ml-1.25 text-[11px] tabular-nums">{counts[item.id]}</span>
              </button>
            ))}
          </fieldset>
          <label className="flex w-60 items-center gap-2 rounded-md border border-input bg-card px-2.5 py-2 text-muted-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring mobile:w-full">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search restaurants</span>
            <input
              type="search"
              className="w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Search restaurants"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {group === "review" ? (
          <p className="mb-3.5 max-w-195 text-[13px] leading-[1.6] text-muted-foreground">
            Not enough verified information to score these restaurants.
          </p>
        ) : null}
        {group === "excluded" ? (
          <p className="mb-3.5 max-w-195 text-[13px] leading-[1.6] text-muted-foreground">
            Outside this comparison because of location, service or booking platform.
          </p>
        ) : null}
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full border-collapse text-left text-sm/normal">
            <caption className="sr-only">
              {groups.find((item) => item.id === group)?.label} restaurants. Scored restaurants are
              ordered by scarcity, highest first. Equal scores are ties.
            </caption>
            <thead className="[&_th]:bg-muted [&_th]:px-4.5 [&_th]:py-3.5 [&_th]:text-[11px] [&_th]:font-[550] [&_th]:whitespace-nowrap [&_th]:text-muted-foreground mobile:[&_th]:px-2.25 mobile:[&_th]:py-3 mobile:[&_th]:text-[10px]">
              <tr>
                <th scope="col" className="w-3/5 mobile:w-3/4">
                  Restaurant
                </th>
                <th scope="col" aria-sort={group === "ranked" ? "descending" : undefined}>
                  {"Scarcity "}
                  {group === "ranked" ? (
                    <ArrowDown className="inline align-[-2px]" size={12} aria-hidden="true" />
                  ) : null}
                </th>
                <th scope="col" className="tablet:hidden">
                  Next 7 nights
                </th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:align-middle">
              {rows.map((restaurant) => {
                const expanded = expandedUrl === restaurant.resyUrl;

                return (
                  <Fragment key={restaurant.resyUrl}>
                    <tr
                      className={cn(
                        "hover:bg-background/60 *:px-4.5 *:py-4.25 mobile:*:px-2.25 mobile:*:py-4",
                        expanded && "bg-accent",
                      )}
                    >
                      <td>
                        <button
                          className="inline-flex items-center gap-2 text-left leading-[1.4] font-[560] hover:text-link mobile:gap-1.25 mobile:text-xs/[1.4]"
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => onToggle(restaurant.resyUrl)}
                        >
                          <ChevronRight
                            size={15}
                            aria-hidden="true"
                            className={cn(
                              "shrink-0 text-muted-foreground mobile:w-3",
                              expanded && "rotate-90",
                            )}
                          />
                          <span>{restaurant.name}</span>
                        </button>
                        {group !== "ranked" ? (
                          <p className="mt-1.25 ml-5.75 line-clamp-2 text-[11px] leading-normal text-muted-foreground mobile:ml-4.25 mobile:text-[10px]">
                            {restaurant.eligibility === "eligible"
                              ? restaurant.scoreReason
                              : restaurant.eligibilityReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="w-31 mobile:w-17.5">
                        {restaurant.score === null ? (
                          <span className="text-muted-foreground">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Not scored</span>
                          </span>
                        ) : (
                          <>
                            <span className="text-[22px] leading-none font-semibold tracking-[-0.04em] tabular-nums mobile:text-xl/none">
                              {formatScore(restaurant.score)}
                            </span>
                            <div
                              className="mt-2 h-0.75 w-17.5 overflow-hidden rounded-xs bg-track mobile:w-10.5"
                              aria-hidden="true"
                            >
                              <span
                                className="block h-full bg-foreground"
                                style={{ width: `${restaurant.score}%` }}
                              />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="tablet:hidden">
                        <div className="grid grid-cols-[repeat(7,14px)] gap-1">
                          {restaurant.week.map((day) => (
                            <DayMark
                              key={day.diningDate}
                              status={day.status}
                              label={`${formatDay(day.diningDate)}: ${statusLabel[day.status]}`}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                    {expanded && data.detail?.restaurant.resyUrl === restaurant.resyUrl ? (
                      <tr className="bg-accent">
                        <td colSpan={3} className="px-7 pt-6 pb-7 mobile:px-3 mobile:py-4.5">
                          <RestaurantDetail key={restaurant.resyUrl} detail={data.detail} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {rows.length === 0 ? (
                <tr className="hover:bg-background/60">
                  <td
                    colSpan={3}
                    className="h-32.5 px-4.5 py-4.25 text-center text-muted-foreground mobile:px-2.25 mobile:py-4"
                  >
                    {query
                      ? "No matching restaurants in this group. Try another name or status."
                      : "No restaurants in this group yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex justify-between gap-2.5 py-3.5 text-[11px] text-muted-foreground mobile:flex-col mobile:text-[10px] mobile:leading-[1.7]">
          <span>
            {rows.length} restaurant{rows.length === 1 ? "" : "s"}
            {query ? " matching" : " shown"}
          </span>
        </footer>
      </section>
    </main>
  );
}
