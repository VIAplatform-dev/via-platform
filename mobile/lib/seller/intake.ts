import { API_BASE_URL, getAuthToken, ApiError } from "../api";
import { apiPost } from "../api";
import { filledFields } from "./listing";
import { normalizeDraft, readEstimate, type DraftFields } from "./intake-shape";

// The listing pipeline, in one place.
//
// Three server calls, in order, all of them the SAME endpoints the desktop uses:
//   1. /api/store/listings/upload   — multipart, one photo at a time → a blob URL
//   2. /api/store/intake            — { imageUrls, filled } → drafted fields
//   3. /api/store/intake/pricing    — { fields, imageUrls } → price + comps count
//   4. /api/store/intake/publish    — { ...fields, status } → a real item
//
// Upload has to come first because intake takes URLs, not bytes: the server re-encodes every
// photo to JPEG with sharp, which is not optional — iPhone photos are HEIC and the AI cannot read
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
 * Phase 1 — the fields. `draftOnly` so the form can render before pricing is done.
 *
 * The response is normalised here rather than at the call sites: the raw shape has the fields
 * under `draft` and wraps half of them in {value, confidence}, and every screen that touched it
 * raw got either undefined or an object it could not render.
 */
export async function draftListing(imageUrls: string[], typedFields: Record<string, string | undefined>) {
  const r = await apiPost<{
    draft?: unknown; searchQuery?: string; reverseComps?: unknown[]; reverseTitles?: string[]; editorialTitles?: string[];
  }>("/api/store/intake", { imageUrls, filled: filledFields(typedFields), draftOnly: true });

  return {
    fields: normalizeDraft(r.draft),
    searchQuery: r.searchQuery,
    reverseComps: r.reverseComps,
    reverseTitles: r.reverseTitles,
    editorialTitles: r.editorialTitles,
  };
}

/**
 * Phase 2 — the number, and how many comparable sales stand behind it.
 *
 * The route answers { ok, estimate, priceFlag, runway, celebrity }; the price lives at
 * estimate.suggestedCents and the comps count is estimate.comps.length. There is no top-level
 * `price` — reading for one returned undefined and the Review screen showed an empty row.
 */
export async function priceListing(imageUrls: string[], fields: DraftFields, extras: Record<string, unknown> = {}) {
  const r = await apiPost<{ estimate?: { suggestedCents?: number | null; marketCents?: number | null; comps?: unknown[] | null } }>(
    "/api/store/intake/pricing",
    { imageUrls, fields, ...extras },
  );
  return readEstimate(r.estimate);
}

/**
 * Publish, or save as a draft. Same route either way — `status` decides.
 *
 * `priceCents` in, MAJOR units out: the route does `Number(body.price) * 100`. Sending cents
 * would list a $219 pair of shoes at $21,921, so the conversion lives here rather than in each
 * screen that publishes.
 */
export async function publishListing(
  fields: DraftFields & { imageUrls: string[]; priceCents?: number | null },
  status: "active" | "draft",
) {
  const { priceCents, ...rest } = fields;
  // The route answers { ok, itemId, status, scheduled, publishAt, crossListing } — itemId at the
  // top level, not a nested item object.
  return apiPost<{ ok: boolean; itemId?: string; status?: string }>("/api/store/intake/publish", {
    ...rest,
    ...(typeof priceCents === "number" && priceCents > 0 ? { price: priceCents / 100 } : {}),
    status,
  });
}
