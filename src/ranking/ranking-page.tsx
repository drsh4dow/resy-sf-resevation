import { Fragment, useState } from "react";
import { ArrowDown, ChevronRight, Search } from "lucide-react";

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
    <main className="ranking-page">
      <header className="ranking-header">
        <p className="eyebrow">RESY / SAN FRANCISCO</p>
        <h1>Hard-to-book restaurants</h1>
        <p className="scope">
          Party of two <span aria-hidden="true">·</span> Dinner, 6–9 p.m.{" "}
          <span aria-hidden="true">·</span> San Francisco time
        </p>
        <div className="snapshot-line">
          {snapshotDate ? (
            <span>Snapshot: {formatSnapshot(snapshotDate)}</span>
          ) : (
            <span>No data collected yet</span>
          )}
        </div>
        <details className="method">
          <summary>How the score works</summary>
          <div>
            <p>
              <strong>Fewer nights and fewer dinner times available mean a higher score.</strong> We
              compare the next seven days for a party of two. Each distinct start time counts once,
              even if several seating options offer it.
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
        <div className="table-tools">
          <fieldset className="status-filters">
            <legend className="sr-only">Restaurant status</legend>
            {groups.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={group === item.id}
                aria-label={`${item.label}: ${counts[item.id]} restaurants`}
                onClick={() => setGroup(item.id)}
              >
                {item.label} <span>{counts[item.id]}</span>
              </button>
            ))}
          </fieldset>
          <label className="restaurant-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search restaurants</span>
            <input
              type="search"
              placeholder="Search restaurants"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {group === "review" ? (
          <p className="group-note">Not enough verified information to score these restaurants.</p>
        ) : null}
        {group === "excluded" ? (
          <p className="group-note">
            Outside this comparison because of location, service or booking platform.
          </p>
        ) : null}
        <div className="ranking-table-wrap">
          <table className="ranking-table">
            <caption className="sr-only">
              {groups.find((item) => item.id === group)?.label} restaurants. Scored restaurants are
              ordered by scarcity, highest first. Equal scores are ties.
            </caption>
            <thead>
              <tr>
                <th scope="col">Restaurant</th>
                <th scope="col" aria-sort={group === "ranked" ? "descending" : undefined}>
                  Scarcity {group === "ranked" ? <ArrowDown size={12} aria-hidden="true" /> : null}
                </th>
                <th scope="col" className="week-column">
                  Next 7 nights
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((restaurant) => {
                const expanded = expandedUrl === restaurant.resyUrl;

                return (
                  <Fragment key={restaurant.resyUrl}>
                    <tr className={expanded ? "expanded-row" : undefined}>
                      <td>
                        <button
                          className="restaurant-name"
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => onToggle(restaurant.resyUrl)}
                        >
                          <ChevronRight
                            size={15}
                            aria-hidden="true"
                            className={expanded ? "chevron-open" : undefined}
                          />
                          <span>{restaurant.name}</span>
                        </button>
                        {group !== "ranked" ? (
                          <p className="row-reason">
                            {restaurant.eligibility === "eligible"
                              ? restaurant.scoreReason
                              : restaurant.eligibilityReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="score-cell">
                        {restaurant.score === null ? (
                          <span className="unscored">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Not scored</span>
                          </span>
                        ) : (
                          <>
                            <span className="score-number">{formatScore(restaurant.score)}</span>
                            <div className="score-track" aria-hidden="true">
                              <span style={{ width: `${restaurant.score}%` }} />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="week-column">
                        <div className="week-strip">
                          {restaurant.week.map((day) => (
                            <span
                              key={day.diningDate}
                              className="day-mark"
                              data-status={day.status}
                              title={`${formatDay(day.diningDate)}: ${statusLabel[day.status]}`}
                            >
                              <span className="sr-only">
                                {formatDay(day.diningDate)}: {statusLabel[day.status]}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {expanded && data.detail?.restaurant.resyUrl === restaurant.resyUrl ? (
                      <tr className="detail-row">
                        <td colSpan={3}>
                          <RestaurantDetail key={restaurant.resyUrl} detail={data.detail} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-table">
                    {query
                      ? "No matching restaurants in this group. Try another name or status."
                      : "No restaurants in this group yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="table-footer">
          <span>
            {rows.length} restaurant{rows.length === 1 ? "" : "s"}
            {query ? " matching" : " shown"}
          </span>
        </footer>
      </section>
    </main>
  );
}
