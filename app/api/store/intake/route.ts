import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { draftListing, isIntakeConfigured, PROMPT_VERSION } from "@/app/lib/ai-intake";
import { titleHasBrand, computeListingPricing } from "@/app/lib/intake-pricing";
import { ghostMannequinFromUrl, isPhotoroomConfigured } from "@/app/lib/photoroom";
import { getVoice, buildStoreVoice } from "@/app/lib/store-voice";
import { getStoreBrief, briefVoiceDirectives } from "@/app/lib/store-brief-db";
import { getIntakeHints, getVisualHints } from "@/app/lib/intake-memory-db";
import { embedImage, isEmbeddingConfigured } from "@/app/lib/embeddings";
import { reverseImageMatches, matchesToComps, isCompsConfigured, type VisualMatch } from "@/app/lib/comps";
import { inferBrandFromTitle } from "@/app/lib/market-data-db";
import { gate } from "@/app/lib/concurrency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Cap concurrent AI listing work so bursts (many stores at once) don't trip the
// Anthropic per-minute rate limits. Tunable as the API tier grows.
const AI_GATE = () => gate("intake-ai", Number(process.env.INTAKE_AI_CONCURRENCY) || 3);

// The reverse-image matches are the same piece found across the web, so their titles
// carry the real brand. Run each through the canonical brand matcher and take the
// consensus — deterministic, so we don't depend on the model choosing to trust them.
function brandFromMatches(matches: VisualMatch[]): { brand: string | null; hits: number } {
 const tally = new Map<string, number>();
 for (const m of matches) {
 const b = inferBrandFromTitle(m.title);
 if (b) tally.set(b, (tally.get(b) || 0) + 1);
 }
 let brand: string | null = null, hits = 0;
 for (const [b, n] of tally) if (n > hits) { brand = b; hits = n; }
 return { brand, hits };
}

// titleHasBrand + extractRunway now live in ./intake-pricing (shared with the phase-2 endpoint).

// Reverse-image matches → a strong, explicit brand-grounding instruction. These are
// the same piece found across the web, so they beat any visual guess at the brand.
function reverseImageHint(matches: VisualMatch[], brandKnown = false): string {
 const rows = matches.filter((m) => m.title).slice(0, 12);
 if (!rows.length) return "";
 const list = rows.map((m) => `- "${m.title.slice(0, 110)}"${m.source ? ` — ${m.source}` : ""}`).join("\n");
 const head = `\n\nINTERNAL EVIDENCE — reverse-image search of the primary photo returned these visually-matching products from across the web:\n${list}\n\n`;
 const body = brandKnown
 ? `The seller already gave the brand (authoritative — keep it). Use these same-brand matches to pin down the ERA and the specific runway COLLECTION/SEASON: if they consistently indicate a season/year (e.g. "F/W 2004"), set the runway and era fields precisely. Do NOT change the brand.`
 : `These are the STRONGEST evidence of the ACTUAL brand/designer, item type, and era — the same piece found elsewhere. If they consistently point to a brand/designer, use it with high confidence even if your visual instinct differs; if they're clearly irrelevant or contradictory, return brand null rather than forcing one.`;
 const tail = ` THIS IS BACKGROUND DATA FOR YOU ONLY: never mention the reverse-image search, "web matches", or "the photos" in the title or description — silently use it to fill the brand/era/runway fields.`;
 return head + body + tail;
}

// POST { imageUrls, filled? } — fill in the BLANKS of a listing the seller started.
// Manual-first: the seller types what they know; we only run the AI DRAFT work the gaps
// actually need. Pricing always runs (cheaply, off our own data) — when the seller set a
// price it comes back as an over/under-market flag rather than overwriting their number.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isIntakeConfigured()) {
 return NextResponse.json({ error: "AI intake isn’t enabled on the server yet." }, { status: 503 });
 }

 const body = await request.json().catch(() => null);
 const imageUrls: string[] = Array.isArray(body?.imageUrls)
 ? body.imageUrls.filter((u: unknown) => typeof u === "string" && u).slice(0, 6)
 : (body?.imageUrl ? [String(body.imageUrl)] : []);
 if (imageUrls.length === 0) return NextResponse.json({ error: "imageUrl(s) required" }, { status: 400 });
 const mainUrl = imageUrls[0]; // ghost, embedding + comp photo use the primary shot

 // What the seller already filled in — we only generate the rest.
 const filled: Record<string, unknown> = body?.filled && typeof body.filled === "object" ? body.filled : {};
 const has = (k: string) => typeof filled[k] === "string" && (filled[k] as string).trim().length > 0;
 const val = (k: string) => (has(k) ? (filled[k] as string).trim() : "");

 const DRAFT_FIELDS = ["title", "brand", "era", "material", "condition", "category", "description"];
 const needDraft = DRAFT_FIELDS.some((k) => !has(k)); // any text field blank → run the vision draft
 const needPrice = !has("price"); // price typed → estimate becomes an over/under flag, not the price
 const draftOnly = body?.draftOnly === true; // phase 1: return the drafted fields fast, price/runway come from /pricing
 const needReverse = isCompsConfigured() && (needDraft || needPrice); // Lens → brand ID, runway/era, comps

 // Only learn the store voice when we're actually writing copy. Fold in the owner's
 // brief (what they explicitly told us) as authoritative directives on top of the
 // voice we learned from their listings — what they SAY overrides what we inferred.
 const voice = needDraft ? ((await getVoice(slug).catch(() => null)) ?? (await buildStoreVoice(slug).catch(() => null))) : null;
 const directives = needDraft ? briefVoiceDirectives(await getStoreBrief(slug).catch(() => null)) : "";
 const combinedGuide = directives
 ? `The store owner's explicit instructions — follow these exactly, they override everything else: ${directives}`
  + (voice?.guide ? `\n\nHow they tend to write (learned from their listings): ${voice.guide}` : "")
 : (voice?.guide || "");
 const voiceArg = (combinedGuide || voice?.examples?.length) ? { guide: combinedGuide, examples: voice?.examples ?? [] } : undefined;

 // Embedding (memory) + correction hints + reverse-image — each only when relevant.
 const [embedding, brandHints, matches] = await Promise.all([
 isEmbeddingConfigured() ? embedImage(mainUrl).catch(() => null) : Promise.resolve(null),
 needDraft ? getIntakeHints(slug).catch(() => "") : Promise.resolve(""),
 needReverse ? reverseImageMatches(mainUrl).catch(() => [] as VisualMatch[]) : Promise.resolve([] as VisualMatch[]),
 ]);
 const visualHints = needDraft && embedding ? await getVisualHints(slug, embedding).catch(() => "") : "";
 // If the seller typed the brand, keep only same-brand matches (a look-alike in a
 // different label must not sway the copy) — but still use them to find the runway/era.
 const relevantMatches = has("brand") ? matches.filter((m) => titleHasBrand(m.title, val("brand"))) : matches;
 const hints = reverseImageHint(relevantMatches, has("brand")) + brandHints + visualHints;

 // Vision draft (gated) + ghost cover, in parallel. Skip the draft if nothing's blank.
 // Pass the seller's typed fields so the copy honors them (e.g. won't write
 // "excellent" when they said "good"). Price/cost/parcel aren't writing context.
 const known: Record<string, string> = {};
 for (const k of ["title", "brand", "era", "material", "condition", "size", "category", "description"]) if (has(k)) known[k] = val(k);

 const [draftRes, ghostPng] = await Promise.allSettled([
 needDraft
 ? AI_GATE().run(() => draftListing(imageUrls, voiceArg, hints, known))
 : Promise.resolve(null),
 isPhotoroomConfigured() ? ghostMannequinFromUrl(mainUrl) : Promise.resolve(null),
 ]);

 if (needDraft && draftRes.status === "rejected") {
 return NextResponse.json({ error: draftRes.reason instanceof Error ? draftRes.reason.message : "Draft failed." }, { status: 502 });
 }
 const draft = draftRes.status === "fulfilled" ? draftRes.value : null;

 let ghostUrl: string | null = null;
 if (ghostPng.status === "fulfilled" && ghostPng.value) {
 try {
 const blob = await put(`intake/${slug}/${Date.now()}-ghost.png`, Buffer.from(ghostPng.value), { access: "public", contentType: "image/png" });
 ghostUrl = blob.url;
 } catch {
 /* ghost is optional — keep the draft */
 }
 }

 // Reverse-image consensus brand wins over the model's uncertainty — but only when the
 // seller didn't supply a brand themselves (their input is authoritative).
 const idBrand = brandFromMatches(matches);
 if (draft && idBrand.brand && !has("brand")) {
 const cur = draft.brand?.value || "";
 const disagrees = !cur || draft.brand.confidence < 0.7 || !cur.toLowerCase().includes(idBrand.brand.toLowerCase());
 if (disagrees) draft.brand = { value: idBrand.brand, confidence: idBrand.hits >= 2 ? 0.85 : 0.6 };
 }
 console.log(`[intake ${slug}] needDraft=${needDraft} needPrice=${needPrice} lens=${matches.length} brand=${idBrand.brand ?? "—"}`);

 // Price + over/under-market flag + runway. In draftOnly mode (phase 1) we SKIP this so the
 // form can render the drafted FIELDS immediately; the client then calls
 // /api/store/intake/pricing (phase 2) for these. Single-call mode computes them inline. The
 // shared computeListingPricing keeps both paths identical.
 let estimate = null;
 let priceFlag = null;
 let runway: string | null = has("runway") ? val("runway") : (draft?.runway ?? null);
 const reverseComps = matchesToComps(relevantMatches);
 const reverseTitles = relevantMatches.map((m) => m.title);
 if (!draftOnly) {
 const pr = await computeListingPricing({
 slug,
 brand: has("brand") ? val("brand") : (draft?.brand?.value || ""),
 title: has("title") ? val("title") : (draft?.title || ""),
 era: has("era") ? val("era") : (draft?.era?.value || ""),
 material: has("material") ? val("material") : (draft?.material?.value || ""),
 category: has("category") ? val("category") : (draft?.category || ""),
 price: has("price") ? val("price") : null,
 imageUrls,
 mainUrl,
 extraComps: reverseComps,
 reverseTitles,
 embedding: embedding ?? undefined,
 knowledgeHintCents: draft?.priceHint ? draft.priceHint * 100 : null,
 runwaySoFar: runway,
 draftRanFull: needDraft,
 });
 estimate = pr.estimate;
 priceFlag = pr.priceFlag;
 if (pr.runway) runway = pr.runway;
 if (draft && runway) draft.runway = runway;
 }

 return NextResponse.json({
 ok: true, draft, ghostUrl, photoroom: isPhotoroomConfigured(), estimate, priceFlag, runway, embedding, promptVersion: PROMPT_VERSION,
 // For phase 2 (/api/store/intake/pricing): the reverse-image comps/titles + whether the draft ran.
 needDraft, reverseComps, reverseTitles,
 // Only surface the reverse-image brand banner when WE identified the brand — never
 // when the seller supplied it (their brand stands, and Lens can find a look-alike).
 reverseImage: needReverse && !has("brand") ? { matches: matches.length, brand: idBrand.brand, hits: idBrand.hits, sampleTitles: matches.slice(0, 6).map((m) => m.title) } : null,
 });
}
