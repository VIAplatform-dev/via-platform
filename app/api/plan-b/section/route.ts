import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ONE SECTION, RENDERED — Shopify's `?section_id=` convention, answered for a captured storefront.
//
// A theme asks for a section on its own and expects HTML back. We hold no Liquid, so we cannot
// render the seller's section; what matters is that the answer is HTML SHAPED THE WAY THE THEME
// EXPECTS, because the alternative is not "no widget" but a dead page:
//
//   fetch(url) → parse → doc.querySelector('#shopify-section-…') → null → TypeError
//
// and every line of the theme's startup after that never runs. On bag-crush that line is the image
// loader: 29 of 32 images on every product page sat at a blank placeholder, the thumbnail strip
// collapsed to a sliver, because of a missing pickup widget four steps earlier. Nothing that reads
// the markup could ever have caught it — the HTML is perfect; the page just never gets that far.
//
// The seller's own site answers this with an EMPTY section — she has no pickup locations — so
// matching her exactly is both correct and sufficient. 207 bytes, and the theme is happy.
export async function GET(request: NextRequest) {
 const id = (request.nextUrl.searchParams.get("section_id") || "").trim().slice(0, 80);
 // Only a section name a theme could have written. Never reflect arbitrary input into markup.
 const safe = /^[a-z0-9_-]+$/i.test(id) ? id : "section";
 const body =
  `<div id="shopify-section-${safe}" class="shopify-section">` +
  `<template data-html="${safe}-embed"></template>` +
  `<template data-html="${safe}-items"></template>` +
  `</div>`;
 return new NextResponse(body, {
  status: 200,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
 });
}
