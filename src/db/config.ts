import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

export const databaseUrl = process.env.DATABASE_URL ?? "dev.db";
