import { NextRequest } from "next/server";

// Placeholder imagery for the template gallery, served as a real URL rather than a data: URI.
//
// Why a route and not a data URI: several block types store their image lists as ONE string and
// split it on commas as well as newlines (see ITEM_SCHEMAS `loose` in storefront-items.ts — the
// gallery and marquee accept either, because sellers paste both). Every data URI contains a comma
// by definition, so each one was torn into two broken fragments. A plain URL has no comma and
// survives any of those parsers.

const HEX = /^[0-9a-fA-F]{6}$/;

// Tone per slot, so a grid of placeholders has rhythm instead of reading as a rendering fault.
const TONES = [0.05, 0.09, 0.06, 0.12, 0.07, 0.1, 0.05, 0.13, 0.08, 0.06, 0.11, 0.07];

export function GET(req: NextRequest) {
 const q = req.nextUrl.searchParams;
 // Strictly validated: these values are interpolated into markup, so anything that isn't six hex
 // digits is replaced rather than escaped.
 const ink = HEX.test(q.get("ink") || "") ? `#${q.get("ink")}` : "#111111";
 const bg = HEX.test(q.get("bg") || "") ? `#${q.get("bg")}` : "#FFFFFF";
 const tone = TONES[Math.abs(Number(q.get("i")) || 0) % TONES.length];

 // preserveAspectRatio="none" — the panel STRETCHES to whatever box it lands in rather than being
 // cropped. That matters because these slots run from a 5-up thumbnail to a full-bleed band: with
 // the default slice behaviour any artwork inside is scaled up with the box, which is how a small
 // picture icon became a two-metre-wide drawing across the top of the page.
 //
 // So there is no artwork. A flat tint with a hairline at the true edges reads as a considered
 // blank at every size, and never as a broken image.
 const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
  `<rect width="100" height="100" fill="${bg}"/>` +
  `<rect width="100" height="100" fill="${ink}" opacity="${tone}"/>` +
  `<rect x="0.4" y="0.4" width="99.2" height="99.2" fill="none" stroke="${ink}" stroke-opacity="0.14" stroke-width="0.8" vector-effect="non-scaling-stroke"/>` +
  `</svg>`;

 return new Response(svg, {
  headers: {
   "Content-Type": "image/svg+xml",
   // Immutable: the output is a pure function of the query string.
   "Cache-Control": "public, max-age=31536000, immutable",
  },
 });
}
