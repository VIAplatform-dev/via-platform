import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getCapturePage } from "@/app/lib/site-capture-db";
import { detectMenus, menuSignature, sanitizeMenuItems } from "@/app/lib/site-builder/menus";
import { saveMenuRow, siteBuilderTablesReady } from "@/app/lib/site-builder/pages-db";

export const dynamic = "force-dynamic";

// PUT { menu: "main", items, signature } — her order for the menu on her header.
//
// The signature is the href sequence the order was learned from. If her header has changed since
// (a re-crawl brought a different menu over), this answers 409 with the menu as it stands now rather
// than writing an order that names items her site no longer has — see menus.ts.
export async function PUT(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!(await siteBuilderTablesReady())) {
  return NextResponse.json({ error: "Page settings aren’t switched on for this site yet.", notMigrated: true }, { status: 503 });
 }

 const body = await request.json().catch(() => null); /* allow-swallow: answered by the 400 below */
 const name = body?.menu === "footer" ? "footer" : "main";
 const items = sanitizeMenuItems(body?.items);
 if (!items.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

 // Her header, as it is stored right now. The home page is where the menu is read from, the same
 // page the panel read it from when it showed her the order she has just dragged.
 const home = await getCapturePage(slug, "/").catch(() => null); /* allow-swallow: handled as "no menu to check against" below */
 const detected = home ? detectMenus(cheerio.load(home)) : null;
 const signature = typeof body?.signature === "string" ? body.signature : "";
 if (detected && signature && signature !== detected.signature) {
  return NextResponse.json({
   error: "Your menu has changed since you last edited it — here it is as it stands now.",
   drifted: true, menu: detected,
  }, { status: 409 });
 }

 // Stored against the signature of the menu it describes, so applyMenu can tell her header from a
 // landing page that carries a different one.
 const stored = signature || detected?.signature || menuSignature(items.map((i) => i.href));
 if (!(await saveMenuRow(slug, name, items, stored))) {
  return NextResponse.json({ error: "Couldn’t save your menu just now." }, { status: 500 });
 }
 return NextResponse.json({ ok: true, menu: { items, signature: stored } });
}
