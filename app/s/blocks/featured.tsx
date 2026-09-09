/* eslint-disable @next/next/no-img-element */
// Featured products — five ways to present the same inventory.
//
// Product content (photo, title, price) comes from the store's listings, not from props, so what
// varies between these layouts is composition: an even grid, a swipeable rail, one lead piece with
// a supporting stack, an asymmetric mosaic, or a dense archive list. The section's own heading and
// eyebrow are editable in all five.
import { FreeField, productsFor, type EditKit, type BlockProduct, ArrangeHandle } from "./kit";
import { featuredCount, autoColumns } from "@/app/lib/storefront-blocks";
import { DEFAULT_WORDS, type StorefrontWords } from "@/app/lib/storefront-words";

// Composed layouts are built around an exact arrangement, so their capacity is a property of the
// design rather than something a merchant sets. Named here so the number and the reason live together.
const EDITORIAL_PIECES = 5; // one lead + a stack of four
const MOSAIC_PIECES = 6;    // three alternating large/small pairs



// The shared product card. Every layout draws its products with this, so hover behaviour, image
// radius (.vya-round), and the title/price treatment stay identical across the family — only the
// arrangement changes.
// The badge over a sold or held piece — the SAME words and marker the classic grid uses
// (StorefrontView: `words.sold` / `words.held`, `data-vya-held` on a hold), so a store that shows a
// held piece as "On hold" on its Shop page shows it that way on its homepage too. Nothing about the
// link changes: the product page is what refuses the sale.
function Badge({ it, words }: { it: BlockProduct; words?: StorefrontWords }) {
 if (!it.sold && !it.held) return null;
 return (
  <div className="absolute inset-0 flex items-start justify-end p-2">
   <span data-vya-held={it.held && !it.sold ? "1" : undefined} className="bg-black/80 px-2.5 py-1 text-[9px] uppercase tracking-[0.22em] text-white">{it.sold ? words?.sold || DEFAULT_WORDS.sold : words?.held || DEFAULT_WORDS.held}</span>
  </div>
 );
}

function Card({ it, i, shopHref, accent, fg, words, ratio = "aspect-[4/5]" }: { it: BlockProduct; i: number; shopHref: string; accent: string; fg: string; words?: StorefrontWords; ratio?: string }) {
 return (
  <a key={it.key || i} href={it.href || shopHref} className="group block">
   <div className={`vya-round relative ${ratio} w-full overflow-hidden` + (it.sold ? " opacity-[0.55]" : "")} style={{ background: `${fg}0d` }}>
    {it.image && <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.045]" />}
    <Badge it={it} words={words} />
   </div>
   <p className="mt-3.5 line-clamp-1 text-[11px] uppercase tracking-[0.1em] opacity-65">{it.title}</p>
   <p className="mt-1 text-[13px]" style={{ color: it.sold ? "inherit" : accent, opacity: it.sold ? 0.45 : 1 }}>{it.price}</p>
  </a>
 );
}

// The section heading block — shared by every layout so the eyebrow/heading pair is edited the same
// way whichever one is chosen.
function Head({ kit, align = "text-center", className = "mb-12" }: { kit: EditKit; align?: string; className?: string }) {
 const { b, ctx, p, txt } = kit;
 if (!p.heading) return null;
 return (
  <div className={`${className} ${align}`}>
   {/* `??`, not `||`: a section saved before the eyebrow was editable has no key at all and keeps
       the label it has always shown, while a seller who clears the field gets an empty one. With
       `||` an emptied eyebrow sprang straight back to "The Edit". */}
   {(p.eyebrow ?? "The Edit") !== "" && <span {...txt(p.eyebrow ?? "The Edit", "eyebrow")} className="mb-3 block text-[11px] @lg:text-[10px] uppercase tracking-[0.3em] opacity-40" />}
   <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-3xl @xl:text-[2.6rem] leading-tight" style={{ fontFamily: ctx.head }} />
  </div>
 );
}

// The store's own word for an empty grid (storefront-words.ts), not a fixed "Coming soon".
const Empty = ({ kit }: { kit: EditKit }) => <p className="py-10 @lg:py-16 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">{kit.ctx.words?.empty || DEFAULT_WORDS.empty}</p>;

// ── grid ────────────────────────────────────────────────────────────────────────────────────────
// The layout that shipped. Column count and gap are merchant controls; the defaults reproduce the
// original exactly (2 up on a phone, 3 at @lg, 4 at @2xl).
function FeaturedGrid({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { shopHref, colors, fg } = ctx;
 const products = productsFor(ctx, p);
 const shown = products.slice(0, featuredCount(p.limit, 8));
 // Unset = "Auto": fit the row length to how many pieces there actually are.
 const c = p.cols || String(autoColumns(shown.length));
 // autoColumns already avoids a stranded piece, but a template that pins `cols` bypasses it — and
 // four pieces in a three-wide grid leaves one alone on its own row, which reads as a broken layout
 // rather than a curated one. This is the FEATURED block, a chosen showcase rather than the
 // catalogue, so dropping the odd one out is honest: nothing is hidden that a shopper was promised.
 // A remainder of two still looks deliberate, so only the lone orphan is trimmed.
 const perRow = Number(c) || 3;
 const noOrphan = shown.length > perRow && shown.length % perRow === 1 ? shown.slice(0, -1) : shown;
 const cols = c === "1" ? "@lg:grid-cols-1" : c === "2" ? "@lg:grid-cols-2" : c === "3" ? "@lg:grid-cols-3" : c === "5" ? "@lg:grid-cols-4 @2xl:grid-cols-5" : "@lg:grid-cols-4";
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-12 @lg:py-20 @xl:py-24">
   <Head kit={kit} />
   {noOrphan.length ? (
    <div className={`relative grid grid-cols-2 gap-x-5 gap-y-12 @lg:gap-x-8 ${cols}`} style={p.gap ? { gap: `${p.gap}px` } : undefined}>
     <ArrangeHandle kit={kit} prop="gap" title="Drag to change the spacing" />
     {noOrphan.map((it, i) => <Card key={it.key || i} it={it} i={i} shopHref={shopHref} accent={colors.accent} fg={fg} words={ctx.words}/>)}
    </div>
   ) : <Empty kit={kit} />}
  </section>
 );
}

// ── carousel ────────────────────────────────────────────────────────────────────────────────────
// A swipeable rail. CSS scroll-snap, no JS — this renderer is shared with the live storefront's
// server component, and a scroll track is natively swipeable on a phone and trackpad-scrollable on
// desktop. Card width is the merchant's control; the rail bleeds off the right edge deliberately,
// which is what signals "there's more this way".
function FeaturedCarousel({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { shopHref, colors, fg } = ctx;
 const products = productsFor(ctx, p);
 const shown = products.slice(0, featuredCount(p.limit, 12));
 const w = Math.min(60, Math.max(18, Number(p.cardW) || 26));
 return (
  <section className="vya-free-canvas relative py-12 @lg:py-20 @xl:py-24">
   {/* On the section, not the rail: a handle inside an overflow-x-auto strip scrolls out of reach
       and widens the scroll area behind it. Two stacked so both measurements stay grabbable. */}
   <ArrangeHandle kit={kit} prop="cardW" title="Drag to change the card width" style={{ marginTop: "-28px" }} />
   <ArrangeHandle kit={kit} prop="gap" title="Drag to change the spacing" style={{ marginTop: "28px" }} />
   <div className="mx-auto max-w-6xl px-5 @xl:px-8"><Head kit={kit} align="text-left" className="mb-8" /></div>
   {shown.length ? (
    <div className="vya-rail flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 @xl:px-8" style={p.gap ? { gap: `${p.gap}px` } : undefined}>
     {shown.map((it, i) => (
      <div key={it.key || i} className="shrink-0 snap-start" style={{ width: `min(74vw, ${w}rem)` }}>
       <Card it={it} i={i} shopHref={shopHref} accent={colors.accent} fg={fg} words={ctx.words}/>
      </div>
     ))}
    </div>
   ) : <Empty kit={kit} />}
   <style dangerouslySetInnerHTML={{ __html: ".vya-rail{justify-content:safe center;scrollbar-width:none;-ms-overflow-style:none}.vya-rail::-webkit-scrollbar{display:none}" }} />
  </section>
 );
}

// ── editorial ───────────────────────────────────────────────────────────────────────────────────
// One piece leads at full height with the rest stacked beside it — the magazine opener. Reads as a
// point of view rather than an inventory dump, which is the whole reason a vintage store has an
// "edit" in the first place.
function FeaturedEditorial({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { shopHref, colors, fg } = ctx;
 const products = productsFor(ctx, p);
 // Composed layout: one lead piece plus a fixed stack. The count IS the composition, so a stale
 // `limit` left behind by a previous layout is deliberately ignored rather than honoured.
 const shown = products.slice(0, EDITORIAL_PIECES);
 if (!shown.length) return <section className="mx-auto max-w-6xl px-5 py-12 @lg:py-20"><Head kit={kit} /><Empty kit={kit} /></section>;
 const [lead, ...rest] = shown;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-12 @lg:py-20 @xl:py-24">
   <Head kit={kit} align="text-left" className="mb-10" />
   <div className="grid gap-6 @lg:grid-cols-[1.25fr_1fr] @lg:gap-10">
    <Card it={lead} i={0} shopHref={shopHref} accent={colors.accent} fg={fg} words={ctx.words}ratio="aspect-[4/5] @lg:aspect-[3/4]" />
    <div className="grid grid-cols-2 gap-5 @lg:gap-6 content-start">
     {rest.map((it, i) => <Card key={it.key || i} it={it} i={i + 1} shopHref={shopHref} accent={colors.accent} fg={fg} words={ctx.words}ratio="aspect-square" />)}
    </div>
   </div>
  </section>
 );
}

// ── mosaic ──────────────────────────────────────────────────────────────────────────────────────
// A deliberately uneven grid: two tall pieces anchoring alternating corners, the rest square. The
// irregularity is the point — it reads as curation rather than as a catalogue page.
function FeaturedMosaic({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { shopHref, colors, fg } = ctx;
 const products = productsFor(ctx, p);
 // Composed layout: alternating large/small anchors. Same reasoning as editorial above.
 const shown = products.slice(0, MOSAIC_PIECES);
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-12 @lg:py-20 @xl:py-24">
   <Head kit={kit} />
   {shown.length ? (
    <div className="relative grid grid-cols-2 gap-4 @lg:grid-cols-4 @lg:gap-6" style={p.gap ? { gap: `${p.gap}px` } : undefined}>
     <ArrangeHandle kit={kit} prop="gap" title="Drag to change the spacing" />
     {shown.map((it, i) => {
      // Every fifth tile starting at the first spans two columns and two rows — a rhythm that keeps
      // repeating cleanly however many products the store has.
      const big = i % 5 === 0;
      return (
       <div key={it.key || i} className={big ? "col-span-2 row-span-2" : ""}>
        <Card it={it} i={i} shopHref={shopHref} accent={colors.accent} fg={fg} words={ctx.words}ratio={big ? "aspect-[4/5]" : "aspect-square"} />
       </div>
      );
     })}
    </div>
   ) : <Empty kit={kit} />}
  </section>
 );
}

// ── list ────────────────────────────────────────────────────────────────────────────────────────
// One piece per row: small photo, title, price, hairline between. The archive/stockist treatment —
// dense, scannable, and the right answer for a store whose pieces are better read than browsed.
function FeaturedList({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { shopHref, colors, fg } = ctx;
 const products = productsFor(ctx, p);
 const shown = products.slice(0, featuredCount(p.limit, 10));
 return (
  <section className="vya-free-canvas relative mx-auto max-w-4xl px-5 @xl:px-8 py-12 @lg:py-20 @xl:py-24">
   <Head kit={kit} align="text-left" className="mb-8" />
   {shown.length ? (
    <div style={{ borderTop: `1px solid ${fg}1f` }}>
     {shown.map((it, i) => (
      <a key={it.key || i} href={it.href || shopHref} className="group flex items-center gap-5 py-4" style={{ borderBottom: `1px solid ${fg}1f` }}>
       <span className="vya-round h-16 w-14 shrink-0 overflow-hidden" style={{ background: `${fg}0d` }}>
        {it.image && <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
       </span>
       <span className="min-w-0 flex-1 truncate text-[13px] uppercase tracking-[0.1em] opacity-75">{it.title}</span>
       {/* No photo to badge over in a list row, so the same word sits beside the price. */}
       {(it.sold || it.held) && <span data-vya-held={it.held && !it.sold ? "1" : undefined} className="shrink-0 bg-black/80 px-2.5 py-1 text-[9px] uppercase tracking-[0.22em] text-white">{it.sold ? ctx.words?.sold || DEFAULT_WORDS.sold : ctx.words?.held || DEFAULT_WORDS.held}</span>}
       <span className="shrink-0 text-[13px]" style={{ color: it.sold ? "inherit" : colors.accent, opacity: it.sold ? 0.45 : 1 }}>{it.price}</span>
      </a>
     ))}
    </div>
   ) : <Empty kit={kit} />}
  </section>
 );
}

export function renderFeatured(kit: EditKit, variant: string) {
 switch (variant) {
  case "carousel": return <FeaturedCarousel kit={kit} />;
  case "editorial": return <FeaturedEditorial kit={kit} />;
  case "mosaic": return <FeaturedMosaic kit={kit} />;
  case "list": return <FeaturedList kit={kit} />;
  default: return <FeaturedGrid kit={kit} />;
 }
}
