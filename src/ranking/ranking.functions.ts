import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { restaurantCaptureSchema } from "../scarcity/model.ts";

export const rankingSearchSchema = z.object({
  venue: restaurantCaptureSchema.shape.resyUrl.optional().catch(undefined),
});

export const getRankingData = createServerFn({ method: "GET" })
  .validator(rankingSearchSchema)
  .handler(async ({ data }) => {
    const { db } = await import("../db/index.ts");
    const { readRankingPage } = await import("./ranking.server.ts");

    return readRankingPage(db, data.venue);
  });

export type RankingData = Awaited<ReturnType<typeof getRankingData>>;

export type RestaurantRow = RankingData["restaurants"][number];

export type RestaurantDetailData = NonNullable<RankingData["detail"]>;
