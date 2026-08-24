import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { getCapturePage, getCaptureOrigin, saveCapturePage, getSiteCss } from "@/app/lib/site-capture-db";
import { captureSite, rewireCommerce, injectCart, injectCss } from "@/app/lib/site-capture";
import { matchItemId } from "@/app/lib/capture-commerce";
import { captureStorefrontEntry } from "@/app/lib/store-visits-db";
import { recordProductView } from "@/app/lib/store-favorites-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Serves a product page on VYA. Captured on-demand the first time (then cached),
// with the Shopify add-to-cart swapped for a VYA "Buy" button matched to the
// store's imported listing → VYA checkout.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; handle: string }> }) {
 const { slug, handle } = await params;
 const path = `/products/${handle}`;

 let html = await getCapturePage(slug, path).catch(() => null);
 if (!html) {
 const origin = await getCaptureOrigin(slug).catch(() => null);
 if (!origin) return new Response("Store not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
 try {
 const cap = await captureSite(`${origin}${path}`, {
 rewriteLink: (full) => {
 const p = new URL(full).pathname;
 if (/^\/products\//.test(p)) return `/site/${slug}${p}`;
 if (/\/(cart|account|search|checkout|login)\b/.test(p) || /\.(json|xml|css|js)$/i.test(p) || /\/cdn\//.test(p)) return null;
 return `/site/${slug}${p === "/" ? "" : p}`;
 },
 });
 // Match this product to its VYA item → buy button runs VYA's Stripe checkout.
 const title = cheerio.load(cap.html)("h1").first().text().replace(/\s+/g, " ").trim();
 // The handle IS the source's product id, so this matches exactly rather than guessing by title.
 const itemId = await matchItemId(slug, title, handle).catch(() => null);
 const buyHref = itemId ? `/checkout?item=${itemId}` : null;
 html = rewireCommerce(cap.html, buyHref);
 await saveCapturePage(slug, path, html, `${origin}${path}`);
 } catch {
 return new Response("Couldn't load that product.", { status: 502, headers: { "Content-Type": "text/plain" } });
 }
 }
 const css = await getSiteCss(slug).catch(() => "");
 let out = injectCss(injectCart(html), css);
 // The VYA item behind this page is encoded in its buy link — use it to add a Save
 // (favorite) button and record a product view for the store's analytics.
 const itemId = (out.match(/\/checkout\?item=([a-zA-Z0-9-]+)/) || [])[1] || null;
 if (itemId) {
 out = injectFavoriteButton(out, slug, itemId);
 recordProductView(slug, itemId, req.cookies.get("via_sess")?.value || null).catch(() => {});
 }
 const setCookie = await captureStorefrontEntry(req, slug);
 const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
 if (setCookie) headers["Set-Cookie"] = setCookie;
 return new Response(out, { headers });
}

// A floating "Save" button injected into the storefront product page. Talks to the
// favorite API (credentialed, so it works on the seller's own domain too).
function injectFavoriteButton(html: string, slug: string, itemId: string): string {
 const widget = `
<div style="position:fixed;bottom:18px;left:18px;z-index:2147483000;display:flex;gap:8px;align-items:center;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<button id="via-fav-btn" style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e5e0da;border-radius:999px;padding:9px 15px;font-size:13px;color:#1c1917;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.10);">
<span id="via-fav-heart" style="font-size:15px;line-height:1;">♡</span><span id="via-fav-label">Save</span>
</button>
<a href="/site/${slug}/favorites" style="background:#fff;border:1px solid #e5e0da;border-radius:999px;padding:9px 15px;font-size:13px;color:#1c1917;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,0.10);">Saved</a>
</div>
<script>(function(){var A="https://vyaplatform.com/api/storefront/favorite",S=${JSON.stringify(slug)},I=${JSON.stringify(itemId)};
var b=document.getElementById('via-fav-btn'),h=document.getElementById('via-fav-heart'),l=document.getElementById('via-fav-label');
function r(f){h.textContent=f?'♥':'♡';h.style.color=f?'#e0245e':'#1c1917';l.textContent=f?'Saved':'Save';}
fetch(A+'?slug='+encodeURIComponent(S)+'&item='+encodeURIComponent(I),{credentials:'include'}).then(function(x){return x.json()}).then(function(d){r(!!d.favorited)}).catch(function(){});
b.addEventListener('click',function(){b.disabled=true;fetch(A,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:S,item:I})}).then(function(x){return x.json()}).then(function(d){r(!!d.favorited)}).catch(function(){}).then(function(){b.disabled=false});});})();</script>`;
 return html.includes("</body>") ? html.replace("</body>", widget + "</body>") : html + widget;
}
