import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { captureSite } from "@/app/lib/site-capture";
import { assertPublicUrl } from "@/app/lib/safe-url";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Public landing-page "rebuild your store" demo. Mirrors a store's homepage with the EXACT capture
// pipeline the real import uses (captureSite): strip all JS (which also removes JS-driven newsletter/
// cookie popups), inline the theme's CSS, surface lazy images and force the opacity:0 "reveal-on-JS"
// content visible, and drop Shopify chrome. The result is a faithful, self-contained, scrollable
// HTML+CSS clone served same-origin with no scripts to run — rendered in a script-less sandboxed
// iframe. Server-rendered themes (most Shopify) come through 1:1; a pure-JS SPA may render sparse,
// the same honest limitation the real import has. We then neutralize links/forms so the preview
// can't navigate away, and hide any leftover HTML popup overlay.

function errorDoc(msg: string): string {
 return `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;color:#8a7f74;background:#faf7f2;text-align:center;padding:24px"><div><p style="font-size:15px">${msg}</p></div></body></html>`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(request: NextRequest) {
 const raw = new URL(request.url).searchParams.get("url") || "";
 const html = (out: string, status = 200) =>
  new NextResponse(out, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=3600" } });

 const safe = await assertPublicUrl(raw); // normalizes + DNS-resolves + rejects internal/SSRF targets
 if (!safe) return html(errorDoc("Enter a valid store URL."), 400);
 const origin = new URL(safe.href).origin; // just the homepage

 let capturedHtml: string;
 try {
  // Same pipeline as import; rewriteLink → "#" so same-origin nav is dead in the demo.
  const cap = await captureSite(origin, { rewriteLink: () => "#" });
  capturedHtml = cap.html;
 } catch {
  return html(errorDoc("Couldn’t reach that site — it may block previews."));
 }

 // Neutralize anything that could navigate the preview away (external links captureSite left absolute,
 // and forms), keep nav inside the frame, and hide any HTML popup overlay left in the markup.
 const $ = cheerio.load(capturedHtml);
 $("a[href]").attr("href", "#");
 $("form").removeAttr("action").attr("onsubmit", "return false");
 $("head").prepend(`<base target="_self">`);
 $("head").append(`<style>[class*="popup"],[id*="popup"],[aria-modal="true"],[class*="modal-overlay"],[class*="modal-backdrop"],[class*="drawer-backdrop"]{display:none!important}</style>`);

 return html($.html());
}
