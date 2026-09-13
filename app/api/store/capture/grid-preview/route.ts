import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCollections } from "@/app/lib/db/collections";
import { getCapturePage } from "@/app/lib/site-capture-db";
import { parseGridConfig, namesCollection, firstLinkedCollection, isGridId, newGridId } from "@/app/lib/site-builder/grid-config";
import { gridBlockInnerHtml } from "@/app/lib/site-builder/inject-grid-blocks";
import { gridKitForPreview } from "@/app/lib/site-builder/grid-kit-store";
import { liveItemsFor, hrefForStore } from "@/app/lib/site-builder/serve";

export const dynamic = "force-dynamic";

// GET ?path=&id=&config= — a product grid exactly as a shopper would get it, for the editor's canvas.
//
// Rendered by the same function the serve route fills grids with (gridBlockInnerHtml), from live
// inventory, so the preview cannot differ from the page. READ-ONLY: a GET, because nothing here is
// written — a kit derived for a store that has none yet is kept in memory, and stored only when she
// saves a page with a grid on it (see grid-kit-store.ts).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sp = request.nextUrl.searchParams;
 const path = (sp.get("path") || "/").slice(0, 300);
 const rawConfig = (sp.get("config") || "{}").slice(0, 2000);
 const idParam = sp.get("id");
 const id = isGridId(idParam) ? idParam : newGridId();

 const seller = await getSellerBySlug(slug).catch(() => null);
 if (!seller) return NextResponse.json({ error: "Store not found." }, { status: 404 });
 const collections = (await listCollections(seller.id, true).catch(() => [])).map((c) => c.slug);
 let config = parseGridConfig(rawConfig, collections);
 // A brand-new grid names no collection: start it on the first of hers that this page links to.
 if (!namesCollection(rawConfig)) {
  const page = path.startsWith("/") ? await getCapturePage(slug, path).catch(() => null) : null;
  config = { ...config, collection: page ? firstLinkedCollection(page, collections) : "all" };
 }

 const [kit, items] = await Promise.all([
  gridKitForPreview(slug).catch(() => null),
  liveItemsFor(seller.id, config.collection).catch(() => []),
 ]);
 const r = gridBlockInnerHtml(config, id, { kit, items, hrefFor: hrefForStore(slug, false), keepQuickAdd: false, editor: true });
 return NextResponse.json(
  { ok: true, id, config, html: r.html, kit: r.kind, empty: r.empty, kitCss: r.kind === "theme" && kit ? kit.css.join("\n") : "" },
  { headers: { "Cache-Control": "no-store" } },
 );
}
