import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getMarketReferenceFast, computePriceFlag, type PriceEstimate } from "@/app/lib/price-engine";
import { getVisualVyaComps } from "@/app/lib/intake-memory-db";
import { embedImage } from "@/app/lib/embeddings";
import { reverseImageMatches, partitionByVisualMatch } from "@/app/lib/comps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Turn a set of comp prices (cents) into a market estimate. Null if too few to say anything.
function estimateFromPrices(pricesCents: number[], confidence: number, rationale: string): PriceEstimate | null {
 const prices = pricesCents.filter((p) => p > 0).sort((a, b) => a - b);
 if (prices.length < 3) return null;
 const q = (f: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * f))];
 const m = q(0.5);
 return { suggestedCents: m, marketCents: m, floorCents: null, lowCents: q(0.25), highCents: q(0.75), confidence, comps: [], rationale, source: "comps" };
}

// Always-on price check for the listing form. Prices the item WITHOUT needing the AI fill, and is
// accurate on a MANUAL entry because it looks at the PHOTO, not just the typed title:
//   1. TEXT / owned reference (fast; has its own live-text fallback)
//   2. VISUAL — visually-similar pieces in the store's own sold/intake data (the manual-entry unlock)
//   3. NOVEL — reverse-image the photo across the web when it isn't in our data (cached ~1.5¢)
// Then it CONFIDENCE-GATES the flag: no hard over/under verdict unless real comps back it, so a thin
// entry gets a rough range + an honest "not enough comps", never a false "1500% overpriced".
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const price = Number(body?.price);
 const brand = typeof body?.brand === "string" ? body.brand.trim() : "";
 const title = typeof body?.title === "string" ? body.title.trim() : "";
 const era = typeof body?.era === "string" ? body.era.trim() : "";
 const material = typeof body?.material === "string" ? body.material.trim() : "";
 const category = typeof body?.category === "string" ? body.category.trim() : "";
 const imageUrl =
  (typeof body?.imageUrl === "string" && body.imageUrl.trim()) ||
  (typeof body?.photoUrl === "string" && body.photoUrl.trim()) || "";

 const baseTitle = title || [era, material, category].filter(Boolean).join(" ");
 const query = brand && !baseTitle.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${baseTitle}` : baseTitle;

 // 1) TEXT / owned reference (fast owned data + one live-text fallback inside).
 const textEst = query.trim() ? await getMarketReferenceFast({ query, brand: brand || null }).catch(() => null) : null;
 const textN = textEst?.comps?.length ?? (textEst?.marketCents ? 3 : 0);

 // Embed the photo ONCE — it powers both the owned-data visual match and the reverse-image
 // verification below (so a wrong-model web result never sets the price).
 const embedding = imageUrl ? await embedImage(imageUrl).catch(() => null) : null;

 // 2) VISUAL — price off what the item LOOKS like, from the store's own data. Makes a manual
 //    entry accurate even when the typed title is thin, because it identifies the piece visually.
 let visualEst: PriceEstimate | null = null, visualN = 0;
 if (embedding) {
  const comps = await getVisualVyaComps(embedding, 12).catch(() => []);
  const prices = comps.map((c) => c.priceCents);
  visualN = prices.filter((p) => p > 0).length;
  const soldN = comps.filter((c) => c.sold && c.priceCents > 0).length;
  visualEst = estimateFromPrices(
   prices,
   visualN >= 6 && soldN >= 2 ? 0.7 : visualN >= 4 ? 0.58 : 0.45,
   `Priced from ${visualN} visually-similar pieces in your data${soldN ? ` (${soldN} sold)` : ""}.`,
  );
 }

 // 3) NOVEL — not in our data. Reverse-image the photo across the web, then VISUALLY VERIFY each
 //    match against the photo: Google Lens returns look-alikes (a different bag of the same brand),
 //    and pricing off those is exactly how a $1,800 piece comes back as $685. Only verified-same
 //    matches set the price; if too few verify, we stay low-confidence instead of guessing wrong.
 let webEst: PriceEstimate | null = null, webN = 0;
 if (imageUrl && textN < 3 && visualN < 3) {
  const matches = await reverseImageMatches(imageUrl).catch(() => []);
  const { verified, unchecked, ran } = await partitionByVisualMatch(matches, { queryEmbedding: embedding }).catch(() => ({ verified: matches, unchecked: [] as typeof matches, ran: false }));
  // Use verified matches when scoring ran; fall back to all matches if it couldn't run.
  const pool = ran ? [...verified, ...unchecked.filter((m) => (m.priceCents ?? 0) > 0)] : matches;
  const priced = pool.filter((m) => (m.priceCents ?? 0) > 0);
  webN = priced.length;
  const verifiedN = verified.filter((m) => (m.priceCents ?? 0) > 0).length;
  // Verified visual matches are the truest comp there is → higher confidence than an unfiltered set.
  const conf = ran ? (verifiedN >= 5 ? 0.62 : verifiedN >= 3 ? 0.52 : 0.42) : (webN >= 5 ? 0.5 : 0.42);
  webEst = estimateFromPrices(priced.map((m) => m.priceCents ?? 0), conf, `Priced from ${verifiedN} visually-verified + ${webN - verifiedN} unverified web matches.`);
 }

 // Choose the strongest: score = confidence + a small bonus for more comps. Photo-based tiers win ties.
 const cands = [{ e: visualEst, n: visualN }, { e: webEst, n: webN }, { e: textEst, n: textN }].filter((c) => c.e?.marketCents);
 cands.sort((a, b) => (b.e!.confidence + Math.min(0.3, b.n * 0.03)) - (a.e!.confidence + Math.min(0.3, a.n * 0.03)));
 const chosen = cands[0];
 const marketCents = chosen?.e?.marketCents ?? null;

 if (!chosen || !marketCents) {
  // Nothing to say — don't guess, don't flag.
  return NextResponse.json({ estimate: null, priceFlag: null, lowConfidence: true });
 }
 const est = chosen.e as PriceEstimate;

 // Confidence gate — only a hard over/under verdict when we truly have the comps to back it.
 const confident = est.confidence >= 0.5 && chosen.n >= 3;
 const sellerCents = Math.round(price * 100);
 const priceFlag = confident && sellerCents > 0 ? computePriceFlag(sellerCents, marketCents, est.lowCents, est.highCents) : null;

 return NextResponse.json({
  estimate: { marketCents, lowCents: est.lowCents, highCents: est.highCents, suggestedCents: est.suggestedCents, confidence: est.confidence, rationale: est.rationale },
  priceFlag,
  lowConfidence: !confident,
 });
}
