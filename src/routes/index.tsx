import { createFileRoute, useRouter } from "@tanstack/react-router";

import { Button } from "../components/ui/button.tsx";
import { RankingPage } from "../ranking/ranking-page.tsx";
import { getRankingData, rankingSearchSchema } from "../ranking/ranking.functions.ts";

export const Route = createFileRoute("/")({
  validateSearch: rankingSearchSchema,
  loaderDeps: ({ search }) => ({ venue: search.venue }),
  loader: ({ deps }) => getRankingData({ data: deps }),
  component: RankingRoute,
  errorComponent: RankingError,
  pendingComponent: () => (
    <main className="mx-auto max-w-290 px-8 pt-14 pb-20 mobile:px-4 mobile:pt-7.5 mobile:pb-12">
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
    <main className="mx-auto max-w-290 px-8 pt-14 pb-20 mobile:px-4 mobile:pt-7.5 mobile:pb-12">
      <h1>Restaurant data could not load</h1>
      <p>Check that the local database is available and its migrations have been applied.</p>
      <Button
        type="button"
        className="mt-5 block h-auto px-3.5 py-2.25 text-base/normal font-normal"
        onClick={() => void router.invalidate()}
      >
        Try again
      </Button>
    </main>
  );
}
