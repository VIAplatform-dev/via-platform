import { NextRequest, NextResponse } from "next/server";
import { put, list, del } from "@vercel/blob";
import sharp from "sharp";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Formats a browser can render directly — stored as-is (keeps PNG transparency, GIF animation, SVG).
// Anything else (notably iPhone HEIC) is transcoded to JPEG so it actually displays on the storefront.
const WEB_SAFE = /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/i;

// A store's media library — photos they upload to drop into their storefront (hero,
// banners, lookbook). Stored in Blob under a per-store prefix; no DB table needed —
// the prefix IS the library, and it namespaces each store's assets.
const prefixFor = (slug: string) => `assets/${slug}/`;

// GET — list the store's uploaded photos, newest first.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const { blobs } = await list({ prefix: prefixFor(slug) });
 const assets = blobs
 .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
 .map((b) => ({ url: b.url, pathname: b.pathname, size: b.size }));
 return NextResponse.json({ assets });
 } catch (err) {
 console.error("asset list error:", err);
 return NextResponse.json({ assets: [] });
 }
}

// POST (multipart) — upload one photo into the library.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const formData = await request.formData();
 const file = formData.get("file") as File | null;
 if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
 // HEIC often arrives with an empty type; let it through and let sharp be the real validator below.
 if (file.type && !file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
 if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 25MB" }, { status: 400 });

 const stamp = `${prefixFor(slug)}${Date.now()}-${Math.round(Math.random() * 1e6)}`;

 // Already a web format → store untouched (preserves transparency/animation).
 if (WEB_SAFE.test(file.type)) {
 const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
 const blob = await put(`${stamp}.${ext}`, file, { access: "public", contentType: file.type });
 return NextResponse.json({ url: blob.url });
 }

 // Otherwise transcode to JPEG. sharp handles most inputs; iPhone HEIC/HEVC needs the heic-convert
 // (WASM libheif) fallback, then back through sharp to honor EXIF rotation and cap dimensions.
 const input = Buffer.from(await file.arrayBuffer());
 const toJpeg = (buf: Buffer) => sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
 let output: Buffer;
 try {
 output = await toJpeg(input);
 } catch (e1) {
 try {
 const convert = (await import("heic-convert")).default;
 const jpeg = Buffer.from(await convert({ buffer: input, format: "JPEG", quality: 0.92 }));
 output = await toJpeg(jpeg);
 } catch (e2) {
 console.error("[assets] image decode failed:", e1, e2);
 return NextResponse.json({ error: "Couldn’t read that image — try a JPG or PNG." }, { status: 400 });
 }
 }
 const blob = await put(`${stamp}.jpg`, output, { access: "public", contentType: "image/jpeg" });
 return NextResponse.json({ url: blob.url });
 } catch (err) {
 console.error("asset upload error:", err);
 return NextResponse.json({ error: "Upload failed" }, { status: 500 });
 }
}

// DELETE ?url= — remove a photo (only from the acting store's own library).
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const url = request.nextUrl.searchParams.get("url") || "";
 if (!url || !url.includes(prefixFor(slug))) return NextResponse.json({ error: "Not your asset." }, { status: 403 });
 try {
 await del(url);
 return NextResponse.json({ ok: true });
 } catch (err) {
 console.error("asset delete error:", err);
 return NextResponse.json({ error: "Delete failed" }, { status: 500 });
 }
}
