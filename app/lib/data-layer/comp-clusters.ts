import { AI_MODELS } from "../ai-models";
import { quantile } from "./metrics";

// ───────────────────────────────────────────────────────────────────────────
// Sub-market clustering for demand-search comps.
//
// A wide brand — "Valentino" — isn't one market: Valentino Garavani (mainline), RED Valentino
// (diffusion), Mario Valentino (a DIFFERENT house), and Valentino fragrance all resell at their own
// prices. Collapsing them into one median misleads every seller. Rather than filter (which assumes
// which sub-market the seller wants — see [[automated-unbiased-data]]), we CLUSTER the live listings
// into labeled segments each with its own price, and let the seller pick their tier. No assumptions,
// nothing deleted; it just reflects how the market actually splits.
// ───────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLUSTER_MODEL = AI_MODELS.voice; // internal, mechanical → cheap tier

export type CompCluster = { label: string; count: number; medianPrice: number | null; p25: number | null; p75: number | null };

const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * Cluster live eBay listings into the distinct sub-markets a reseller would price separately.
 * Returns [] when the LLM can't run, the sample is too small, or the market is homogeneous (a single
 * cluster) — so the caller only shows a breakdown when there's a real split worth surfacing.
 */
export async function clusterCompListings(query: string, listings: { title: string; price: number }[]): Promise<CompCluster[]> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey || listings.length < 8) return [];
 const sample = listings.slice(0, 50);
 const numbered = sample.map((l, i) => `${i}. ${l.title.slice(0, 90)} ($${Math.round(l.price)})`).join("\n");
 const prompt = `These are active eBay resale listings for the search "${query}". A reseller prices distinct SUB-MARKETS separately. Assign EACH listing to a short cluster label a seller would price on its own — distinguish sub-brands (e.g. "Valentino Garavani" vs "Mario Valentino" vs "RED Valentino"), product lines, or non-apparel type ("fragrance", "accessories"). Keep labels consistent and few (2–6 total). Do NOT judge which is "real" — every sub-market is valid.
Return ONLY a JSON array of strings — one label per listing, SAME length (${sample.length}) and order as the list:\n\n${numbered}`;

 const res = await fetch(ANTHROPIC_URL, {
  method: "POST",
  headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({ model: CLUSTER_MODEL, max_tokens: 1200, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
 }).catch(() => null);
 if (!res || !res.ok) return [];
 const data = (await res.json().catch(() => null)) as { content?: Array<{ text?: string }> } | null;
 const text = data?.content?.[0]?.text ?? "";
 let labels: unknown;
 try { labels = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)); } catch { return []; }
 if (!Array.isArray(labels) || labels.length !== sample.length) return [];

 const byLabel = new Map<string, number[]>();
 sample.forEach((l, i) => {
  const lab = String(labels[i] ?? "other").trim().slice(0, 40) || "other";
  (byLabel.get(lab) ?? byLabel.set(lab, []).get(lab)!).push(l.price);
 });
 const clusters = [...byLabel.entries()]
  .map(([label, prices]) => ({ label, count: prices.length, medianPrice: round2(quantile(prices, 0.5)), p25: round2(quantile(prices, 0.25)), p75: round2(quantile(prices, 0.75)) }))
  .filter((c) => c.count >= 2)
  .sort((a, b) => b.count - a.count);
 // Only worth surfacing when the market genuinely splits into ≥2 sub-markets.
 return clusters.length >= 2 ? clusters.slice(0, 6) : [];
}
