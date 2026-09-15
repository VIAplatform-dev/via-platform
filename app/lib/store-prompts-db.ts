import { neon } from "@neondatabase/serverless";

// Onboarding questions a store has already answered.
//
// PER STORE, NOT PER BROWSER. localStorage would have done, and would have been wrong: a seller who
// said "no, my products aren't on Depop" on her laptop has still said no when she opens her phone,
// and being asked again reads as VYA not listening. It is also how a prompt becomes noise, and a
// seller who learns to ignore one card learns to ignore the next one.
//
// Deliberately a general table rather than a column per question. There will be more of these,
// every on-ramp has a "have you got one of these already?", and each new one should be a string,
// not a migration.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable(): Promise<void> {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS store_answered_prompts (
   store_slug TEXT NOT NULL,
   prompt_key TEXT NOT NULL,
   answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   PRIMARY KEY (store_slug, prompt_key)
  )
 `;
 ensured = true;
}

/** Which questions this store has already answered. */
export async function answeredPrompts(storeSlug: string): Promise<string[]> {
 await ensureTable();
 const rows = (await db()`SELECT prompt_key FROM store_answered_prompts WHERE store_slug = ${storeSlug}`
  .catch(() => [])) as { prompt_key: string }[];
 return rows.map((r) => String(r.prompt_key));
}

/** Record an answer. Idempotent: pressing the X twice is not an error. */
export async function answerPrompt(storeSlug: string, key: string): Promise<void> {
 const k = (key || "").trim().slice(0, 80);
 if (!storeSlug || !k) return;
 await ensureTable();
 await db()`
  INSERT INTO store_answered_prompts (store_slug, prompt_key) VALUES (${storeSlug}, ${k})
  ON CONFLICT (store_slug, prompt_key) DO NOTHING
 `.catch(() => {});
}
