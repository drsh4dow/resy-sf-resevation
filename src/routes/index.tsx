import { createFileRoute, useRouter } from "@tanstack/react-router";

import { RankingPage } from "../ranking/ranking-page.tsx";
import { getRankingData, rankingSearchSchema } from "../ranking/ranking.functions.ts";

export const Route = createFileRoute("/")({
  validateSearch: rankingSearchSchema,
  loaderDeps: ({ search }) => ({ venue: search.venue }),
  loader: ({ deps }) => getRankingData({ data: deps }),
  component: RankingRoute,
  errorComponent: RankingError,
  pendingComponent: () => (
    <main className="ranking-page">
      <p>Loading restaurant observations…</p>
    </main>
  ),
});

function RankingRoute() {
  const data = Route.useLoaderData();
  const { venue } = Route.useSearch();
  const navigate = Route.useNavigate();

  function toggle(url: string) {
    void navigate({
      search: { venue: url === venue ? undefined : url },
      replace: true,
      resetScroll: false,
    });
  }

  return <RankingPage data={data} expandedUrl={venue} onToggle={toggle} />;
}

function RankingError() {
  const router = useRouter();

  return (
    <main className="ranking-page">
      <h1>Restaurant data could not load</h1>
      <p>Check that the local database is available and its migrations have been applied.</p>
      <button type="button" className="retry-button" onClick={() => void router.invalidate()}>
        Try again
      </button>
    </main>
  );
}
