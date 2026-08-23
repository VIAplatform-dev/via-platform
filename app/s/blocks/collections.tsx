/* eslint-disable @next/next/no-img-element */
// Shop-by-category tiles — the section that gets a shopper to what they came for in one click.
//
// Note on the catalog: an earlier sketch of this family included a "counts" layout (tiles showing how
// many pieces sit in each category). There is no per-category count available to this renderer —
// BlockProduct carries title/price/image/href and nothing else — so rather than print a fabricated
// number, that slot is a typographic index ("list"), which is a real pattern and honest about the
// data we have. If counts become available, it's a new variant, not a retrofit of this one.
import { FreeField, emptyHint, tileHref, type EditKit, type Item } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";

const S = ITEM_SCHEMAS.collections;

// Tiles are repeated content: read through the codec, written back through it. The pipe-delimited
// storage never surfaces here (or to the merchant).
function useTiles(kit: EditKit) {
 const tiles = kit.items(S);
 const setLabel = (i: number, label: string) => kit.setItems(S, tiles.map((t, j) => (j === i ? { ...t, label } : t)));
 const setImg = (i: number, img: string) => kit.setItems(S, tiles.map((t, j) => (j === i ? { ...t, img } : t)));
 return { tiles, setLabel, setImg };
}

function Heading({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.heading && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className={`vya-heading ${className}`} style={{ fontFamily: ctx.head }} />;
}

// One tile: photo (or a tinted block), a scrim for legibility, and its label — editable in place.
function Tile({ kit, t, i, setLabel, setImg, ratio, rounded }: { kit: EditKit; t: Item; i: number; setLabel: (i: number, v: string) => void; setImg: (i: number, v: string) => void; ratio: string; rounded?: string }) {
 const { ctx } = kit;
 return (
  <a href={ctx.edit ? undefined : tileHref(ctx, t.label)} className={`vya-round group relative block ${ratio} ${rounded || ""} overflow-hidden`} style={{ background: t.img ? undefined : `${ctx.fg}12` }}>
   {t.img && <img src={t.img} alt={t.label} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.05]" />}
   {t.img && <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />}
   {/* Editor: the tile's photo area is the upload control — click it to set or replace the picture.
       Sits under the label, so clicking the text still edits the text. */}
   {ctx.edit && ctx.onPickImage && (
    <span
     role="button" tabIndex={0}
     title={t.img ? "Click to replace this photo" : "Click to add a photo"}
     onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctx.onPickImage!((url) => setImg(i, url)); }}
     onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); ctx.onPickImage!((url) => setImg(i, url)); } }}
     className="absolute inset-x-0 top-0 bottom-14 z-10 grid cursor-pointer place-items-center"
    >
     <span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-opacity ${t.img ? "bg-white/95 text-stone-800 opacity-0 group-hover:opacity-100" : "text-current opacity-45"}`}>{t.img ? "Replace" : "Add photo"}</span>
    </span>
   )}
   <span {...kit.txtItem(t.label, (val) => setLabel(i, val))} className={`absolute inset-x-0 bottom-0 p-4 text-lg uppercase tracking-[0.08em] ${t.img ? "text-white" : ""}`} style={{ fontFamily: ctx.head, color: t.img ? undefined : ctx.fg }} />
  </a>
 );
}

// ── grid (the layout that shipped) ──────────────────────────────────────────────────────────────
function CollectionsGrid({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { tiles, setLabel, setImg } = useTiles(kit);
 if (!tiles.length) return emptyHint(ctx, "Shop by category — add tiles");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-10 text-center text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className={`grid grid-cols-2 gap-3 @xl:gap-4 ${p.cols === "2" ? "@lg:grid-cols-2" : p.cols === "4" ? "@lg:grid-cols-4" : "@lg:grid-cols-3"}`} style={p.gap ? { gap: `${p.gap}px` } : undefined}>
    {tiles.slice(0, 12).map((t, i) => <Tile key={i} kit={kit} t={t} i={i} setLabel={setLabel} setImg={setImg} ratio="aspect-[4/5]" />)}
   </div>
  </section>
 );
}

// ── row ─────────────────────────────────────────────────────────────────────────────────────────
// A swipeable rail of narrow tiles. Fits many more categories than a grid without pushing the rest
// of the page down, and bleeds off the right edge to show there's more.
function CollectionsRow({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { tiles, setLabel, setImg } = useTiles(kit);
 if (!tiles.length) return emptyHint(ctx, "Shop by category — add tiles");
 const w = Math.min(40, Math.max(10, Number(p.cardW) || 15));
 return (
  <section className="vya-free-canvas relative py-16 @xl:py-24">
   <div className="mx-auto max-w-6xl px-5 @xl:px-8"><Heading kit={kit} className="mb-8 text-3xl @xl:text-[2.4rem] leading-tight" /></div>
   <div className="vya-rail flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 @xl:gap-4 @xl:px-8">
    {tiles.map((t, i) => (
     <div key={i} className="shrink-0 snap-start" style={{ width: `min(52vw, ${w}rem)` }}>
      <Tile kit={kit} t={t} i={i} setLabel={setLabel} setImg={setImg} ratio="aspect-[3/4]" />
     </div>
    ))}
   </div>
   <style dangerouslySetInnerHTML={{ __html: ".vya-rail{scrollbar-width:none;-ms-overflow-style:none}.vya-rail::-webkit-scrollbar{display:none}" }} />
  </section>
 );
}

// ── duo ─────────────────────────────────────────────────────────────────────────────────────────
// Two categories at full width, side by side and tall. For a store with a real split in what it
// sells — womenswear/menswear, clothing/objects — where three tiles would dilute the choice.
function CollectionsDuo({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { tiles, setLabel, setImg } = useTiles(kit);
 if (!tiles.length) return emptyHint(ctx, "Shop by category — add two tiles");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-10 text-center text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className="grid gap-4 @lg:grid-cols-2 @xl:gap-6">
    {tiles.slice(0, 2).map((t, i) => <Tile key={i} kit={kit} t={t} i={i} setLabel={setLabel} setImg={setImg} ratio="aspect-[4/5] @lg:aspect-[3/4]" />)}
   </div>
  </section>
 );
}

// ── circles ─────────────────────────────────────────────────────────────────────────────────────
// Round tiles in a row — the compact, friendly treatment fashion stores use for a quick category
// jump near the top of a page. Reads as navigation rather than as a feature.
function CollectionsCircles({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { tiles, setLabel, setImg } = useTiles(kit);
 if (!tiles.length) return emptyHint(ctx, "Shop by category — add tiles");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-5xl px-5 @xl:px-8 py-14 @xl:py-20">
   <Heading kit={kit} className="mb-8 text-center text-2xl @xl:text-[2rem] leading-tight" />
   <div className="flex flex-wrap justify-center gap-6 @xl:gap-9">
    {tiles.slice(0, 8).map((t, i) => (
     <a key={i} href={ctx.edit ? undefined : tileHref(ctx, t.label)} className="group flex w-24 flex-col items-center gap-3 @xl:w-28">
      <span
       className={`relative block h-24 w-24 overflow-hidden rounded-full @xl:h-28 @xl:w-28 ${ctx.edit && ctx.onPickImage ? "cursor-pointer" : ""}`}
       style={{ background: t.img ? undefined : `${ctx.fg}12` }}
       title={ctx.edit ? (t.img ? "Click to replace this photo" : "Click to add a photo") : undefined}
       onClick={ctx.edit && ctx.onPickImage ? (e) => { e.preventDefault(); e.stopPropagation(); ctx.onPickImage!((url) => setImg(i, url)); } : undefined}
      >
       {t.img && <img src={t.img} alt={t.label} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.07]" />}
       {ctx.edit && !t.img && <span className="absolute inset-0 grid place-items-center text-[9px] uppercase tracking-[0.14em] opacity-45">Photo</span>}
      </span>
      <span {...kit.txtItem(t.label, (val) => setLabel(i, val))} className="text-center text-[11px] uppercase tracking-[0.14em] opacity-75" />
     </a>
    ))}
   </div>
  </section>
 );
}

// ── list ────────────────────────────────────────────────────────────────────────────────────────
// A typographic index: category names as large type, hairline-separated, photo revealed on hover.
// The most editorial of the five and the only one that works with no photos at all.
function CollectionsList({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { tiles, setLabel } = useTiles(kit);
 if (!tiles.length) return emptyHint(ctx, "Shop by category — add categories");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-4xl px-5 @xl:px-8 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-8 text-3xl @xl:text-[2.4rem] leading-tight" />
   <div style={{ borderTop: `1px solid ${ctx.fg}1f` }}>
    {tiles.map((t, i) => (
     <a key={i} href={ctx.edit ? undefined : tileHref(ctx, t.label)} className="group flex items-center justify-between gap-5 py-5" style={{ borderBottom: `1px solid ${ctx.fg}1f` }}>
      <span {...kit.txtItem(t.label, (val) => setLabel(i, val))} className="min-w-0 flex-1 text-2xl uppercase tracking-[0.06em] transition-opacity group-hover:opacity-60 @xl:text-3xl" style={{ fontFamily: ctx.head }} />
      {t.img && <span className="vya-round hidden h-14 w-12 shrink-0 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 @lg:block"><img src={t.img} alt="" loading="lazy" className="h-full w-full object-cover" /></span>}
      <span className="shrink-0 text-[11px] uppercase tracking-[0.2em] opacity-40">→</span>
     </a>
    ))}
   </div>
  </section>
 );
}

export function renderCollections(kit: EditKit, variant: string) {
 switch (variant) {
  case "row": return <CollectionsRow kit={kit} />;
  case "duo": return <CollectionsDuo kit={kit} />;
  case "circles": return <CollectionsCircles kit={kit} />;
  case "list": return <CollectionsList kit={kit} />;
  default: return <CollectionsGrid kit={kit} />;
 }
}
