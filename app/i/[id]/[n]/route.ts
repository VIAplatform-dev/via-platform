import { NextResponse } from "next/server";
import { getProductById } from "@/app/lib/db";
import { resizeImage } from "@/app/lib/imageUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Product image proxy — serves each listing's photo from a CLEAN vyaplatform.com
// URL (e.g. /i/mookie-studios-3780080/0.jpg) instead of the seller's cdn.shopify.com.
// This is what lets Google/Lens attribute the image to the VYA page (and surface us
// in reverse-image search), rather than crediting the seller's original store which
// serves the same bytes. Only serves images that belong to a DB-known, displayable
// product — so it is NOT an open proxy (no SSRF). Cached hard at the edge, so the
// upstream fetch happens rarely and bandwidth stays cheap.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 2592000; // 30 days

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
 const { id, n } = await params;

 // Composite id → numeric dbId (the trailing number). Index → strip any ".jpg".
 const dbMatch = id.match(/-(\d+)$/);
 const dbId = dbMatch ? parseInt(dbMatch[1], 10) : NaN;
 const index = parseInt(n, 10);
 if (isNaN(dbId) || isNaN(index) || index < 0) {
 return new NextResponse("Not found", { status: 404 });
 }

 // getProductById already filters hidden/disabled + shopify-without-collabs, so we
 // never serve images for products that aren't publicly displayable.
 const product = await getProductById(dbId).catch(() => null);
 if (!product) return new NextResponse("Not found", { status: 404 });

 let images: string[] = [];
 if (product.images) {
 try { const parsed = JSON.parse(product.images); if (Array.isArray(parsed)) images = parsed; } catch {}
 }
 if (images.length === 0 && product.image) images = [product.image];

 const raw = images[index];
 if (!raw || !/^https?:\/\//i.test(raw)) return new NextResponse("Not found", { status: 404 });

 // Request a large, clean render (good for reverse-image matching) where the CDN supports it.
 const src = resizeImage(raw, 1600);

 let upstream: Response;
 try {
 upstream = await fetch(src, { signal: AbortSignal.timeout(12000) });
 } catch {
 return new NextResponse("Upstream error", { status: 502 });
 }
 if (!upstream.ok || !upstream.body) return new NextResponse("Upstream error", { status: 502 });

 const contentType = upstream.headers.get("content-type") || "image/jpeg";
 return new NextResponse(upstream.body, {
 status: 200,
 headers: {
 "Content-Type": contentType,
 // 7d browser, 30d CDN, serve-stale-while-revalidating — stable enough for Google to
 // index, cheap enough that we almost never re-fetch the seller's CDN.
 "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800",
 },
 });
}
