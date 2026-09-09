// Which section a newly added element (a text box, a button, a shape) belongs to.
//
// Adding from the Elements/Text rail has no pointer target — nothing says "put it HERE" — so the
// studio has to infer the section the seller means from what is selected and what is on screen. That
// inference lives here, as geometry in and an id out, because getting it wrong is a bug the seller
// sees immediately ("i try and add a text box to certain sections, it adds to the section next to
// it") and a heuristic you can't write a test for is one that quietly regresses.
//
// Rects are in client coordinates, exactly as getBoundingClientRect reports them; the caller measures
// and this decides.
export type Rect = { top: number; bottom: number };
export type SectionRect = Rect & { id: string };

/** How many pixels of a section the canvas is actually showing. */
export function visibleHeight(view: Rect, r: Rect): number {
 return Math.max(0, Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top));
}

// A selected section holds onto new elements only while it is genuinely the thing being worked on.
// Two ways to qualify, because sections differ wildly in height: covering a quarter of the canvas
// (you're scrolled into a tall hero) OR showing half of yourself (a 60px strip, fully visible).
//
// This is the whole bug. The test used to be "do the rectangles overlap at all", so a section
// scrolled away to a 4px sliver still counted as on screen and still captured the element — the
// seller was looking at the section below it and that is where she expected the text box to land.
const VIEW_SHARE = 0.25;
const SELF_SHARE = 0.5;

export function sectionIsInPlay(view: Rect, r: Rect): boolean {
 const vis = visibleHeight(view, r);
 if (vis <= 0) return false;
 const viewH = view.bottom - view.top;
 const selfH = r.bottom - r.top;
 return (viewH > 0 && vis >= viewH * VIEW_SHARE) || (selfH > 0 && vis >= selfH * SELF_SHARE);
}

// The section filling most of the canvas — what you're looking at when nothing is selected.
//
// By VISIBLE HEIGHT, not by whichever centre sits nearest the middle of the viewport: a hero taller
// than the canvas has its centre off-screen entirely, so a shorter neighbour would win it and the
// element would land one section away.
export function mostVisibleSection(view: Rect, sections: SectionRect[]): string | null {
 let bestId: string | null = null;
 let best = 0;
 for (const s of sections) {
  const vis = visibleHeight(view, s);
  if (vis > best) { best = vis; bestId = s.id; }
 }
 return bestId;
}

/**
 * Where a new element lands, in order:
 *  1. the selected section, while it's genuinely in view (see sectionIsInPlay),
 *  2. otherwise the section filling most of the canvas — what the seller is actually looking at,
 *  3. otherwise the selection even though it's off screen, then the last section on the page.
 *
 * `sections` must already be narrowed to the page being edited, so a selection left behind on
 * another page is ignored rather than pulling the element off-page.
 */
export function pickTargetSection(view: Rect, sections: SectionRect[], selectedId?: string | null): string | null {
 const sel = selectedId ? sections.find((s) => s.id === selectedId) ?? null : null;
 if (sel && sectionIsInPlay(view, sel)) return sel.id;
 return mostVisibleSection(view, sections) ?? sel?.id ?? sections[sections.length - 1]?.id ?? null;
}
