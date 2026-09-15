/**
 * Resize a product image by appending the source CDN's own resize params.
 * Shopify and Squarespace both support on-the-fly resizing via the URL, no extra
 * service needed, and serve the result instantly from their global CDN. Asking
 * the source for a ~card-sized image (instead of the multi-MB original) is the
 * single biggest image-speed win, since 88%+ of our images are Shopify.
 * Non-resizable URLs (S3, Wix, store-hosted) are returned unchanged.
 */
export function resizeImage(
 url: string | null | undefined,
 width: number,
 quality = 75
): string {
 if (!url) return "";
 try {
 const u = new URL(url);
 const host = u.hostname;

 // Shopify CDN: ?width=&quality=
 if (
 host.includes("cdn.shopify.com") ||
 host.includes("shopifycdn.com") ||
 host.endsWith(".myshopify.com")
 ) {
 u.searchParams.set("width", String(width));
 u.searchParams.set("quality", String(quality));
 return u.toString();
 }

 // Squarespace CDN: ?format=NNNw (only specific buckets are supported)
 if (host.includes("squarespace-cdn.com") || host.includes("sqspcdn.com")) {
 const buckets = [100, 300, 500, 750, 1000, 1500, 2500];
 const bucket = buckets.find((b) => b >= width) ?? 1000;
 u.searchParams.set("format", `${bucket}w`);
 return u.toString();
 }
 } catch {
 // Invalid URL: return as-is
 }
 return url;
}

/**
 * True when resizeImage rewrites the URL to a CDN-resized variant. Such images are
 * already small and come from a fast global CDN, so they should be served directly
 * (unoptimized). Skipping the Vercel image-optimizer hop that otherwise cold-fetches
 * and re-encodes every image. Other hosts keep Vercel optimization so their full-size
 * originals still get shrunk.
 */
export function isSourceResizable(url: string | null | undefined): boolean {
 if (!url) return false;
 try {
 const host = new URL(url).hostname;
 return (
 host.includes("cdn.shopify.com") ||
 host.includes("shopifycdn.com") ||
 host.endsWith(".myshopify.com") ||
 host.includes("squarespace-cdn.com") ||
 host.includes("sqspcdn.com")
 );
 } catch {
 return false;
 }
}

/**
 * Whether to serve a resizable image DIRECTLY (unoptimized), skipping the Vercel
 * optimizer. We do this for most CDN-resized images because they're already small
 * and load instantly. The exception is PNGs: the source CDN's `quality` param does
 * nothing on lossless PNG, so a 1200px PNG is still 1–2MB. Browsers that send
 * `Accept: image/webp` get a tiny WebP via content negotiation, but in-app
 * browsers (Instagram/TikTok webviews) often DON'T, and then download the full
 * multi-MB PNG (the "image takes 10s to load" bug). Routing PNGs through the Vercel
 * optimizer guarantees a compressed WebP/AVIF for every client, regardless of
 * Accept headers, and the result is edge-cached after the first fetch.
 */
export function shouldServeUnoptimized(url: string | null | undefined): boolean {
 if (!isSourceResizable(url)) return false;
 try {
 const path = new URL(url!).pathname.toLowerCase();
 if (path.endsWith(".png")) return false; // let Vercel compress PNGs
 } catch {
 return false;
 }
 return true;
}
