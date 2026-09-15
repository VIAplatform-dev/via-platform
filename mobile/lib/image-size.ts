// Asking a store's CDN for the size we are actually going to draw. Pure, no imports, so it can be
// tested directly.
//
// THE SIZE IS THE WHOLE POINT. Marketplace photos are the originals the stores uploaded, straight
// off their own CDNs, and they are enormous: one measured Shopify photo is 2,056,519 bytes. A
// screen of 24 cards is therefore ~49 MB of image over the phone's connection, to fill tiles about
// an inch and a half wide. That, not the JSON, is why the app feels slow. Every feed request
// itself came back in under half a second.
//
// Shopify, Squarespace and Wix all resize on demand from the URL, so this costs nothing and needs
// no service of ours. The same photo:
//
//     original  2,056,519 bytes        w=600     50,870
//     w=200         8,825              w=1200   173,769
//     w=400        25,868              w=2000   374,055
//
// Seller-side photos, the ones taken in the app. Live on Vercel Blob, which has no resize
// parameter, so those come back untouched. Shrinking them is a separate job, on the server.
//
// This mirrors app/lib/imageUtils.ts on the web, deliberately: same hosts, same parameters. If a
// CDN's scheme changes, the two have to change together.

/**
 * The sizes we actually draw at, so call sites say what the picture is FOR rather than guessing a
 * number. Generous against a 3x screen. A card an inch and a half wide is ~555 real pixels.
 */
export const IMG = {
 /** Search rows, cart lines, message headers. An inch or less. */
 thumb: 200,
 /** Grid cards and rails: the feed, a store's window, collections. */
 card: 600,
 /** One photo filling the width of the phone. A product page. */
 hero: 1200,
 /** Zoomed, where the point is to look closely. */
 full: 2000,
} as const;

/** Squarespace only serves these buckets; anything else is ignored and the original comes back. */
const SQUARESPACE_BUCKETS = [100, 300, 500, 750, 1000, 1500, 2500];

/**
 * The same picture from the same CDN, rendered smaller. Hosts we don't recognise. Vercel Blob, a
 * store serving its own images. Come back untouched rather than carrying parameters they ignore.
 */
export function resizeImage(url: string, width: number): string {
 const w = Math.max(1, Math.round(width));
 try {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();

  // Shopify: ?width=&quality=, plus format.
  //
  // FORMAT, BECAUSE QUALITY DOES NOTHING TO A PNG. PNG is lossless, so `quality=75` is ignored and
  // a 600px PNG still arrives at a third of a megabyte. Measured across 14 of ours, the PNGs were
  // 4.7 MB at card size with the width alone. Asking for JPEG took that to 2.7 MB. Shopify declines
  // the conversion where it would be wrong (a cut-out with transparency) and returns the PNG
  // byte-for-byte, so this only ever helps: of those 14, four converted and ten came back
  // identical. Photographs on a card are drawn over an opaque tile regardless.
  if (host.endsWith("cdn.shopify.com") || host.endsWith("shopifycdn.com") || host.endsWith(".myshopify.com")) {
   u.searchParams.set("width", String(w));
   u.searchParams.set("quality", "75");
   u.searchParams.set("format", "jpg");
   return u.toString();
  }

  // Squarespace: ?format=NNNw, and only from its own list of sizes.
  if (host.endsWith("squarespace-cdn.com") || host.endsWith("sqspcdn.com")) {
   u.searchParams.set("format", `${SQUARESPACE_BUCKETS.find((b) => b >= w) ?? 2500}w`);
   return u.toString();
  }

  // Wix: the size is a path segment, "/v1/fit/w_1080,h_1920,q_90/". Rewriting w_ and h_ together
  // keeps the shape of the crop the store chose; changing only the width would stretch it.
  if (host.endsWith("wixstatic.com")) {
   u.pathname = u.pathname.replace(/\/w_(\d+),h_(\d+)/, (whole, ws: string, hs: string) => {
    const ow = Number(ws);
    const oh = Number(hs);
    if (!ow || !oh || ow <= w) return whole; // already smaller than we asked for
    return `/w_${w},h_${Math.max(1, Math.round((oh * w) / ow))}`;
   });
   return u.toString();
  }
 } catch {
  // Not a URL we can parse. Leave it exactly as it came.
 }
 return url;
}

/**
 * Pixels to ask for, given a width in layout points and the screen's density.
 *
 * CAPPED AT 2x ON PURPOSE. A modern phone is a 3x screen, and asking for 3x triples the bytes for a
 * difference nobody can see in a photograph. Sharp edges and text are where 3x earns its keep, and
 * these are neither. The floor matters too: a very small tile still wants enough pixels to survive
 * the CDN's own JPEG compression.
 */
export function widthForLayout(points: number, density: number): number {
 const d = Math.min(Number.isFinite(density) && density > 0 ? density : 2, 2);
 const px = Math.round((Number.isFinite(points) && points > 0 ? points : 0) * d);
 return Math.min(Math.max(px, IMG.thumb), IMG.full);
}
