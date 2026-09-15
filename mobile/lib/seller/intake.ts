import { API_BASE_URL, getAuthToken, ApiError } from "../api";
import { apiPost } from "../api";
import { filledFields } from "./listing";
import { normalizeDraft, readEstimate, costFromText, unsureFields, declinedBrand, UNBRANDED, type DraftFields } from "./intake-shape";

// The listing pipeline, in one place.
//
// Three server calls, in order, all of them the SAME endpoints the desktop uses:
//   1. /api/store/listings/upload: multipart, one photo at a time → a blob URL
//   2. /api/store/intake: { imageUrls, filled } → drafted fields
//   3. /api/store/intake/pricing. { fields, imageUrls } → price + comps count
//   4. /api/store/intake/publish: { ...fields, status } → a real item
//
// Upload has to come first because intake takes URLs, not bytes: the server re-encodes every
// photo to JPEG with sharp, which is not optional. IPhone photos are HEIC and the AI cannot read
// HEIC at all ("file format is invalid or unsupported").

export type { DraftFields };

/**
 * One photo → one hosted URL.
 *
 * React Native's fetch takes { uri, name, type } as a file part; do NOT set Content-Type by hand
 * or the boundary is lost and the server sees no file.
 */
export async function uploadPhoto(uri: string): Promise<string> {
  const form = new FormData();
  form.append("file", { uri, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" } as unknown as Blob);

  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/store/listings/upload`, {
    method: "POST",
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status, "/api/store/listings/upload", detail?.error);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

/**
 * Phase 1: the fields. `draftOnly` so the form can render before pricing is done.
 *
 * The response is normalised here rather than at the call sites: the raw shape has the fields
 * under `draft` and wraps half of them in {value, confidence}, and every screen that touched it
 * raw got either undefined or an object it could not render.
 */
export async function draftListing(imageUrls: string[], typedFields: Record<string, string | undefined>) {
  const r = await apiPost<{
    draft?: { priceHint?: number | null } | null;
    searchQuery?: string; reverseComps?: unknown[]; reverseTitles?: string[]; editorialTitles?: string[];
    needDraft?: boolean;
  }>("/api/store/intake", { imageUrls, filled: filledFields(typedFields), draftOnly: true });

  // THE MODEL'S OWN PRICE FOR THE PIECE, carried through to the pricer. It is the last thing
  // standing when the comparables are useless: price-engine falls back to it rather than to
  // whatever the comp search dragged in. The desktop has always sent it and the phone never did,
  // which is why a Todd Oldham dress priced at 1,681 here and 16,013 on the phone. Same photo,
  // same endpoints, less evidence.
  const hint = typeof r.draft?.priceHint === "number" && r.draft.priceHint > 0 ? r.draft.priceHint * 100 : null;

  // Which of those the model was NOT sure about, read off the raw payload before normalizeDraft
  // flattens the confidences away. The web has always marked these "AI unsure. Confirm"; the phone
  // showed a 0.4-confidence brand in the same ink as one read off a tag.
  const unsure = unsureFields(r.draft, typedFields);

  // The model looked and found no house. Say so in the field rather than leaving a blank box that
  // reads as "we didn't get to it". Flagged as unsure alongside it, so she knows to check the label.
  const fields = normalizeDraft(r.draft);
  if (declinedBrand(r.draft, typedFields)) fields.brand = UNBRANDED;

  return {
    fields,
    unsure,
    searchQuery: r.searchQuery,
    reverseComps: r.reverseComps,
    reverseTitles: r.reverseTitles,
    editorialTitles: r.editorialTitles,
    knowledgeHintCents: hint,
    draftRanFull: r.needDraft === true,
  };
}

/**
 * Phase 2: the number, and how many comparable sales stand behind it.
 *
 * The route answers { ok, estimate, priceFlag, runway, celebrity }; the price lives at
 * estimate.suggestedCents and the comps count is estimate.comps.length. There is no top-level
 * `price`: reading for one returned undefined and the Review screen showed an empty row.
 */
export async function priceListing(imageUrls: string[], fields: DraftFields, extras: Record<string, unknown> = {}) {
  const r = await apiPost<{ estimate?: { suggestedCents?: number | null; marketCents?: number | null; comps?: unknown[] | null } }>(
    "/api/store/intake/pricing",
    { imageUrls, fields, ...extras },
  );
  return readEstimate(r.estimate);
}

/**
 * Publish, or save as a draft. Same route either way. `status` decides.
 *
 * `priceCents` in, MAJOR units out: the route does `Number(body.price) * 100`. Sending cents
 * would list a $219 pair of shoes at $21,921, so the conversion lives here rather than in each
 * screen that publishes.
 */
export async function publishListing(
  fields: Omit<DraftFields, "cost"> & {
    imageUrls: string[];
    priceCents?: number | null;
    cost?: string | number;
    /** ISO. A draft with this set is flipped live by the publish-scheduled cron, not by this call. */
    publishAt?: string;
    /** Whose piece it is; the split is resolved server-side from the consignor's record. */
    consignment?: { consignorId: number };
    /** Marketplaces to fan out to when it goes live. */
    channels?: string[];
    /** Collection TITLES, as the item PATCH and the web editor take them: the route creates one
     *  that doesn't exist yet, so a new collection can be made from the listing flow. */
    collections?: string[];
    /**
     * WHAT THE AI PROPOSED, so the publish can see what she changed.
     *
     * /api/store/intake/publish compares this against the values actually being published and
     * writes every difference to the correction memory (logCorrections), which feeds back into the
     * next intake as hints. The desktop has sent it since the loop was built. The phone never did,
     * so a seller who fixed a brand, a price or a description on her phone taught the model
     * nothing: the single richest source of corrections we have was going in the bin.
     */
    aiDraft?: Record<string, unknown>;
    /** The photograph the draft was read from, so a correction is keyed to the image. */
    photo?: string;
  },
  status: "active" | "draft",
) {
  const { priceCents, cost, imageUrls, aiDraft, photo, ...rest } = fields;
  // Cost travels like price: major units, and only when she gave one. A blank must not be sent
  // as 0, which the margin report would read as free stock.
  const costMajor = costFromText(cost);
  // The route answers { ok, itemId, status, scheduled, publishAt, crossListing }. ItemId at the
  // top level, not a nested item object.
  return apiPost<{ ok: boolean; itemId?: string; status?: string }>("/api/store/intake/publish", {
    ...rest,
    // `images`, NOT `imageUrls`. THIS DROPPED EVERY PHOTO TAKEN ON THE PHONE.
    //
    // The two intake routes before this one read `imageUrls`, so the name carried all the way
    // through the flow and then quietly stopped matching at the last step: publish reads
    // `body.images`, found nothing, and stored an empty array. Nothing errored. The piece arrived
    // in Inventory with a blank square, which is what "Untitled piece" with no picture was.
    images: imageUrls,
    ...(typeof priceCents === "number" && priceCents > 0 ? { price: priceCents / 100 } : {}),
    ...(costMajor !== undefined ? { cost: costMajor } : {}),
    // Sent as-is: the route reads body.aiDraft and body.photo and does the comparing.
    ...(aiDraft ? { aiDraft } : {}),
    ...(photo ? { photo } : {}),
    status,
  });
}
