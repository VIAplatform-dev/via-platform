import { ImageResponse } from "next/og";
import { getProductById } from "@/app/lib/db";
import { getItem } from "@/app/lib/db/inventory";

export const runtime = "nodejs";

// An inventory item id is a UUID; a marketplace product id is "{store-slug}-{digits}".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Instagram Story card generator — 1080×1920 (9:16) PNG for any product.
//
// GET /api/story/{store-slug}-{id}          → the card
// GET /api/story/{store-slug}-{id}?cta=...   → override the call-to-action text
//
// Deliberately minimal: the product photo full-bleed, one "Shop now" button. Meta's
// Content Publishing API lets us publish an IMAGE to Stories but NOT a clickable link
// sticker, so the button pairs with the Messaging auto-DM-on-story-reply flow (a reply
// triggers a DM with the product link). Stores can also post this by hand today.

const CREAM = "#FFFDF8";
const BURGUNDY = "#5D0F17";
const TAN = "#D8CABD";

const WIDTH = 1080;
const HEIGHT = 1920;

// satori (next/og) can't decode WebP, and some store CDNs serve WebP via content
// negotiation. Fetch forcing JPEG/PNG and inline as a data URI; null → branded fallback.
async function fetchAsDataUri(url: string): Promise<string | null> {
 try {
  const res = await fetch(url, { headers: { Accept: "image/jpeg,image/png" } });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "";
  if (!/image\/(jpeg|png)/.test(type)) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buffer.toString("base64")}`;
 } catch {
  return null;
 }
}

export async function GET(
 request: Request,
 { params }: { params: Promise<{ itemId: string }> }
) {
 const { itemId } = await params;
 const cta = new URL(request.url).searchParams.get("cta") || "Shop now";

 let imageUrl: string | null = null;
 try {
  if (UUID_RE.test(itemId)) {
   // OS inventory item (one-of-one) — the item a store publishes to its own storefront.
   const item = await getItem(itemId);
   const first = item?.images?.[0];
   if (first) imageUrl = await fetchAsDataUri(first);
  } else {
   // Marketplace product — composite "{store-slug}-{id}".
   const m = itemId.match(/^(.+)-(\d+)$/);
   const dbId = m ? parseInt(m[2], 10) : NaN;
   if (!isNaN(dbId)) {
    const product = await getProductById(dbId);
    if (product?.image) imageUrl = await fetchAsDataUri(product.image);
   }
  }
 } catch {}

 return new ImageResponse(
  (
   <div
    style={{
     position: "relative",
     display: "flex",
     width: `${WIDTH}px`,
     height: `${HEIGHT}px`,
     backgroundColor: TAN,
     alignItems: "center",
     justifyContent: "center",
     fontFamily: "serif",
    }}
   >
    {imageUrl ? (
     <img src={imageUrl} alt="" width={WIDTH} height={HEIGHT} style={{ objectFit: "cover" }} />
    ) : (
     <span style={{ fontSize: 220, color: BURGUNDY, opacity: 0.28 }}>VYA</span>
    )}

    {/* Shop now button, centered near the bottom */}
    <div
     style={{
      position: "absolute",
      bottom: 150,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 96px",
      backgroundColor: CREAM,
      borderRadius: 999,
      fontSize: 60,
      letterSpacing: 3,
      color: BURGUNDY,
      boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
     }}
    >
     {cta}
    </div>
   </div>
  ),
  { width: WIDTH, height: HEIGHT }
 );
}
