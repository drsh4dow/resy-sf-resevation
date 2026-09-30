import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";

import * as tables from "../db/schema.ts";
import { collectionSchema } from "./model.ts";
import { importCollection, readRanking } from "./store.ts";

const help = `Resy SF reservation-scarcity data pipeline

Usage: vp run data <command> [argument]
       vp run data --help

Commands:
  collect <new-directory> --har <private.har> [--days 28] [--query <name>]
                         Capture public search pages and SF venue details; no DB writes.
  assemble <directory>   Build collection.json offline from an interrupted capture.
  migrate                Apply checked-in Drizzle migrations to the local SQLite DB.
  schema                 Print the collection JSON Schema derived from Zod.
  validate <file.json>   Validate evidence without opening or modifying the DB.
  import <file.json>     Validate, score, and atomically store one collection.
  report                 Print latest-per-restaurant ranking as JSON, scores first.
  inspect <collection>   Print one collection's provenance, observations, and scores.

Workflow:
  1. vp run data migrate
  2. Capture a successful public search with agent-browser network har start/stop.
     Keep the HAR private; it contains authorization material.
     vp run data collect /tmp/resy-pilot --har /private/search.har --days 7 --query Rintaro
     Omit --query for all accessible SF search pages. Default horizon: 28 days.
     The output is <directory>/collection.json plus sanitized request receipts.
     Existing data/collections/*.json captures include procedures and limitations.
  3. vp run data validate data/collections/<capture>.json
  4. vp run data import data/collections/<capture>.json
  5. vp run data report

Configuration:
  DATABASE_URL selects a SQLite file (default dev.db).
  Existing .env.local and .env configuration is respected.

Evidence and scoring:
  Party of two; public regular dinner starting 18:00–21:00, San Francisco time.
  Observe days 1–28; headline score compares days 1–7 on a fixed 0–100 scale.
  Missing, unknown, unreleased, or failed dates prevent a band's publication.
  Closed/event-only/other-platform venues are not evidence of high demand.
  JSON Schema describes fields; validate also checks cross-field Zod invariants.

Retries and history:
  Collection requires a new directory; no overwrites or automatic request retries.
  Requests are sequential, spaced by one second, bounded by 20s timeouts and a 60m
  run budget. Stop on HTTP/schema errors. Retain partial receipts on interruption;
  assemble can finalize them offline. Start a new directory to retry collection.
  Import only finalized collection.json, not receipts. Empty slots stay unknown;
  release/service/closure policies need evidence-based review before scoring them.
  Exact re-imports are no-ops. Changed evidence requires a new collection ID.
  Failed imports roll back completely. New snapshots preserve prior observations.
  A snapshot is not a forecast. Keep timestamps and collection limitations visible.

Machine-readable output without the Vite+ task banner:
  vp exec tsx src/scarcity/cli.ts report > ranking.json
  vp exec tsx src/scarcity/cli.ts schema > collection.schema.json
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      har: { type: "string" },
      days: { type: "string" },
      query: { type: "string" },
    },
  });

  const [command, argument, ...extra] = positionals;

  if (values.help || !command) {
    console.log(help);

    return;
  }

  if (extra.length > 0) {
    throw new Error("Too many arguments");
  }

  if (
    command !== "collect" &&
    (values.har !== undefined || values.days !== undefined || values.query !== undefined)
  ) {
    throw new Error("--har, --days and --query apply only to collect");
  }

  switch (command) {
    case "collect": {
      if (!argument || !values.har)
        throw new Error(
          "Usage: vp run data collect <new-directory> --har <private.har> [--days 28] [--query <name>]",
        );

      const days = z.coerce
        .number()
        .int()
        .min(1)
        .max(28)
        .parse(values.days ?? "28");

      const { collectSearch } = await import("./collect.ts");
      await collectSearch(argument, values.har, days, values.query ?? "");
      break;
    }

    case "assemble": {
      if (!argument) throw new Error("Usage: vp run data assemble <directory>");
      const { assembleSearch } = await import("./collect.ts");
      const collection = await assembleSearch(argument);
      console.log(`Assembled ${collection.restaurants.length} restaurants`);
      break;
    }

    case "schema": {
      if (argument) {
        throw new Error("Usage: vp run data schema");
      }

      console.log(JSON.stringify(z.toJSONSchema(collectionSchema, { io: "input" }), null, 2));
      break;
    }

    case "validate":
    case "import": {
      if (!argument) {
        throw new Error(`Usage: vp run data ${command} <collection.json>`);
      }

      const collection = collectionSchema.parse(JSON.parse(await readFile(argument, "utf8")));

      if (command === "validate") {
        console.log(
          `Valid collection ${collection.id}: ${collection.restaurants.length} restaurants`,
        );
        break;
      }

      const { db } = await import("../db/index.ts");

      try {
        console.log(JSON.stringify(importCollection(db, collection)));
      } finally {
        db.$client.close();
      }

      break;
    }

    case "migrate":
    case "report": {
      if (argument) {
        throw new Error(`Usage: vp run data ${command}`);
      }

      const { db } = await import("../db/index.ts");

      try {
        if (command === "migrate") {
          migrate(db, { migrationsFolder: "drizzle" });
          console.log("Database migrations applied");
        } else {
          console.log(JSON.stringify(readRanking(db), null, 2));
        }
      } finally {
        db.$client.close();
      }

      break;
    }

    case "inspect": {
      if (!argument) {
        throw new Error("Usage: vp run data inspect <collection-id>");
      }

      const { db } = await import("../db/index.ts");

      try {
        const collection = db
          .select()
          .from(tables.collections)
          .where(eq(tables.collections.id, argument))
          .get();

        if (!collection) {
          throw new Error(`Unknown collection: ${argument}`);
        }

        console.log(
          JSON.stringify(
            {
              collection,
              restaurants: db
                .select()
                .from(tables.restaurantSnapshots)
                .where(eq(tables.restaurantSnapshots.collectionId, argument))
                .all(),
              observations: db
                .select()
                .from(tables.dinnerObservations)
                .where(eq(tables.dinnerObservations.collectionId, argument))
                .all(),
              scores: db
                .select()
                .from(tables.scarcityScores)
                .where(eq(tables.scarcityScores.collectionId, argument))
                .all(),
            },
            null,
            2,
          ),
        );
      } finally {
        db.$client.close();
      }

      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Data command failed");
  console.error("Run vp run data --help for commands and collection guidance.");
  process.exitCode = 1;
}
