import { neon } from "@neondatabase/serverless";

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return url;
};

async function initSettingsTable() {
 const sql = neon(getDatabaseUrl());
 await sql`
 CREATE TABLE IF NOT EXISTS app_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TIMESTAMPTZ DEFAULT NOW()
 )
 `;
}

export async function saveSetting(key: string, value: string): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initSettingsTable();
 await sql`
 INSERT INTO app_settings (key, value, updated_at)
 VALUES (${key}, ${value}, NOW())
 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
 `;
}

/**
 * Atomically claim a one-time lock. Returns true ONLY for the first caller;
 * concurrent or retry callers get false because the row already exists. Use this
 * to make one-time jobs (e.g. a campaign email) idempotent. Claim BEFORE the
 * work so a second firing during a long send can't duplicate it.
 */
export async function claimSetting(key: string, value: string): Promise<boolean> {
 const sql = neon(getDatabaseUrl());
 await initSettingsTable();
 const rows = await sql`
 INSERT INTO app_settings (key, value, updated_at)
 VALUES (${key}, ${value}, NOW())
 ON CONFLICT (key) DO NOTHING
 RETURNING key
 `;
 return rows.length > 0;
}

export async function getSetting(key: string): Promise<string | null> {
 const sql = neon(getDatabaseUrl());
 await initSettingsTable();
 const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
 return rows.length > 0 ? (rows[0].value as string) : null;
}
