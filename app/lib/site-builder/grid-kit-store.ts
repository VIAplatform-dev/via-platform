// Where a store's grid kit lives: a reserved capture row, like the derived cart template.
//
// It describes THIS capture's markup, so it is created, replaced and deleted with the capture
// (`deleteCaptures` wiping it is correct). The path is under /__vya/, which the serve route refuses and
// the page list hides. No new table, so nothing has to be migrated before this works.
//
// When it is written — only ever by a seller action, never by a shopper request:
//  · the first save of a page that has a product grid on it (edit route → ensureGridKitSaved);
//  · "Refresh card look" in the Grid panel (/api/store/capture/grid-kit).
// A preview before that derives the kit in memory and does not store it.
import { getCapturePage, saveCapturePage, listCapturePaths } from "../site-capture-db.ts";
import { deriveGridKit, detectPlatform, isGridKit, kitSourcePaths, type GridKit } from "./grid-kit.ts";

export const GRID_KIT_PATH = "/__vya/grid-kit";

type StoredRow = { v: 1; derivedAt: string; kit: GridKit | null };

/** The stored kit. `null` = never derived; `{ kit: null }` = derived, and her pages had no usable card. */
export async function loadStoredGridKit(slug: string): Promise<{ kit: GridKit | null } | null> {
 const raw = await getCapturePage(slug, GRID_KIT_PATH);
 if (!raw) return null;
 try {
  const row = JSON.parse(raw) as StoredRow;
  if (!row || row.v !== 1) return null;
  return { kit: isGridKit(row.kit) ? row.kit : null };
 } catch {
  return null; /* allow-swallow: an unreadable row is re-derived on the next seller save, and grids use the plain card until then */
 }
}

/** Derive from her captured pages, reading one page at a time (pages are up to a few MB each). */
export async function deriveGridKitForStore(slug: string): Promise<GridKit | null> {
 const home = (await getCapturePage(slug, "/").catch(() => null)) ?? "";
 const platform = detectPlatform(home);
 const paths = await listCapturePaths(slug);
 for (const path of kitSourcePaths(paths, platform)) {
  const html = path === "/" ? home : await getCapturePage(slug, path).catch(() => null);
  if (!html) continue;
  const kit = deriveGridKit([{ path, html }], home, platform);
  if (kit) return kit;
 }
 return null;
}

// Previews re-render on every settings change; deriving on each would re-read several MB of pages.
const previewCache = new Map<string, { at: number; kit: GridKit | null }>();
const PREVIEW_TTL_MS = 10 * 60_000;

/** For the editor's preview: the stored kit, else one derived now and remembered briefly. Never writes. */
export async function gridKitForPreview(slug: string): Promise<GridKit | null> {
 const stored = await loadStoredGridKit(slug).catch(() => null);
 if (stored) return stored.kit;
 const hit = previewCache.get(slug);
 if (hit && Date.now() - hit.at < PREVIEW_TTL_MS) return hit.kit;
 const kit = await deriveGridKitForStore(slug).catch(() => null);
 previewCache.set(slug, { at: Date.now(), kit });
 return kit;
}

/** For shoppers: only ever the stored kit. A shopper's request never derives anything. */
export async function gridKitForServe(slug: string): Promise<GridKit | null> {
 return (await loadStoredGridKit(slug).catch(() => null))?.kit ?? null;
}

export async function saveGridKit(slug: string, kit: GridKit | null): Promise<void> {
 const row: StoredRow = { v: 1, derivedAt: new Date().toISOString(), kit };
 await saveCapturePage(slug, GRID_KIT_PATH, JSON.stringify(row), "");
 previewCache.set(slug, { at: Date.now(), kit });
}

/** On her first grid save: store the kit the preview showed her, so shoppers get the same card. */
export async function ensureGridKitSaved(slug: string): Promise<void> {
 if (await loadStoredGridKit(slug)) return;
 await saveGridKit(slug, await gridKitForPreview(slug));
}

/** "Refresh card look": derive again from her pages and store the result. */
export async function refreshGridKit(slug: string): Promise<GridKit | null> {
 previewCache.delete(slug);
 const kit = await deriveGridKitForStore(slug);
 await saveGridKit(slug, kit);
 return kit;
}
