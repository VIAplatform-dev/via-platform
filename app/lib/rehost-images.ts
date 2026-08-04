import { put } from "@vercel/blob";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Re-host an external product image onto VYA's own Vercel Blob storage. Migrated
// inventory otherwise hot-links to the seller's old CDN (cdn.shopify.com etc.), so
// every image 404s the day they cancel that platform — the single biggest thing
// stopping a store from fully leaving Shopify. Re-hosting copies the bytes to our
// storage so the listing survives.
//
// Idempotent: the blob path is a hash of the source URL, so re-imports reuse the
// same object (allowOverwrite) instead of piling up duplicates. Fails SOFT — returns
// the original URL if the copy fails, so one bad image never breaks an import.
// ─────────────────────────────────────────────────────────────────────────────

function isAlreadyOurs(url: string): boolean {
 return url.includes(".public.blob.vercel-storage.com") || url.includes("/i/"); // Blob or our /i proxy
}

export async function rehostImage(sourceUrl: string, storeSlug: string): Promise<string> {
 if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
 if (isAlreadyOurs(sourceUrl)) return sourceUrl;
 if (!process.env.BLOB_READ_WRITE_TOKEN) return sourceUrl; // no storage configured → leave as-is
 try {
 const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
 if (!res.ok) return sourceUrl;
 const buf = Buffer.from(await res.arrayBuffer());
 if (buf.byteLength === 0) return sourceUrl;
 const contentType = res.headers.get("content-type") || "image/jpeg";
 const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "jpg";
 const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
 const pathname = `imported/${storeSlug}/${hash}.${ext}`;
 const blob = await put(pathname, buf, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true });
 return blob.url;
 } catch {
 return sourceUrl;
 }
}

/** Re-host a list of image URLs (capped), preserving order. */
export async function rehostImages(urls: (string | null | undefined)[], storeSlug: string, max = 8): Promise<string[]> {
 const clean = urls.filter((u): u is string => !!u && /^https?:\/\//i.test(u)).slice(0, max);
 const out = await Promise.all(clean.map((u) => rehostImage(u, storeSlug)));
 return out.filter(Boolean);
}
