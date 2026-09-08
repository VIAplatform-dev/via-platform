import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { cropRect, CARD_ASPECT } from "@/app/lib/image-crop";

export const runtime = "nodejs";

/**
 * Crop a listing photo to the card's shape.
 *
 * The pixels are changed rather than a focal point stored, because a listing photo is sent to eBay
 * and Depop as a bare URL — they decide the crop, and no instruction of ours travels with it. It
 * also means the eighty-odd places that render an item photo need no change at all.
 *
 * The original blob is left in storage; this writes a new file beside it.
 */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const src = typeof body?.url === "string" ? body.url : "";
 if (!/^https?:\/\//i.test(src)) return NextResponse.json({ error: "No image" }, { status: 400 });

 try {
  const res = await fetch(src, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return NextResponse.json({ error: "Couldn’t read that image" }, { status: 400 });
  const input = Buffer.from(await res.arrayBuffer());

  // `.rotate()` first: EXIF orientation has to be applied before the metadata is trustworthy, or a
  // portrait photo taken sideways reports landscape dimensions and the crop lands on the wrong axis.
  const upright = await sharp(input).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  if (!meta.width || !meta.height) return NextResponse.json({ error: "Couldn’t read that image" }, { status: 400 });

  const rect = cropRect(
   { width: meta.width, height: meta.height },
   { aspect: CARD_ASPECT, zoom: Number(body?.zoom) || 1, panX: Number(body?.panX) || 0, panY: Number(body?.panY) || 0 },
  );

  const output = await sharp(upright)
   .extract(rect)
   .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
   .jpeg({ quality: 88 })
   .toBuffer();

  const filename = `listings/${slug}/${Date.now()}-${Math.round(Math.random() * 1e6)}-crop.jpg`;
  const blob = await put(filename, output, { access: "public", contentType: "image/jpeg" });
  return NextResponse.json({ url: blob.url });
 } catch (err) {
  console.error("[crop] failed:", err);
  return NextResponse.json({ error: "Couldn’t crop that image" }, { status: 500 });
 }
}
