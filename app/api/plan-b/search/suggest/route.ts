import { NextRequest, NextResponse } from "next/server";
import { listAvailableItems } from "@/app/lib/db/inventory";
import { buildSuggest } from "@/app/lib/plan-b/cart-json";
import { resolveStore, errorResponse } from "@/app/lib/plan-b/cart-session";
import { requestedSectionId, predictiveSearchResultsSection, predictiveSearchEmptySection, type SuggestCard } from "@/app/lib/plan-b/section-render";
import { searchItems } from "@/app/lib/plan-b/search-page";

export const dynamic = "force-dynamic";

// GET /search/suggest.json?q=… — the theme's predictive search box, answered from LIVE VYA
// inventory. Without this the seller's own search returns nothing on a hosted store, which reads as
// a broken storefront rather than a missing feature.
export async function GET(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return errorResponse("Unknown store.", 404);

 // TWO DIALECTS, one endpoint. Classic themes (Dawn, Prestige, Editions…) fetch this URL and parse
 // JSON. Horizon-generation themes fetch the SAME URL through the Section Rendering API, adding
 // `section_id=`, and parse the response as HTML markup for the search drawer — handing them JSON
 // meant their search silently returned nothing on every hosted store. Branch on the parameter the
 // theme itself sends, so neither dialect needs to know the other exists.
 const sectionId = requestedSectionId(request.nextUrl.searchParams);

 const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
 if (!q) {
  return sectionId
   ? html(predictiveSearchEmptySection(sectionId))
   : NextResponse.json(buildSuggest("", []), { headers: { "Cache-Control": "no-store" } });
 }

 // The SAME matcher the results page runs (app/lib/plan-b/search-page.ts). They used to differ —
 // this endpoint matched title/brand by substring, the page matched every field — so the drawer and
 // the page it links to could disagree about whether a query had any results at all.
 const items = await listAvailableItems(store.sellerId);
 const hits = searchItems(items, q)
  .slice(0, 10)
  .map((i) => ({
   id: i.id, title: i.title, priceCents: i.priceCents, currency: i.currency,
   image: i.images?.[0] ?? null, handle: i.sourceId, available: i.status === "active",
  }));

 if (sectionId) {
  const cards: SuggestCard[] = hits.map((h) => ({
   title: h.title,
   // An imported piece keeps its source handle, so the link lands on its captured product page;
   // one the seller created here has none and falls back to the VYA product route.
   href: h.handle ? `/products/${h.handle}` : `/products/${h.id}`,
   image: h.image,
   price: money(h.priceCents, h.currency),
  }));
  return html(predictiveSearchResultsSection(sectionId, cards));
 }

 return NextResponse.json(buildSuggest(q, hits), { headers: { "Cache-Control": "no-store" } });
}

function html(body: string): Response {
 return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function money(cents: number | null, currency: string | null): string {
 if (cents == null) return "";
 // Two decimals, because the seller's own search drawer shows "$50.00" and this one sat beside it
 // reading "$50" — a different price to anyone comparing, on the one screen where they might.
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100); }
 catch { return `$${(cents / 100).toFixed(2)}`; }
}
