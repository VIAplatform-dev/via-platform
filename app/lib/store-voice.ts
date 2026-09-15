import { neon } from "@neondatabase/serverless";
import { getListingsByStore } from "./listings-db";
import { saveVoice, getVoice, type StoreVoice } from "./store-voice-db";
import { AI_MODELS } from "./ai-models";
import { stripHtml, detectTemplate } from "./description-format";
import { cleanDescription } from "./clean-description";

// Learn a store's writing voice from how they already write their listings.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.voice; // Haiku: mechanical style summary that feeds the drafter

// Shared with the template reader, and it has to be the structure-preserving one: a store's
// template lives in its line breaks, and the version that collapsed them turned every labelled
// listing into one run-on paragraph before anything got to look at it. See description-format.ts.
export { stripHtml };

/** Distill a store's voice from sample descriptions into an imitable guide. */
async function extractVoiceGuide(descriptions: string[]): Promise<string> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey || descriptions.length === 0) return "";
 // 400 characters used to cut a templated listing off mid-sentence: of one store's 60 listings, 55
 // ran longer, so the learner never saw the measurements block, the model line or the sourcing line
 // that close every one of them. Fenced rather than quoted, because the samples now contain the
 // newlines that are the point of reading them.
 const samples = descriptions.slice(0, 12).map((d, i) => `--- listing ${i + 1} ---\n${d.slice(0, 1200)}`).join("\n\n");
 const prompt = `Below are real product descriptions written by ONE vintage/resale store:\n\n${samples}\n\nDescribe this store's writing VOICE *and* FORMAT precisely enough that another writer could imitate it exactly. Cover BOTH:\n1) FORMAT / STRUCTURE. The order they present information, any fixed sections or labels (e.g. "Size:", "Condition:", a measurements block), line breaks / spacing, list or dash usage, and crucially whether they follow a STRICT repeatable template or vary listing-to-listing. Say which it is, and if there's a template, lay it out step by step.\n2) VOICE. Tone & formality, sentence length and rhythm, vocabulary, punctuation / emoji / capitalization habits, what they lead with, how they handle condition and sizing, and any signature phrasings or quirks.\nOutput ONLY the description, no preamble.`;
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
 // Two readings of the same corpus. `cleaned` is for LEARNING (voice and template); `raw` is kept
 // so the examples can go through the store's own importer and come out in the shape her storefront
 // actually renders.
 const raw: string[] = [];
 const cleaned: string[] = [];
 const take = (d: string | null | undefined) => {
  const text = stripHtml(d || "");
  if (text.length <= 30) return;
  raw.push(String(d));
  cleaned.push(text);
 };
 for (const l of listings) take(l.description);

 // Synced stores keep their descriptions in `products`, not the native `items` table. Pull from
 // there when the native corpus is thin, so EVERY store learns a voice, not just Add-a-listing users.
 if (cleaned.length < 6) {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (url) {
 const rows = (await neon(url)`
  SELECT description FROM products
  WHERE store_slug = ${storeSlug} AND description IS NOT NULL AND description <> ''
  ORDER BY synced_at DESC LIMIT 40
 `.catch(() => [])) as { description: string }[];
 for (const r of rows) take(r.description);
 }
 }
 if (cleaned.length < 2) return null; // not enough of their own writing yet

 const guide = await extractVoiceGuide(cleaned);
 if (!guide) return null;

 // A few real, representative examples for few-shot mimicry (most powerful signal).
 // Put through the STORE'S OWN IMPORTER rather than a second opinion about the format, so the
 // examples the drafter imitates are in the same shape as the listings already on her storefront:
 // her paragraph gaps kept, her spec lists tight, exactly what a shopper sees.
 const examples = [...raw].sort((a, b) => b.length - a.length).slice(0, 3)
  .map((d) => cleanDescription(d) ?? "").filter(Boolean);
 // The structure, read rather than described. A model asked to summarise a store's format in prose
 // gets it roughly right; the labels, their spelling and their order have to be exact, so they are
 // counted off the listings instead.
 const template = detectTemplate(cleaned);
 await saveVoice(storeSlug, guide, examples, cleaned.length, template);
 return { guide, examples, sampleSize: cleaned.length, template };
}

export { getVoice };
export type { StoreVoice };
