import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { readSiteCss, setSiteCssIfUnchanged, getCapturePage, listCapturePaths } from "@/app/lib/site-capture-db";
import { detectThemeModel, type ThemeModel } from "@/app/lib/captured-design";

export const dynamic = "force-dynamic";

const MAX_CSS = 20000;

// Read / write a captured store's site-wide custom CSS (the layer injected over the
// original theme on every page). Powers the imported-store Design tab.
// Auth-gated to the store owner so the public site can't be restyled by anyone.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 // A failed read is an ERROR, never "". The editor treats what this returns as what the store holds,
 // and an editor that thinks the store holds nothing will write nothing over the seller's design.
 const theme = themeOf(slug); // alongside the css read; it never throws
 let css: string;
 try { css = await readSiteCss(slug); } catch { return NextResponse.json({ error: "Couldn't load your site's design." }, { status: 500 }); }
 return NextResponse.json({ css, theme: await theme });
}

/** How this store's captured theme sets its colours — so the Design tab writes into the variables the
 *  theme actually paints with. Best-effort: without it the design falls back to body-level rules. */
async function themeOf(slug: string): Promise<ThemeModel | null> {
 try {
  const html = (await getCapturePage(slug, "/")) ?? (await listCapturePaths(slug).then((p) => (p[0] ? getCapturePage(slug, p[0]) : null)));
  return html ? detectThemeModel(html) : null;
 } catch { return null; /* allow-swallow: the theme only sharpens the CSS; the css itself loaded fine */ }
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (typeof body?.css !== "string") return NextResponse.json({ error: "Missing css." }, { status: 400 });
 // `base` is the css this editor last read or wrote. Required: without it a save can't prove it isn't
 // overwriting something it never saw — an empty design autosaved over a real one, or over CSS the VYA
 // assistant added while the editor was open.
 if (typeof body.base !== "string") return NextResponse.json({ error: "Reload the editor to save your design." }, { status: 400 });
 // Refuse rather than truncate: cutting the blob mid-rule would silently drop the tail of the seller's CSS.
 if (body.css.length > MAX_CSS) return NextResponse.json({ error: `Custom CSS is limited to ${MAX_CSS.toLocaleString()} characters.` }, { status: 413 });
 try {
  if (body.css === body.base) return NextResponse.json({ ok: true, unchanged: true });
  if (await setSiteCssIfUnchanged(slug, body.base, body.css)) return NextResponse.json({ ok: true });
  // Changed since this editor read it. Hand back what is there now; the editor reloads it instead of
  // saving over it.
  return NextResponse.json({ error: "Your design was changed somewhere else.", css: await readSiteCss(slug) }, { status: 409 });
 } catch {
  return NextResponse.json({ error: "Couldn't save your design." }, { status: 500 });
 }
}
