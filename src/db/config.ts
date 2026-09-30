import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

export const databaseUrl = process.env.DATABASE_URL ?? "dev.db";
