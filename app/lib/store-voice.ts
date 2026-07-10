import { neon } from "@neondatabase/serverless";
import { getListingsByStore } from "./listings-db";
import { saveVoice, getVoice, type StoreVoice } from "./store-voice-db";
import { AI_MODELS } from "./ai-models";

// Learn a store's writing voice from how they already write their listings.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.voice; // Haiku — mechanical style summary that feeds the drafter

export function stripHtml(s: string): string {
 return s
 .replace(/<[^>]+>/g, " ")
 .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/gi, " ")
 .replace(/\s+/g, " ")
 .trim();
}

/** Distill a store's voice from sample descriptions into an imitable guide. */
async function extractVoiceGuide(descriptions: string[]): Promise<string> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey || descriptions.length === 0) return "";
 const samples = descriptions.slice(0, 12).map((d, i) => `${i + 1}. "${d.slice(0, 400)}"`).join("\n");
 const prompt = `Below are real product descriptions written by ONE vintage/resale store:\n\n${samples}\n\nDescribe this store's writing VOICE *and* FORMAT precisely enough that another writer could imitate it exactly. Cover BOTH:\n1) FORMAT / STRUCTURE — the order they present information, any fixed sections or labels (e.g. "Size:", "Condition:", a measurements block), line breaks / spacing, list or dash usage, and crucially whether they follow a STRICT repeatable template or vary listing-to-listing. Say which it is, and if there's a template, lay it out step by step.\n2) VOICE — tone & formality, sentence length and rhythm, vocabulary, punctuation / emoji / capitalization habits, what they lead with, how they handle condition and sizing, and any signature phrasings or quirks.\nOutput ONLY the description, no preamble.`;
 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
 });
 if (!res.ok) return "";
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 return (data.content?.find((c) => c.type === "text")?.text ?? "").trim();
}

/**
 * Build (or refresh) a store's voice profile from its existing listings, and save
 * it. Returns null if there isn't enough written copy to learn from yet.
 */
export async function buildStoreVoice(storeSlug: string): Promise<StoreVoice | null> {
 const listings = await getListingsByStore(storeSlug, false).catch(() => []);
 const cleaned = listings
 .map((l) => stripHtml(l.description || ""))
 .filter((d) => d.length > 30);

 // Synced stores keep their descriptions in `products`, not the native `items` table — pull from
 // there when the native corpus is thin, so EVERY store learns a voice, not just Add-a-listing users.
 if (cleaned.length < 6) {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (url) {
 const rows = (await neon(url)`
  SELECT description FROM products
  WHERE store_slug = ${storeSlug} AND description IS NOT NULL AND description <> ''
  ORDER BY synced_at DESC LIMIT 40
 `.catch(() => [])) as { description: string }[];
 for (const r of rows) { const d = stripHtml(r.description || ""); if (d.length > 30) cleaned.push(d); }
 }
 }
 if (cleaned.length < 2) return null; // not enough of their own writing yet

 const guide = await extractVoiceGuide(cleaned);
 if (!guide) return null;

 // A few real, representative examples for few-shot mimicry (most powerful signal).
 const examples = [...cleaned].sort((a, b) => b.length - a.length).slice(0, 3);
 await saveVoice(storeSlug, guide, examples, cleaned.length);
 return { guide, examples, sampleSize: cleaned.length };
}

export { getVoice };
export type { StoreVoice };
