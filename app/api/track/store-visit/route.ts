import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { classifySource } from "@/app/lib/traffic-source";
import { recordStoreVisit, recordStorePageview } from "@/app/lib/store-visits-db";

export const dynamic = "force-dynamic";

// Per-store visit + pageview tracking for the VYA MARKETPLACE (vyaplatform.com store/product pages).
// The storefront routes capture their own visits; this covers discovery ON the marketplace so a
// store sees marketplace traffic as its own channel ("Discovered via VYA") and which pages shoppers
// browse. Called (fire-and-forget) by a small client tracker on marketplace store/product pages.
const SESSION_COOKIE = "via_sess";

export async function POST(req: NextRequest) {
 const b = (await req.json().catch(() => null)) as {
 storeSlug?: string; path?: string; pageType?: string; title?: string;
 entry?: boolean; referrer?: string | null; utmSource?: string | null; utmMedium?: string | null;
 } | null;

 const storeSlug = String(b?.storeSlug || "").trim();
 if (!storeSlug) return NextResponse.json({ ok: false }, { status: 400 });
 const path = String(b?.path || "/").slice(0, 500);
 const pageType = String(b?.pageType || "page").slice(0, 40);
 const title = b?.title ? String(b.title).slice(0, 200) : null;

 // Session id — shared with the storefront tracker so one visit can span both surfaces.
 let sessionId = req.cookies.get(SESSION_COOKIE)?.value || null;
 let setCookie: string | null = null;
 if (!sessionId) { sessionId = crypto.randomUUID(); setCookie = `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=1800; HttpOnly; SameSite=Lax`; }

 // Always log the pageview (what pages shoppers browse — clean per-store data).
 await recordStorePageview({ storeSlug, path, pageType, title, sessionId, surface: "marketplace" }).catch(() => {});

 // On the first hit for this store this session, record the acquisition source. Internal
 // marketplace navigation → "Discovered via VYA"; a real external channel (TikTok, search, …) is kept.
 if (b?.entry) {
 const referrer = typeof b?.referrer === "string" ? b.referrer : req.headers.get("referer");
 const utmSource = b?.utmSource ? String(b.utmSource) : null;
 const utmMedium = b?.utmMedium ? String(b.utmMedium) : null;
 const c = classifySource({ referrer, utmSource, utmMedium, selfHost: req.headers.get("host") });
 const viaMarketplace = c.source === "VYA"; // referrer was vyaplatform → they browsed here from VYA
 await recordStoreVisit({
 storeSlug,
 sessionId,
 sourceType: viaMarketplace ? "Marketplace" : c.type,
 source: viaMarketplace ? "VYA" : c.source,
 referrerHost: c.referrerHost || null,
 utmSource,
 utmMedium,
 path,
 }).catch(() => {});
 }

 const res = NextResponse.json({ ok: true });
 if (setCookie) res.headers.set("Set-Cookie", setCookie);
 return res;
}
