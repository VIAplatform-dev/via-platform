import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/app/lib/seller-activity-db";
import { missingShipFrom, describeMissing } from "@/app/lib/ship-from-core";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { createConsignmentItem, resolveSplitForIntake } from "@/app/lib/consignment-db";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { getOrCreateSeller } from "@/app/lib/db/sellers";
import { createItem, updateItem, getItem, ensurePublishAtColumn, setCrossListChannels } from "@/app/lib/db/inventory";
import { createCrossListingsForItem, syncItemToApiPlatforms, getCrossListingsForItem, PLATFORMS } from "@/app/lib/cross-listing-db";
import { maybeAutoPostStory } from "@/app/lib/instagram-publish";
import { getOrCreateCollection, setItemCollections } from "@/app/lib/db/collections";
import { logCorrections, logPredictions, rememberItem } from "@/app/lib/intake-memory-db";
import { recordIntakeExample } from "@/app/lib/training-data-db";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { MAX_ITEM_IMAGES } from "@/app/lib/item-limits";

export const dynamic = "force-dynamic";

// POST — publish a reviewed intake draft as a live one-of-one item.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

 const title = String(body.title || "").trim().slice(0, 200);
 if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

 // Scheduled publish: a valid future time means "save as a draft now, auto-publish then". Require
 // it at least a minute out so it never races the cron.
 let publishAt: Date | null = null;
 if (typeof body.publishAt === "string" && body.publishAt) {
 const d = new Date(body.publishAt);
 if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000) publishAt = d;
 }
 const scheduled = !!publishAt;
 const goLiveNow = body.status !== "draft" && !scheduled;

 // Anything that will be publicly live — now OR on a schedule — must be shippable: without a
 // ship-from we can't floor the buyer's shipping (VYA could lose money) or buy the label. A plain
 // draft is fine (stage now, add the address before it goes live).
 if (goLiveNow || scheduled) {
 const shipping = await getShippingSettings(slug);
 if (!hasShipFrom(shipping)) {
  const gaps = describeMissing(missingShipFrom(shipping.shipFrom));
  return NextResponse.json({ error: `Your ship-from address is missing its ${gaps}. Add it in Settings → Locations, then publish.` }, { status: 400 });
 }
 }

 const store = stores.find((s) => s.slug === slug);
 const seller = await getOrCreateSeller(slug, store?.name || slug, storeContactEmails[slug] || "");
 await ensurePublishAtColumn(); // createItem writes publish_at — make sure the column exists

 const str = (v: unknown, n: number) => {
 const s = (typeof v === "string" ? v : "").trim();
 return s ? s.slice(0, n) : null;
 };
 // Parcel dims round UP (never down) — a declared parcel smaller than reality risks a carrier re-weigh charge.
 const dimUp = (v: unknown, d: number) => { const n = Math.ceil(Number(v)); return Number.isFinite(n) && n > 0 ? n : d; };
 const price = Math.max(0, Math.min(1_000_000, Number(body.price) || 0));
 const hasCost = body.cost !== undefined && body.cost !== null && body.cost !== "";
 const cost = Math.max(0, Math.min(1_000_000, Number(body.cost) || 0));
 const images = Array.isArray(body.images) ? body.images.filter((x: unknown) => typeof x === "string" && x).slice(0, MAX_ITEM_IMAGES) : [];

 // The fields to write. Shared between "promote the autosaved draft" and "create fresh".
 const fields = {
 title,
 description: str(body.description, 2000),
 priceCents: Math.round(price * 100),
 costCents: hasCost ? Math.round(cost * 100) : null,
 currency: store?.currency || "USD",
 images,
 brand: str(body.brand, 80),
 era: str(body.era, 40),
 material: str(body.material, 120),
 colour: str(body.colour, 60),
 condition: str(body.condition, 80),
 size: str(body.size, 40),
 measurements: str(body.measurements, 300),
 category: str(body.category, 60),
 weightOz: dimUp(body.weightOz, 16),
 lengthIn: dimUp(body.lengthIn, 12),
 widthIn: dimUp(body.widthIn, 9),
 heightIn: dimUp(body.heightIn, 3),
 source: "ai" as const,
 // Stores doing a drop stage pieces as drafts, then publish the batch at once. A scheduled
 // listing stays a draft (invisible) with publish_at set — the cron flips it live at that time.
 status: (goLiveNow ? "active" : "draft") as "active" | "draft",
 publishAt,
 };

 // If this listing was autosaved as a draft while editing, PROMOTE that same row in place. Creating
 // a new item and deleting the draft (the old behavior) left a duplicate + a stray "removed" ghost.
 const draftId = typeof body.draftId === "string" && body.draftId ? body.draftId : null;
 let item: Awaited<ReturnType<typeof createItem>> | null = null;
 if (draftId) {
 const existing = await getItem(draftId).catch(() => null);
 // Only reuse it if it's THIS store's own still-unpublished draft (never touch a live/sold row).
 if (existing && existing.sellerId === seller.id && existing.status === "draft") {
 item = await updateItem(draftId, fields);
 }
 }
 if (!item) item = await createItem({ sellerId: seller.id, ...fields });

 // Consignment: if this piece belongs to a consignor, record its terms and FREEZE the split
 // (the seller's override if they set one, else resolved from consignor/store rules).
 const consignment = body.consignment && typeof body.consignment === "object" ? (body.consignment as Record<string, unknown>) : null;
 if (consignment && consignment.consignorId) {
 const consignorId = Number(consignment.consignorId);
 const priceCents = Math.round(price * 100);
 const category = str(body.category, 60) || null;
 const splitPct = typeof consignment.splitPct === "number" ? consignment.splitPct : await resolveSplitForIntake(slug, consignorId, priceCents, category).catch(() => 50);
 await createConsignmentItem({
 productId: String(item.id),
 storeSlug: slug,
 consignorId,
 splitPct,
 listedPriceCents: priceCents,
 expiresAt: typeof consignment.expiresAt === "string" && consignment.expiresAt ? consignment.expiresAt : null,
 }).catch((e) => console.error("[publish] consignment record failed:", e));
 }

 // Collections: titles in → get-or-create per seller, then set membership. Sending
 // titles handles both picking an existing collection and creating a new one.
 const collectionTitles = Array.isArray(body.collections)
 ? body.collections.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 20)
 : [];
 if (collectionTitles.length) {
 const ids: string[] = [];
 for (const t of collectionTitles) ids.push((await getOrCreateCollection(seller.id, String(t))).id);
 await setItemCollections(item.id, ids);
 }

 // Cross-listing: publishing to VYA queues the piece for the seller's other
 // marketplaces (whichever they've connected with auto-list on). Drafts don't fan out.
 // Handle-based platforms get a paste-ready record; eBay is pushed for real via its API.
 // Which marketplaces to cross-list to. The publish form sends `channels` (the seller's per-item
 // choice); absent it, fall back to each channel's auto-list default.
 let crossListing: { platform: string; name: string; status: string; url: string | null }[] = [];
 const channels = Array.isArray(body.channels)
 ? body.channels.filter((c: unknown): c is string => typeof c === "string")
 : null;
 // Store the choice on the item first. A scheduled piece publishes hours later via
 // the cron, which has no access to this request — without this the seller's picks
 // would quietly fall back to the account defaults.
 if (channels) await setCrossListChannels(item.id, channels).catch(() => {});
 if (item.status === "active") {
 // Await so we can tell the seller exactly where it landed: eBay/Etsy list synchronously (listed or
 // failed, with the reason), Depop/Vestiaire queue for the extension.
 await createCrossListingsForItem(slug, item.id, channels).catch(() => {});
 await syncItemToApiPlatforms(slug, item.id, channels).catch(() => {});
 const rows = await getCrossListingsForItem(slug, item.id).catch(() => []);
 crossListing = rows.map((r) => ({
 platform: r.platform,
 name: PLATFORMS.find((p) => p.key === r.platform)?.name || r.platform,
 status: r.status,
 url: r.externalUrl,
 }));
 // If the store connected Instagram with auto-post on, post the new piece to their
 // Story (a card that drives to their own storefront). Best-effort — never blocks publish.
 maybeAutoPostStory(slug, item.id).catch(() => {});
 }

 // Correction memory: log any field the seller changed from the AI's draft, keyed
 // to the photo, so the next intake learns from it (feeds back in as hints).
 const ai = (body.aiDraft && typeof body.aiDraft === "object" ? body.aiDraft : {}) as Record<string, unknown>;
 const photoUrl = typeof body.photo === "string" && body.photo ? body.photo : (images[images.length - 1] ?? null);
 const itemCategory = str(body.category, 60);
 const fieldRows = (["brand", "era", "material", "condition", "category"] as const).map((f) => ({
 field: f,
 aiValue: typeof ai[f] === "string" ? (ai[f] as string) : null,
 finalValue: String((body as Record<string, unknown>)[f] ?? "").trim(),
 imageUrl: photoUrl,
 category: itemCategory,
 }));
 // logCorrections → the hint loop (brand fixes). logPredictions → the acceptance
 // flow: every AI-predicted field + whether the seller kept it, for true accuracy.
 await logCorrections(slug, fieldRows).catch(() => {});
 await logPredictions(slug, fieldRows).catch(() => {});

 // Per-store memory: the photo embedding + confirmed labels (visual matching) AND
 // the comp market value vs. this final price (so we learn this store's pricing).
 // Recorded even without an embedding so pricing still learns when Voyage is off.
 const embedding = Array.isArray(body.embedding) ? (body.embedding as number[]) : [];
 await rememberItem(slug, {
 imageUrl: photoUrl,
 embedding,
 title,
 brand: str(body.brand, 80),
 era: str(body.era, 40),
 material: str(body.material, 120),
 condition: str(body.condition, 80),
 category: str(body.category, 60),
 marketCents: typeof body.marketCents === "number" ? Math.round(body.marketCents) : null,
 priceCents: price > 0 ? Math.round(price * 100) : null,
 confidence: typeof body.aiConfidence === "number" ? body.aiConfidence : null,
 }).catch(() => {});

 // Golden training record: photo + AI guess + seller's final answer + trust/version,
 // one clean row per listing. The dataset our own model will one day learn from.
 const usedAi = Object.keys(ai).length > 0;
 await recordIntakeExample({
 itemId: item.id,
 storeSlug: slug,
 imageUrls: images,
 final: { brand: str(body.brand, 80), era: str(body.era, 40), material: str(body.material, 120), condition: str(body.condition, 80), category: str(body.category, 60), size: str(body.size, 40), title, description: str(body.description, 2000) },
 priceCents: price > 0 ? Math.round(price * 100) : null,
 marketCents: typeof body.marketCents === "number" ? Math.round(body.marketCents) : null,
 ai: {
 brand: typeof ai.brand === "string" ? ai.brand : null,
 era: typeof ai.era === "string" ? ai.era : null,
 material: typeof ai.material === "string" ? ai.material : null,
 condition: typeof ai.condition === "string" ? ai.condition : null,
 category: typeof ai.category === "string" ? ai.category : null,
 title: typeof ai.title === "string" ? ai.title : null,
 description: typeof ai.description === "string" ? ai.description : null,
 runway: typeof body.runway === "string" ? body.runway : null,
 celebrity: typeof body.celebrity === "string" ? body.celebrity : null,
 },
 reverseImage: body.reverseImage ?? null,
 promptVersion: typeof body.promptVersion === "string" ? body.promptVersion : null,
 // Human-authored or seller-reviewed = high-trust label; unreviewed AI = medium.
 trust: !usedAi ? "high" : body.reviewed ? "high" : "medium",
 }).catch(() => {});

 logActivity({ storeSlug: slug, kind: item.status === "draft" ? "listed" : "published", detail: title });
 return NextResponse.json({ ok: true, itemId: item.id, status: item.status, scheduled, publishAt: publishAt?.toISOString() ?? null, crossListing });
}
