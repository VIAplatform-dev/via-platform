import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getItem } from "@/app/lib/db/inventory";
import { crossPostContent } from "@/app/lib/cross-listing-db";
import {
 vestiaireCondition, vestiaireUniverse, vestiaireCategory,
 vestiaireMaterial, vestiaireColour, vestiaireEligibility, vestiaireTitle, vestiaireReadiness,
 vestiairePattern, vestiaireLength, vestiaireSize,
} from "@/app/lib/vestiaire";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Vestiaire Collective payload for the browser extension.
//
// Same contract as the Depop payload — given a VYA item id, return the fields already mapped onto
// what Vestiaire's form expects, so the extension only types. The mapping lives here rather than in
// the extension because Vestiaire's vocabularies are business logic that should version with the
// app, not sit frozen in something the seller has to reinstall.
//
// The one thing this does that Depop's doesn't: it REFUSES. Vestiaire is curated, so a piece with no
// designer brand can't be listed there at all, and finding that out at the end of a long form is a
// wasted afternoon. See vestiaire.ts.
// ───────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const itemId = new URL(request.url).searchParams.get("item") || "";
 if (!itemId) return NextResponse.json({ error: "item id required" }, { status: 400 });

 const item = await getItem(itemId).catch(() => null);
 if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

 // Refuse before the seller opens the site, not after she's filled the form.
 //
 // Not just eligibility any more: their manual flow gates each of five steps, so a piece with one
 // photo or no material can't be finished either. Everything that would stop her is returned at
 // once — finding out one problem per attempt is its own kind of awful.
 const check = vestiaireReadiness({
  title: item.title, brand: item.brand, category: item.category, condition: item.condition,
  material: (item as { material?: string | null }).material ?? null,
  colour: (item as { colour?: string | null }).colour ?? null,
  size: item.size, description: item.description, priceCents: item.priceCents,
  images: (item.images as string[] | null) ?? null,
 });
 if (!check.ready) {
  return NextResponse.json(
   { ok: false, ineligible: true, error: check.blocking.join(" "), blocking: check.blocking, advisory: check.advisory },
   { status: 422 },
  );
 }

 const content = crossPostContent(
  {
   title: item.title,
   brand: item.brand,
   condition: item.condition,
   size: item.size,
   category: item.category,
   priceCents: item.priceCents,
   description: item.description ?? null,
  },
  "vestiaire",
 );

 const { category, subcategory } = vestiaireCategory(item.category, item.title);
 const material = vestiaireMaterial((item as { material?: string | null }).material ?? null, item.title, item.description);

 return NextResponse.json({
  ok: true,
  item: {
   itemId,
   // Vestiaire's title box is short — 50, from PLATFORMS — so trim on a word rather than mid-word.
   title: vestiaireTitle(item.title, 50),
   description: content.body,
   price: String(Math.round(item.priceCents / 100)),
   brand: item.brand || "",
   universe: vestiaireUniverse(item.title, item.category),
   category,
   subcategory,
   condition: vestiaireCondition(item.condition),
   colour: vestiaireColour(item.title, item.description, (item as { colour?: string | null }).colour ?? null),
   // Required by Vestiaire, and deliberately blank when nothing names it — the extension surfaces
   // that as one field for the seller rather than posting a guessed fibre.
   material,
   materialMissing: material === "",
   size: item.size || "",
   // Their Details step requires all three, and none has a home in VYA. Decided here rather than
   // in the extension so they're testable and the same on every marketplace path.
   pattern: vestiairePattern(item.title, item.description, (item as { colour?: string | null }).colour ?? null),
   length: vestiaireLength(item.category, item.title, item.description),
   // Whether this KIND of piece is even asked for a length — so the extension can tell "we don't
   // know it" apart from "it doesn't have one". A bag needs no length; a dress does.
   needsLength: /dress|skirt|gown/i.test(String(item.category || "")),
   sizeSystem: vestiaireSize(item.size).system,
   sizeValue: vestiaireSize(item.size).value,
   photos: (item.images || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 15),
  },
 });
}
