// ───────────────────────────────────────────────────────────────────────────
// Store understanding: read a store's full inventory + copy to learn its voice,
// how it prices, and what it typically carries. This profile powers AI intake
// (drafting new listings in the store's exact tone + pricing) and seller insight.
// ───────────────────────────────────────────────────────────────────────────

import { AI_MODELS } from "./ai-models";
import { extractFirstJsonObject } from "./json-extract.ts";

export type StoreProfile = {
 summary: string; // 2–3 sentence positioning
 voice: string; // how they write listings (tone, vocabulary, structure)
 pricing: {
 currency: string;
 min: number;
 max: number;
 median: number;
 average: number;
 strategy: string; // what drives price (brand/era/condition), tiering
 };
 inventory: {
 categories: string[];
 brands: string[];
 eras: string[];
 types: string[]; // garment types
 summary: string;
 };
 conditionLanguage: string; // how they describe condition / flaws
 sampleSize: number; // how many items this was built from
 generatedAt: string | null;
};

const MODEL = AI_MODELS.storeProfile;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function priceNum(p: string): number {
 return parseFloat((p || "").replace(/[^0-9.]/g, "")) || 0;
}
function median(ns: number[]): number {
 if (!ns.length) return 0;
 const s = [...ns].sort((a, b) => a - b);
 const m = Math.floor(s.length / 2);
 return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function strArr(x: any, limit = 15): string[] {
 return Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()).slice(0, limit) : [];
}

export function isProfileConfigured(): boolean {
 return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Build a store profile from its products + copy. Pricing stats are computed
 * deterministically; the qualitative read (voice, strategy, inventory themes)
 * comes from the model. Returns a stats-only profile if the model is unavailable.
 */
export async function buildStoreProfile(input: {
 storeName: string;
 products: { name: string; price: string; description?: string | null; size?: string | null }[];
 copy?: string;
 currency?: string;
}): Promise<StoreProfile | null> {
 const products = input.products.filter((p) => p.name);
 if (!products.length) return null;

 const currency = input.currency || "USD";
 const prices = products.map((p) => priceNum(p.price)).filter((n) => n > 0);
 const stats = {
 currency,
 min: prices.length ? Math.min(...prices) : 0,
 max: prices.length ? Math.max(...prices) : 0,
 median: median(prices),
 average: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
 };

 const statsOnly: StoreProfile = {
 summary: "",
 voice: "",
 pricing: { ...stats, strategy: "" },
 inventory: { categories: [], brands: [], eras: [], types: [], summary: "" },
 conditionLanguage: "",
 sampleSize: products.length,
 generatedAt: null,
 };

 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) return statsOnly;

 // Signal: every product title+price (the inventory), a sample of real listing
 // copy (the voice), and the store's homepage/about copy (the positioning).
 const lines = products.slice(0, 300).map((p) => `• ${p.name} — ${p.price}${p.size ? ` (size ${p.size})` : ""}`).join("\n");
 const descs = products
 .filter((p) => p.description && p.description.length > 20)
 .slice(0, 30)
 .map((p) => `— ${p.name}: "${(p.description || "").slice(0, 240)}"`)
 .join("\n");

 const prompt = `You are profiling a vintage / resale fashion store so an AI can later list new items in the store's EXACT voice and pricing. Be specific and concrete — quote their patterns.

STORE: ${input.storeName}
PRICE STATS: ${stats.min}–${stats.max} ${currency} · median ${stats.median} · average ${stats.average} (from ${prices.length} priced items)

FULL INVENTORY (${products.length} items):
${lines}

SAMPLE LISTING COPY:
${descs || "(none captured)"}
${input.copy ? `\nSTORE COPY (homepage / about):\n${input.copy.slice(0, 2500)}` : ""}

Return ONLY JSON, no prose. Keep it tight so it fits: each text field ≤ 2 sentences; arrays capped at ≤ 10 brands, ≤ 6 categories, ≤ 5 eras, ≤ 8 types.
{
 "summary": "2-3 sentences: who this store is and how it positions itself",
 "voice": "how they write listings — tone, vocabulary, sentence length, what they lead with and emphasize. Be specific enough to imitate.",
 "pricingStrategy": "how they price: tiers/ranges, what pushes price up (brand, era, rarity, condition), and typical price points by item type",
 "inventory": {
 "categories": ["broad categories they carry"],
 "brands": ["the brands that recur, most frequent first"],
 "eras": ["eras/decades they focus on"],
 "types": ["garment/item types they typically stock"],
 "summary": "one sentence on their typical inventory"
 },
 "conditionLanguage": "how they describe condition, wear, and flaws (or 'not stated' if absent)"
}`;

 try {
 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify({ model: MODEL, max_tokens: 2600, messages: [{ role: "user", content: prompt }] }),
 signal: AbortSignal.timeout(45000),
 });
 const data = (await res.json()) as any;
 const text = data?.content?.find((c: any) => c.type === "text")?.text ?? "";
 const m = extractFirstJsonObject(text);
 if (!m) return statsOnly;
 const raw = JSON.parse(m);
 return {
 summary: typeof raw.summary === "string" ? raw.summary : "",
 voice: typeof raw.voice === "string" ? raw.voice : "",
 pricing: { ...stats, strategy: typeof raw.pricingStrategy === "string" ? raw.pricingStrategy : "" },
 inventory: {
 categories: strArr(raw.inventory?.categories),
 brands: strArr(raw.inventory?.brands),
 eras: strArr(raw.inventory?.eras),
 types: strArr(raw.inventory?.types),
 summary: typeof raw.inventory?.summary === "string" ? raw.inventory.summary : "",
 },
 conditionLanguage: typeof raw.conditionLanguage === "string" ? raw.conditionLanguage : "",
 sampleSize: products.length,
 generatedAt: null,
 };
 } catch {
 return statsOnly;
 }
}
