/* eslint-disable @next/next/no-img-element */
// Featured products — five ways to present the same inventory.
//
// Product content (photo, title, price) comes from the store's listings, not from props, so what
// varies between these layouts is composition: an even grid, a swipeable rail, one lead piece with
// a supporting stack, an asymmetric mosaic, or a dense archive list. The section's own heading and
// eyebrow are editable in all five.
import { FreeField, productsFor, type EditKit, type BlockProduct } from "./kit";
import { featuredCount, autoColumns } from "@/app/lib/storefront-blocks";

// Composed layouts are built around an exact arrangement, so their capacity is a property of the
// design rather than something a merchant sets. Named here so the number and the reason live together.
const EDITORIAL_PIECES = 5; // one lead + a stack of four
const MOSAIC_PIECES = 6;    // three alternating large/small pairs



// The shared product card. Every layout draws its products with this, so hover behaviour, image
// radius (.vya-round), and the title/price treatment stay identical across the family — only the
// arrangement changes.
function Card({ it, i, shopHref, accent, fg, ratio = "aspect-[4/5]" }: { it: BlockProduct; i: number; shopHref: string; accent: string; fg: string; ratio?: string }) {
 return (
  <a key={it.key || i} href={it.href || shopHref} className="group block">
   <div className={`vya-round ${ratio} w-full overflow-hidden`} style={{ background: `${fg}0d` }}>
    {it.image && <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.045]" />}
   </div>
   <p className="mt-3.5 line-clamp-1 text-[11px] uppercase tracking-[0.1em] opacity-65">{it.title}</p>
   <p className="mt-1 text-[13px]" style={{ color: accent }}>{it.price}</p>
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
   <span {...txt(p.eyebrow || "The Edit", "eyebrow")} className="mb-3 block text-[11px] @lg:text-[10px] uppercase tracking-[0.3em] opacity-40" />
   <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-3xl @xl:text-[2.6rem] leading-tight" style={{ fontFamily: ctx.head }} />
  </div>
 );
}

const Empty = () => <p className="py-10 @lg:py-16 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">Coming soon</p>;

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
    <div className={`grid grid-cols-2 gap-x-5 gap-y-12 @lg:gap-x-8 ${cols}`} style={p.gap ? { gap: `${p.gap}px` } : undefined}>
     {noOrphan.map((it, i) => <Card key={it.key || i} it={it} i={i} shopHref={shopHref} accent={colors.accent} fg={fg} />)}
    </div>
   ) : <Empty />}
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
   <div className="mx-auto max-w-6xl px-5 @xl:px-8"><Head kit={kit} align="text-left" className="mb-8" /></div>
   {shown.length ? (
    <div className="vya-rail flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 @xl:px-8" style={p.gap ? { gap: `${p.gap}px` } : undefined}>
     {shown.map((it, i) => (
      <div key={it.key || i} className="shrink-0 snap-start" style={{ width: `min(74vw, ${w}rem)` }}>
       <Card it={it} i={i} shopHref={shopHref} accent={colors.accent} fg={fg} />
      </div>
     ))}
    </div>
   ) : <Empty />}
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
 if (!shown.length) return <section className="mx-auto max-w-6xl px-5 py-12 @lg:py-20"><Head kit={kit} /><Empty /></section>;
 const [lead, ...rest] = shown;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-12 @lg:py-20 @xl:py-24">
   <Head kit={kit} align="text-left" className="mb-10" />
   <div className="grid gap-6 @lg:grid-cols-[1.25fr_1fr] @lg:gap-10">
    <Card it={lead} i={0} shopHref={shopHref} accent={colors.accent} fg={fg} ratio="aspect-[4/5] @lg:aspect-[3/4]" />
    <div className="grid grid-cols-2 gap-5 @lg:gap-6 content-start">
     {rest.map((it, i) => <Card key={it.key || i} it={it} i={i + 1} shopHref={shopHref} accent={colors.accent} fg={fg} ratio="aspect-square" />)}
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
    <div className="grid grid-cols-2 gap-4 @lg:grid-cols-4 @lg:gap-6" style={p.gap ? { gap: `${p.gap}px` } : undefined}>
     {shown.map((it, i) => {
      // Every fifth tile starting at the first spans two columns and two rows — a rhythm that keeps
      // repeating cleanly however many products the store has.
      const big = i % 5 === 0;
      return (
       <div key={it.key || i} className={big ? "col-span-2 row-span-2" : ""}>
        <Card it={it} i={i} shopHref={shopHref} accent={colors.accent} fg={fg} ratio={big ? "aspect-[4/5]" : "aspect-square"} />
       </div>
      );
     })}
    </div>
   ) : <Empty />}
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
       <span className="shrink-0 text-[13px]" style={{ color: colors.accent }}>{it.price}</span>
      </a>
     ))}
    </div>
   ) : <Empty />}
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
