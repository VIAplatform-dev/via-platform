import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { captureStorefrontEntryClient, recordStorePageview, geoFromHeaders } from "@/app/lib/store-visits-db";
import { recordProductView, recordSearch } from "@/app/lib/store-favorites-db";
import { recordEvent } from "@/app/lib/analytics-events-db";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "via_sess";      // per-session (30 min) — powers traffic-source + pageviews
const SHOPPER_COOKIE = "via_shopper";   // stable anonymous shopper (1 yr) — powers product views/favorites
const SESSION_TTL = 1800;
const SHOPPER_TTL = 60 * 60 * 24 * 365;

// Storefront analytics beacon for the BLOCK-BUILDER storefront (/s/[handle]/*), which is
// server-rendered and can't record its own views. A tiny client tracker POSTs here on each page,
// sending the real external referrer so traffic-source attribution matches the captured-site path.
// Records: entry source (once per session), the pageview, and a product view when itemId is present.
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 const slug = String(body?.slug || "").trim();
 if (!slug) return NextResponse.json({ ok: false }, { status: 400 });

 const path = String(body?.path || "/").slice(0, 500);
 const pageType = String(body?.pageType || "page").slice(0, 40);
 const itemId = body?.itemId ? String(body.itemId).slice(0, 64) : null;
 const priceCents = typeof body?.priceCents === "number" && body.priceCents > 0 ? Math.round(body.priceCents) : null;
 const search = typeof body?.search === "string" && body.search.trim() ? body.search.trim().slice(0, 120) : null;
 const referrer = typeof body?.referrer === "string" ? body.referrer : null;
 const utmSource = typeof body?.utmSource === "string" ? body.utmSource : null;
 const utmMedium = typeof body?.utmMedium === "string" ? body.utmMedium : null;

 const hasSession = !!request.cookies.get(SESSION_COOKIE);
 let sessionId = request.cookies.get(SESSION_COOKIE)?.value || null;
 let shopperId = request.cookies.get(SHOPPER_COOKIE)?.value || null;

 // First page of a session → classify + record the entry source, and mint the session id.
 const newSession = await captureStorefrontEntryClient({
  slug, hasSession, referrer, utmSource, utmMedium, path,
  selfHost: request.headers.get("host") || "vyaplatform.com",
  // The beacon runs on the shopper's own request, so its UA and edge geo headers
  // are the shopper's — not the storefront server's.
  userAgent: request.headers.get("user-agent"),
  geo: geoFromHeaders(request.headers),
 });
 if (newSession) sessionId = newSession;

 const newShopper = !shopperId ? crypto.randomUUID() : null;
 if (newShopper) shopperId = newShopper;

 await recordStorePageview({ storeSlug: slug, path, pageType, sessionId, surface: "storefront" }).catch(() => {});
 if (itemId) await recordProductView(slug, itemId, shopperId).catch(() => {});
 if (search) await recordSearch(slug, search, shopperId).catch(() => {});

 // Clean event stream (canonical items.id). A product page is a product view; other pages count as
 // a storefront view without an item. Referrer only matters on the first page, so pass it through.
 await recordEvent({
  type: "view", storeSlug: slug, itemId, actorId: shopperId, surface: "storefront",
  sessionId, priceCents, referrer: newSession ? referrer : null, meta: { pageType },
 });

 const res = NextResponse.json({ ok: true });
 if (newSession && sessionId) res.cookies.set(SESSION_COOKIE, sessionId, { path: "/", maxAge: SESSION_TTL, httpOnly: true, sameSite: "lax" });
 if (newShopper && shopperId) res.cookies.set(SHOPPER_COOKIE, shopperId, { path: "/", maxAge: SHOPPER_TTL, httpOnly: true, sameSite: "lax" });
 return res;
}
