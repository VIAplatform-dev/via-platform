import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Drizzle client over Neon's HTTP driver. Lazy so importing this module never
// requires the env at build time. The connection is created on first use.
function databaseUrl(): string {
 const u = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!u) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return u;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
 if (!_db) _db = drizzle(neon(databaseUrl()), { schema });
 return _db;
}

export * from "./schema";
