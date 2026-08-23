import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { reverseImageMatches, verifyMatchesByImage, matchesToComps, isCompsConfigured, type VisualMatch } from "@/app/lib/comps";
import { verifyMatchPrices } from "@/app/lib/comp-price-verify";
import { getCachedLinkPrice, saveCachedLinkPrice } from "@/app/lib/link-price-cache-db";
import { embedImage } from "@/app/lib/embeddings";
import { titleHasBrand } from "@/app/lib/intake-pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Read-only PHOTO pricing X-ray — the reverse-image half that /price-debug (text-query only)
// can't reach. Runs the real chain for one photo: Google Lens → visual verification → optional
// link price-verify → comps, and reports every match with WHY it is or isn't priced.
//
// This is the Phase 1 gate tool (docs/price-accuracy-v2-plan.md). Toggle link-verify per request
// with &linkVerify=0|1 so before/after needs no server restart.
//
//   /api/admin/lens-price-debug?image=<photo url>&brand=Valentino&linkVerify=1
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

const usd = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);
const host = (link?: string) => { try { return link ? new URL(link).hostname.replace(/^www\./, "") : null; } catch { return null; } };

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sp = new URL(request.url).searchParams;
 const image = (sp.get("image") || sp.get("url") || "").trim();
 if (!image) return NextResponse.json({ error: "Pass ?image=<product photo URL> (optionally &brand=&linkVerify=0|1)" }, { status: 400 });
 if (!isCompsConfigured()) return NextResponse.json({ error: "SerpApi not enabled (needs SERPAPI_API_KEY + SERPAPI_ENABLED=true)" }, { status: 400 });

 const brand = (sp.get("brand") || "").trim();
 // Default follows the env flag, but an explicit ?linkVerify= wins — that's the before/after switch.
 const linkVerify = sp.get("linkVerify") != null ? sp.get("linkVerify") === "1" : process.env.VYA_LINK_VERIFY_ENABLED === "true";

 const raw = await reverseImageMatches(image).catch((e) => { throw e; });
 const brandFiltered = brand ? raw.filter((m) => titleHasBrand(m.title, brand)) : raw;
 const afterBrand = brand && brandFiltered.length ? brandFiltered : raw;

 const embedding = await embedImage(image).catch(() => null);
 const { verified, filtered, checked } = await verifyMatchesByImage(embedding, afterBrand).catch(() => ({ verified: afterBrand, filtered: false, checked: 0 }));
 const visualPassed = filtered ? verified : afterBrand;

 const before = visualPassed.map((m) => ({ ...m }));
 const after: VisualMatch[] = linkVerify
  ? await verifyMatchPrices(visualPassed, { getCached: getCachedLinkPrice, saveCached: saveCachedLinkPrice }).catch(() => visualPassed)
  : visualPassed;

 const priceOf = (list: VisualMatch[], key: string) => list.find((m) => (m.link || m.title) === key)?.priceCents ?? null;
 const rows = after.map((m) => {
  const key = m.link || m.title;
  const wasPriced = priceOf(before, key);
  return {
   title: m.title.slice(0, 90),
   source: m.source,
   host: host(m.link),
   price: usd(m.priceCents),
   // What the page actually said, pre-conversion — a wrong currency is obvious here
   // (the TLD is not a reliable signal: timesupshop.com prices in DKK).
   nativePrice: m.nativeCurrency ? `${usd(m.nativePriceCents)} ${m.nativeCurrency}` : undefined,
   sold: m.sold === true || undefined,
   // How this match got its price — the whole point of the gate.
   priceFrom: m.priceCents == null ? "none" : wasPriced != null ? "google-lens" : "link-verify",
   similarity: m.similarity != null ? Number(m.similarity.toFixed(3)) : null,
   link: m.link,
  };
 }).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

 const comps = matchesToComps(after);
 const recovered = rows.filter((r) => r.priceFrom === "link-verify");
 const unpricedBefore = before.filter((m) => !m.priceCents).length;

 return NextResponse.json({
  image,
  brand: brand || null,
  linkVerify,
  funnel: {
   lensMatches: raw.length,
   afterBrandFilter: afterBrand.length,
   visuallyChecked: checked,
   visuallyVerified: visualPassed.length,
   visualFilterRan: filtered,
   note: filtered ? "similarity filter applied" : "no query embedding / no thumbnails — matches passed through unfiltered",
  },
  prices: {
   pricedByLens: before.filter((m) => m.priceCents).length,
   unpricedBefore,
   recoveredByLinkVerify: recovered.length,
   recoveryRate: unpricedBefore ? `${Math.round((recovered.length / unpricedBefore) * 100)}%` : null,
   soldComps: comps.filter((c) => c.sold).length,
   totalComps: comps.length,
   note: linkVerify
    ? "check the server log for [link-verify] pages=… droppedCurrency=… droppedOutlier=…"
    : "link-verify OFF — rerun with &linkVerify=1 to compare",
  },
  matches: rows,
 });
}
