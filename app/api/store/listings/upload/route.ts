import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";

export const runtime = "nodejs";

// Image upload for a store's VYA-native listings. Auth = the acting store; files
// are namespaced under the store slug in Blob storage.
//
// Every upload is re-encoded to JPEG via sharp. This is essential: iPhone photos
// are HEIC, which Anthropic (and most browsers) can't read. Sending one to the AI
// intake fails with "file format is invalid or unsupported". Normalizing also
// honors EXIF rotation, strips metadata, and caps dimensions for speed/size.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 try {
 const formData = await request.formData();
 const file = formData.get("file") as File | null;
 if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
 // Allow when the browser reports an image type, OR when it reports nothing
 // (HEIC often has an empty type). Sharp is the real validator below.
 if (file.type && !file.type.startsWith("image/")) {
 return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
 }
 if (file.size > 25 * 1024 * 1024) {
 return NextResponse.json({ error: "Image must be under 25MB" }, { status: 400 });
 }

 const input = Buffer.from(await file.arrayBuffer());
 const toJpeg = (buf: Buffer) =>
 sharp(buf)
  .rotate() // honor EXIF orientation (phone photos)
  .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 85 })
  .toBuffer();

 let output: Buffer;
 try {
 output = await toJpeg(input);
 } catch (e1) {
 // sharp can't decode it. Almost always an iPhone HEIC/HEVC, which sharp's
 // prebuilt libvips lacks the codec for. Decode via heic-convert (WASM libheif,
 // no system codec needed), then run it back through sharp to resize.
 try {
 const convert = (await import("heic-convert")).default;
 const jpeg = Buffer.from(await convert({ buffer: input, format: "JPEG", quality: 0.92 }));
 output = await toJpeg(jpeg);
 } catch (e2) {
 console.error("[upload] image decode failed:", e1, e2);
 return NextResponse.json({ error: "Couldn’t read that image. Try a JPG or PNG." }, { status: 400 });
 }
 }

 const filename = `listings/${slug}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
 const blob = await put(filename, output, { access: "public", contentType: "image/jpeg" });
 return NextResponse.json({ url: blob.url });
 } catch (err) {
 console.error("Listing image upload error:", err);
 return NextResponse.json({ error: "Upload failed" }, { status: 500 });
 }
}
