// The cart page for a store whose OWN cart page was never captured.
//
// `captureCartTemplate` puts a real product into a throwaway cart on the source store and captures
// what the theme renders, so `injectCartPage` can clone the theme's own row markup. It is explicitly
// best-effort and returns null on any failure — and an audit of the stored captures found five
// stores where it had failed silently. For those, `/cart` finds no captured page and the serve path
// answers a plain-text "Page not found." at the exact moment a shopper is trying to buy. One of them
// has a cart drawer on all 24 of its pages; another has 781 pages captured and no cart page.
//
// Re-capturing those five would fix those five. This fixes the CLASS: when there is no cart capture,
// borrow the chrome from any page we DO hold — header, footer, fonts, colours, all inlined by the
// crawler — and render the visitor's real VYA cart inside it. The shopper stays in the store's own
// design, and a future capture failure degrades to a working page instead of a 404.
//
// Pure and unit-tested: it takes HTML and cart lines and returns HTML, with no database, no network
// and no request object.
import * as cheerio from "cheerio";
import type { CartPageLine } from "./site-capture.ts";

/** Where the theme's main content sits, most specific first. Covers Dawn and its forks, plus the
 *  generic containers older themes use. */
const MAIN_SELECTORS = ["#MainContent", "main", '[role="main"]', ".main-content", "#main", "#content"].join(", ");

/** The chrome worth keeping when there is no main container to swap out. */
const CHROME_SELECTORS = ["header", "#shopify-section-header", "footer", "#shopify-section-footer"].join(", ");

function escHtml(s: string): string {
 return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Two decimals, in the line's own currency — the theme prints "$575.00" and a bare "$575" reads
 *  wrong beside it. */
function money(cents: number, currency: string | null): string {
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100); }
 catch { return `$${(cents / 100).toFixed(2)}`; }
}

/** Inherit the store's type and colour rather than imposing VYA's: every rule here is either
 *  structural or expressed in `inherit`/`currentColor`, so the page takes on the theme. */
// A hairline in the theme's own ink rather than a full-strength rule, which reads as a heavy black
// bar on a light storefront. color-mix keeps it relative to whatever colour the theme set.
const HAIR = "1px solid color-mix(in srgb, currentColor 16%, transparent)";

const S = {
 wrap: "max-width:960px;margin:0 auto;padding:48px 20px;font:inherit;color:inherit",
 head: "font-size:clamp(22px,3vw,32px);font-weight:500;letter-spacing:.02em;margin:0 0 28px",
 row: `display:flex;gap:18px;align-items:center;padding:18px 0;border-top:${HAIR}`,
 img: "width:84px;height:104px;object-fit:cover;flex:none",
 title: "color:inherit;text-decoration:none",
 rm: "background:none;border:0;padding:0;margin-top:6px;font:inherit;font-size:12px;opacity:.55;cursor:pointer;color:inherit;text-decoration:underline",
 totals: `display:flex;justify-content:space-between;align-items:baseline;padding:22px 0;border-top:${HAIR};margin-top:4px`,
 // The button takes the theme's ink as its fill. `Canvas` is the browser's own page colour, so the
 // label stays legible whether the storefront is light or dark; #fff is the fallback for anything
 // that doesn't know the system keyword.
 btn: "display:block;width:100%;padding:16px;margin-top:8px;font:inherit;font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-align:center;background:currentColor;border:0;cursor:pointer",
 btnIn: "color:#fff;color:Canvas",
};

function rowHtml(l: CartPageLine, interactive: boolean): string {
 const img = l.image ? `<a href="${escHtml(l.href)}"><img src="${escHtml(l.image)}" alt="${escHtml(l.title)}" style="${S.img}"></a>` : "";
 // Remove genuinely needs JavaScript (it's a DELETE against VYA's cart API), so it is only rendered
 // where JavaScript will survive. A control that cannot work is worse than no control.
 const remove = interactive ? `<div><button type="button" data-vya-cart-remove="${escHtml(l.id)}" style="${S.rm}">Remove</button></div>` : "";
 return `<div style="${S.row}">${img}
  <div style="flex:1">
   <a href="${escHtml(l.href)}" style="${S.title}">${escHtml(l.title)}</a>
   ${remove}
  </div>
  <div>${money(l.priceCents, l.currency)}</div>
 </div>`;
}

/**
 * Build a cart page inside a borrowed capture.
 *
 * `chromeHtml` is any page of this store we hold — the home page is the natural choice, since the
 * crawler inlines every stylesheet into it, so the theme's fonts and colours come along for free.
 * Falls back gracefully all the way down to empty/invalid input, because the stores that need this
 * are precisely the ones where capture has already proven unreliable.
 */
export function buildFallbackCartPage(
 chromeHtml: string,
 lines: CartPageLine[],
 checkoutHref: string,
 opts: { interactive?: boolean } = {},
): string {
 // Whether JavaScript on this page will survive to the browser. False on VYA's own origin, where
 // the serve path strips every script before responding.
 const interactive = opts.interactive !== false;
 const $ = cheerio.load(chromeHtml || "<html><head></head><body></body></html>");

 const subtotal = lines.reduce((n, l) => n + l.priceCents, 0);
 const currency = lines[0]?.currency || "USD";

 // Checkout is a plain LINK, not a scripted button. On VYA's own origin the serve path runs
 // stripScripts() AFTER this page is built (route.ts), which removes every <script> on the page —
 // so a button that depends on a click handler arrives dead. (That is exactly why injectCartPage's
 // checkout button does nothing on a Plan A cart page today.) An anchor needs no JavaScript, works
 // on both origins, and is what a shopper's browser already knows how to do.
 const body = lines.length
  ? `${lines.map((l) => rowHtml(l, interactive)).join("")}
   <div style="${S.totals}"><span>Subtotal</span><span>${money(subtotal, currency)}</span></div>
   <a href="${escHtml(checkoutHref)}" data-vya-checkout style="${S.btn};text-decoration:none"><span style="${S.btnIn}">Check out</span></a>`
  : `<p style="opacity:.7;padding:32px 0">Your cart is empty.</p><p><a href="/" style="${S.title}">Continue shopping</a></p>`;

 const cart = `<div data-vya-fallback-cart style="${S.wrap}"><h1 style="${S.head}">Your cart</h1>${body}</div>`;

 // Prefer swapping the theme's main container: header and footer stay exactly as captured, and only
 // the borrowed page's content is replaced.
 const $main = $(MAIN_SELECTORS).first();
 if ($main.length) {
  $main.empty().append(cart);
 } else {
  // No main container. Keep whatever chrome we can identify, drop the rest of the borrowed page's
  // content — otherwise the home page's hero would sit above the cart — and insert the cart between.
  // cheerio.load() synthesises html/head/body even for junk input, but guard anyway — the stores
  // that reach this path are the ones whose captures have already proven unreliable.
  if (!$("body").length) $.root().append("<body></body>");
  const $body = $("body");
  const keep = $body.children(CHROME_SELECTORS).toArray();
  for (const el of $body.children().toArray()) if (!keep.includes(el)) $(el).remove();
  const $header = $body.children("header, #shopify-section-header").first();
  if ($header.length) $header.after(cart); else $body.prepend(cart);
 }

 // Only the remove control needs script; checkout is an anchor and works without it.
 if (lines.length && interactive) {
  $("body").append(`<script>
 document.addEventListener("click",function(e){
  var r=e.target.closest&&e.target.closest("[data-vya-cart-remove]");
  if(r){e.preventDefault();
   // VYA's own cart API, not the theme's /cart/change.js: this page is served on BOTH a store
   // origin and a VYA one, and the Shopify-shaped routes only exist on the former.
   fetch("/api/storefront/cart",{method:"DELETE",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({itemId:r.getAttribute("data-vya-cart-remove")})}).then(function(){location.reload()});}
 });
 </script>`);
 }

 return $.html();
}
