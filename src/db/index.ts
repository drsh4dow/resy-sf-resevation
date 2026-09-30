import { drizzle } from "drizzle-orm/better-sqlite3";

import { databaseUrl } from "./config.ts";
import * as schema from "./schema.ts";

export const db = drizzle(databaseUrl, { schema });

db.$client.pragma("foreign_keys = ON");

db.$client.pragma("busy_timeout = 5000");
