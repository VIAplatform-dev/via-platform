import { test } from "node:test";
import assert from "node:assert/strict";
import { resizeImage, widthForLayout, IMG } from "./image-size.ts";

const SHOPIFY = "https://cdn.shopify.com/s/files/1/0885/7485/3411/files/IMG_9643.heic?v=1785701866";
const SQSP = "https://images.squarespace-cdn.com/content/v1/68af/954e/Bazaart.JPEG";
const WIX = "https://static.wixstatic.com/media/0baffa_f300~mv2.png/v1/fit/w_1080,h_1920,q_90/file.png";
const BLOB = "https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/items/abc-123.jpg";

test("Shopify takes width, quality and format, keeping the version it came with", () => {
 const u = new URL(resizeImage(SHOPIFY, IMG.card));
 assert.equal(u.searchParams.get("width"), "600");
 assert.equal(u.searchParams.get("quality"), "75");
 // Without this a PNG ignores `quality` and arrives at a third of a megabyte. Shopify declines the
 // conversion where it would be wrong and hands back the original, so asking costs nothing.
 assert.equal(u.searchParams.get("format"), "jpg");
 // v= is Shopify's cache key. Dropping it would serve a stale photo after a store re-uploads.
 assert.equal(u.searchParams.get("v"), "1785701866");
});

test("Squarespace only gets sizes it actually serves", () => {
 // 600 is not one of its buckets; the next one up is.
 assert.equal(new URL(resizeImage(SQSP, 600)).searchParams.get("format"), "750w");
 assert.equal(new URL(resizeImage(SQSP, IMG.thumb)).searchParams.get("format"), "300w");
 assert.equal(new URL(resizeImage(SQSP, 100)).searchParams.get("format"), "100w");
 // Larger than anything on the list: the biggest, not an invented size that comes back ignored.
 assert.equal(new URL(resizeImage(SQSP, 4000)).searchParams.get("format"), "2500w");
});

test("Wix is resized in the path, and the crop keeps its shape", () => {
 // 1080x1920 asked down to 600 wide stays 9:16.
 assert.match(resizeImage(WIX, 600), /\/w_600,h_1067,q_90\//);
 assert.match(resizeImage(WIX, IMG.thumb), /\/w_200,h_356,q_90\//);
 // Already smaller than we asked for: left alone rather than enlarged into blur.
 const small = "https://static.wixstatic.com/media/x~mv2.png/v1/fit/w_300,h_400,q_90/file.png";
 assert.equal(resizeImage(small, 600), small);
});

test("hosts with no resize parameter are left exactly as they are", () => {
 // Seller photos on Vercel Blob, and stores serving images off their own site.
 assert.equal(resizeImage(BLOB, IMG.card), BLOB);
 const own = "https://carrollstreetvintage.com/assets/floral-70s-jacket-1.jpg";
 assert.equal(resizeImage(own, IMG.card), own);
});

test("something that isn't a URL comes back untouched instead of throwing", () => {
 assert.equal(resizeImage("not a url", IMG.card), "not a url");
 assert.equal(resizeImage("", IMG.card), "");
});

test("a width that isn't a whole number doesn't reach the CDN as one", () => {
 // Card widths get computed from screen dimensions, which are rarely integers.
 assert.equal(new URL(resizeImage(SHOPIFY, 185.66667)).searchParams.get("width"), "186");
 assert.equal(new URL(resizeImage(SHOPIFY, 0)).searchParams.get("width"), "1");
});

test("every named size is a real number of pixels, largest last", () => {
 const sizes = [IMG.thumb, IMG.card, IMG.hero, IMG.full];
 assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
 for (const s of sizes) assert.ok(Number.isInteger(s) && s > 0);
});

test("a card asks for its own width in pixels, never more than twice over", () => {
 // A two-column grid on a 390pt phone: cards about 185pt wide.
 assert.equal(widthForLayout(185, 2), 370);
 // The same card on a 3x screen. Capped, because the extra pixels cost bytes and show nothing.
 assert.equal(widthForLayout(185, 3), 370);
 // A photo filling the width of the phone.
 assert.equal(widthForLayout(390, 3), 780);
});

test("the layout width is clamped at both ends", () => {
 // Too small to be worth asking for: the CDN's compression needs something to work with.
 assert.equal(widthForLayout(40, 2), IMG.thumb);
 // A tablet, or a bug: never ask for more than the largest size we ever draw.
 assert.equal(widthForLayout(4000, 2), IMG.full);
 // Not measured yet: a layout that hasn't been through a pass has width 0.
 assert.equal(widthForLayout(0, 3), IMG.thumb);
 assert.equal(widthForLayout(185, 0), 370);
 assert.equal(widthForLayout(NaN, NaN), IMG.thumb);
});
