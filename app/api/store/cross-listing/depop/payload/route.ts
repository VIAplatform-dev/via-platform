import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getItem } from "@/app/lib/db/inventory";
import { crossPostContent } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Depop payload for the browser extension.
//
// The extension fills Depop's create-listing form in the seller's own logged-in browser. This is
// where the item it fills comes from: given a VYA item id, it returns the fields already MAPPED onto
// the values Depop's form expects, so the extension only has to type them in.
//
// The mapping lives here, not in the extension, for two reasons: it needs the seller's DB row (auth
// is here), and Depop's option vocabularies (condition, package size) are business logic that should
// version with the app, not sit frozen in an extension the seller has to reinstall to update.
//
// Auth is the same gate as every other /api/store route (resolveStoreSlugAny) — the item must belong
// to the signed-in seller's store, so one seller can't pull another's inventory.
// ───────────────────────────────────────────────────────────────────────────

// VYA condition text → the word Depop's condition dropdown filters on. The extension matches
// loosely ("Excellent" finds "Used - Excellent"), so these only have to name Depop's tier.
function depopCondition(c: string | null | undefined): string {
 const s = (c || "").toLowerCase();
 if (/brand ?new|bnwt|new with tag|deadstock|nwt/.test(s)) return "Brand new";
 if (/like ?new|nwot|new without/.test(s)) return "Like new";
 if (/excellent|mint|pristine/.test(s)) return "Excellent";
 if (/very good|vgc/.test(s)) return "Excellent";
 if (/good/.test(s)) return "Good";
 if (/fair|worn|distress|flaw/.test(s)) return "Fair";
 return "Good"; // a safe default for unlabelled vintage
}

// Garment size for Depop's size field. VYA doesn't always capture one — and for bags and most
// accessories there ISN'T one, so those get "One size" (Depop's option for exactly this), which fills
// the field instead of leaving it blank. Clothing/shoes with no stored size stay empty for the seller
// to set, because guessing a wearable size would be worse than an obvious blank.
const ONE_SIZE_CATEGORIES = /bag|accessor|jewel|hat|scarf|belt|sunglass|watch|purse|clutch|wallet/i;
function depopSize(size: string | null | undefined, category: string | null | undefined): string {
 if (size && size.trim()) return size.trim();
 if (ONE_SIZE_CATEGORIES.test(category || "")) return "One size";
 return "";
}

// Depop's parcel sizes are Small / Medium / Large / XL. Infer from the item's shipping weight when we
// have it; default Small, which is what most single garments are.
function depopPackageSize(weightOz: number | null | undefined): string {
 const oz = Number(weightOz) || 0;
 if (!oz) return "Small";
 if (oz <= 16) return "Small"; // up to ~1lb — a top, dress, most clothing
 if (oz <= 32) return "Medium"; // up to ~2lb — jeans, a chunky knit
 if (oz <= 80) return "Large"; // up to ~5lb — boots, a coat
 return "Extra large";
}

// Depop's colour field is a fixed list. VYA has no colour column, so recover one from the title /
// description (most listings name it — "Navy Blue Patent…", "Black leather…"). Longer/most-specific
// terms first; map synonyms onto a Depop colour. Blank when nothing is found (seller sets it).
const DEPOP_COLOURS: [RegExp, string][] = [
 [/black/i, "Black"],
 [/navy|\bblue\b|cobalt|teal/i, "Blue"],
 [/brown|chocolate|espresso|coffee/i, "Brown"],
 [/cream|ivory|off.?white|eggshell/i, "Cream"],
 [/\bgreen\b|olive|emerald|sage/i, "Green"],
 [/grey|gray|charcoal|slate/i, "Grey"],
 [/orange|rust|terracotta/i, "Orange"],
 [/\bpink\b|blush|fuchsia|magenta|rose\b/i, "Pink"],
 [/purple|lilac|lavender|violet|plum/i, "Purple"],
 [/\bred\b|burgundy|maroon|wine|crimson/i, "Red"],
 [/white/i, "White"],
 [/yellow|mustard/i, "Yellow"],
 [/gold|golden/i, "Gold"],
 [/silver|metallic/i, "Silver"],
 [/\btan\b|beige|camel|khaki|nude|sand|taupe/i, "Tan"],
 [/multi|colou?rful|rainbow|floral|print|pattern/i, "Multi"],
];
function depopColour(title: string | null | undefined, description: string | null | undefined): string {
 const hay = `${title || ""} ${description || ""}`;
 for (const [re, name] of DEPOP_COLOURS) if (re.test(hay)) return name;
 return "";
}

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const itemId = new URL(request.url).searchParams.get("item") || "";
 if (!itemId) return NextResponse.json({ error: "item id required" }, { status: 400 });

 const item = await getItem(itemId).catch(() => null);
 if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

 // The description carries Depop's hashtags (crossPostContent handles the depop formatting), so the
 // seller gets the tag-driven caption Depop's feed rewards.
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
  "depop",
 );

 return NextResponse.json({
  ok: true,
  item: {
   itemId,
   title: item.title,
   description: content.body,
   price: String(Math.round(item.priceCents / 100)),
   brand: item.brand || "",
   condition: depopCondition(item.condition),
   // VYA has no colour column; recover one from the title/description so Depop's colour field isn't
   // left empty (blank only when nothing is named).
   colour: depopColour(item.title, item.description),
   size: depopSize(item.size, item.category),
   category: item.category || "",
   packageSize: depopPackageSize(item.weightOz),
   // 8 is DEPOP's cap, not ours — see app/lib/item-limits.ts.
   photos: (item.images || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 8),
  },
 });
}
