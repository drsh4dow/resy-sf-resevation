import { drizzle } from "drizzle-orm/better-sqlite3";

import { databaseUrl } from "./config.ts";
import * as schema from "./schema.ts";

export const db = drizzle(databaseUrl, { schema });
