import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Public (landing-page "Import a site" trial): fetch a store's real homepage and return it as a
// self-rendering document for a SANDBOXED iframe preview — a faithful clone of what their site
// actually looks like. We keep the theme's own JS (it draws hero videos, slideshows, and lays out
// lazy images — Squarespace/Shopify need it), inject a <base> so the origin's own assets load, and
// strip only the CSP (blocks our <base>) + analytics/trackers. The iframe sandbox runs the theme
// JS in an isolated origin, walled off from our page.
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const TRACKERS = /google-analytics|googletagmanager|gtag\/js|connect\.facebook|facebook\.net|fbevents|tiktok|snap\.licdn|pinterest|hotjar|clarity\.ms|doubleclick|criteo|bat\.bing|monorail|web-pixel/i;

function normalizeUrl(raw: string): string | null {
 let u = raw.trim();
 if (!u) return null;
 if (!/^https?:\/\//i.test(u)) u = "https://" + u;
 try { const p = new URL(u); if (!/\./.test(p.hostname)) return null; return p.origin + (p.pathname === "/" ? "" : p.pathname); } catch { return null; }
}

function errorDoc(msg: string): string {
 return `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;color:#8a7f74;background:#faf7f2;text-align:center;padding:24px"><div><p style="font-size:15px">${msg}</p></div></body></html>`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(request: NextRequest) {
 const origin = normalizeUrl(new URL(request.url).searchParams.get("url") || "");
 const html = (out: string, status = 200) =>
 new NextResponse(out, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
 if (!origin) return html(errorDoc("Enter a valid store URL."), 400);

 let raw = "";
 try {
 const res = await fetch(origin, { headers: UA, signal: AbortSignal.timeout(9000) });
 if (!res.ok) return html(errorDoc("Couldn’t load that site for a live preview."));
 raw = await res.text();
 } catch {
 return html(errorDoc("Couldn’t reach that site — it may block previews."));
 }

 const baseHref = new URL(origin).origin + "/";
 const $ = cheerio.load(raw);

 // Strip the source CSP (blocks our <base>) + any source <base>; drop analytics/tracker scripts.
 $("meta[http-equiv]").each((_: number, el: any) => { if (/content-security-policy/i.test($(el).attr("http-equiv") || "")) $(el).remove(); });
 $("base").remove();
 $("script").each((_: number, el: any) => {
 const src = $(el).attr("src") || "";
 const inline = $(el).html() || "";
 if ((src && TRACKERS.test(src)) || /gtag\(|fbq\(|dataLayer|hotjar|_linkedin|snaptr\(/.test(inline)) $(el).remove();
 });

 // Inject our <base> so every relative CSS/img/font/script URL resolves to the store's origin.
 $("head").prepend(`<base href="${baseHref}">`);

 // Display-only mode (?noclick=1): the demo lets you SCROLL their real site but not click into it.
 // We cancel clicks / middle-clicks / form submits (capture phase, so it also catches theme-JS-added
 // links), but leave wheel/touch/keyboard scrolling untouched.
 if (new URL(request.url).searchParams.get("noclick") === "1") {
  $("head").append(`<style>a,button,[role="button"],label,summary,input,select{cursor:default!important}</style>`);
  $("body").append(
   `<script>(function(){function k(e){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();return false;}` +
   `["click","auxclick","submit","contextmenu","dblclick"].forEach(function(t){document.addEventListener(t,k,true);});})();</script>`
  );
 }

 return html($.html());
}
