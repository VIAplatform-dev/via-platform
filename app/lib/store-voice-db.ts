import { neon } from "@neondatabase/serverless";
import type { Template } from "./description-format";

// Each store's learned writing voice. Distilled from how they already write their
// listings, plus a few real example descriptions. The AI listing writer pulls this
// so new drafts sound like THIS store, not generic AI. Refreshable as they add more
// listings (the agent keeps learning).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_voice (
 store_slug TEXT PRIMARY KEY,
 guide TEXT NOT NULL,
 examples TEXT[] NOT NULL DEFAULT '{}',
 sample_size INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // The SHAPE of their listings, read off the listings rather than described by a model. Most shops
 // that arrive with a catalogue write to a fixed template, and the template is the half of "sounds
 // like them" that a prose summary of their voice keeps losing. See description-format.ts.
 await db()`ALTER TABLE store_voice ADD COLUMN IF NOT EXISTS template JSONB`;
 ensured = true;
}

export type StoreVoice = { guide: string; examples: string[]; sampleSize: number; template?: Template | null };

export async function saveVoice(storeSlug: string, guide: string, examples: string[], sampleSize: number, template?: Template | null): Promise<void> {
 await ensureTable();
 const t = template ? JSON.stringify(template) : null;
 await db()`INSERT INTO store_voice (store_slug, guide, examples, sample_size, template, updated_at)
 VALUES (${storeSlug}, ${guide}, ${examples}, ${sampleSize}, ${t}, now())
 ON CONFLICT (store_slug) DO UPDATE SET guide = ${guide}, examples = ${examples}, sample_size = ${sampleSize}, template = ${t}, updated_at = now()`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getVoice(storeSlug: string): Promise<StoreVoice | null> {
 await ensureTable();
 const rows = await db()`SELECT guide, examples, sample_size, template FROM store_voice WHERE store_slug = ${storeSlug}`;
 if (!rows.length) return null;
 const r: any = rows[0];
 // Stored as JSONB, so it arrives parsed. A voice learned before templates were read has none, and
 // gets one on its next refresh.
 const template = r.template && typeof r.template === "object" ? (r.template as Template) : null;
 return { guide: r.guide, examples: Array.isArray(r.examples) ? r.examples : [], sampleSize: r.sample_size, template };
}
