import { NextResponse } from "next/server";

// SHOPIFY APP PROXIES — answered cheaply, because we do not host the seller's Shopify apps.
//
// `/apps/{app}/…` is Shopify's app-proxy namespace: an installed app's own JavaScript and JSON
// endpoints, served on the shop's domain and forwarded by Shopify to the app's server. Those apps
// stay on Shopify; they do not come over with the site, and nothing here can answer for them.
//
// The problem was never the 404 — it was WHAT the 404 was. These paths carry a file extension, so
// they skip middleware (the matcher excludes dotted paths) and fell through to Next's own not-found
// page: 103KB of HTML, returned for a request for a script. The browser then refused it with
// "MIME type ('text/html') is not executable", and an app fetching JSON parsed `<!DOCTYPE` and
// threw. On tesselizabethvintage that was Awin's tracker and the Appointly booking widget, and
// 103KB of wasted transfer on every page that referenced one.
//
// Same lesson as the Shopify monorail beacon (see proxy.ts): a request we are never going to answer
// should cost a line, not a page.
export const dynamic = "force-dynamic";

function gone() {
 return new NextResponse("Not found", {
  status: 404,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
 });
}

export const GET = gone;
export const HEAD = gone;
export const POST = gone;
