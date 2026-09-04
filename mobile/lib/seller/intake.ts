import { API_BASE_URL, getAuthToken, ApiError } from "../api";
import { apiPost } from "../api";
import { filledFields } from "./listing";

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

export type DraftFields = {
  title?: string;
  brand?: string;
  era?: string;
  material?: string;
  condition?: string;
  category?: string;
  description?: string;
  size?: string;
  price?: string;
};

export type Pricing = { price?: string; priceCents?: number; compsCount?: number; comps?: unknown[] };

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

/** Phase 1 — the fields. `draftOnly` so the form can render before pricing is done. */
export async function draftListing(imageUrls: string[], typedFields: Record<string, string | undefined>) {
  return apiPost<{ fields: DraftFields; searchQuery?: string; reverseComps?: unknown[]; reverseTitles?: string[] }>(
    "/api/store/intake",
    { imageUrls, filled: filledFields(typedFields), draftOnly: true },
  );
}

/** Phase 2 — the number, and how many comparable sales stand behind it. */
export async function priceListing(imageUrls: string[], fields: DraftFields, extras: Record<string, unknown> = {}) {
  return apiPost<Pricing>("/api/store/intake/pricing", { imageUrls, fields, ...extras });
}

/** Publish, or save as a draft. Same route either way — `status` decides. */
export async function publishListing(fields: DraftFields & { imageUrls: string[] }, status: "active" | "draft") {
  return apiPost<{ ok: boolean; item?: { id: string } }>("/api/store/intake/publish", { ...fields, status });
}
