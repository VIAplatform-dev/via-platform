/* eslint-disable @next/next/no-img-element */
// Split — a photo beside a story. The editorial workhorse: an about paragraph, a category pitch, a
// sourcing note. Four arrangements of the same four fields (heading, body, button, photo).
import { FreeField, ImageSlot, type EditKit } from "./kit";

// Which side the photo sits on. Stored as a word ("left"/"right") because it predates variants and
// existing storefronts hold it that way.
const imageRight = (p: Record<string, string>) => (p.imageSide || "").toLowerCase().startsWith("r");

function Body({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <>
   {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: ctx.head }} />}
   {p.body && <p {...txtPlain(p.body, "body")} className="vya-body mt-4 whitespace-pre-wrap text-sm leading-[1.9] opacity-75 @xl:text-[15px]" />}
   {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={ctx.shopHref} className="vya-cta mt-7 inline-block px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85" style={{ background: ctx.colors.accent, color: "#fff" }} />}
  </>
 );
}

// ── half (the layout that shipped) ──────────────────────────────────────────────────────────────
function SplitHalf({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const right = imageRight(p);
 return (
  <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 @xl:px-8 py-16 @xl:py-24 @lg:grid-cols-2 @lg:gap-14">
   <div className={right ? "@lg:order-2" : ""}>
    <ImageSlot kit={kit} src={p.image} onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} ratio="aspect-[4/5]" rounded="vya-img" />
   </div>
   <div className="vya-free-canvas relative"><Body kit={kit} /></div>
  </section>
 );
}

// ── offset ──────────────────────────────────────────────────────────────────────────────────────
// The photo runs taller than the text column and the copy sits low against it, so the two blocks
// don't line up top and bottom. That deliberate misalignment is what stops a split reading like a
// slide from a deck.
function SplitOffset({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const right = imageRight(p);
 return (
  <section className="mx-auto grid max-w-6xl gap-8 px-5 @xl:px-8 py-16 @xl:py-28 @lg:grid-cols-[1.15fr_1fr] @lg:gap-16">
   <div className={right ? "@lg:order-2" : ""}>
    <ImageSlot kit={kit} src={p.image} onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} ratio="aspect-[3/4] @lg:aspect-[4/5]" rounded="vya-img" />
   </div>
   <div className="vya-free-canvas relative flex flex-col justify-end pb-4 @lg:pb-16"><Body kit={kit} /></div>
  </section>
 );
}

// ── panel ───────────────────────────────────────────────────────────────────────────────────────
// Edge to edge, no page margin: the photo fills its half and the copy sits on a solid panel filling
// the other. The most graphic of the four — the two halves meet on a hard line.
function SplitPanel({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const right = imageRight(p);
 return (
  <section className="vya-fill grid w-full items-stretch @lg:grid-cols-2">
   <div className={`relative min-h-[46vh] w-full overflow-hidden @lg:min-h-[70vh] ${right ? "@lg:order-2" : ""}`} style={{ background: `${ctx.fg}0d` }}>
    {p.image && <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
   </div>
   <div className="vya-free-canvas relative flex flex-col justify-center px-7 py-16 @lg:px-14 @xl:px-20" style={{ background: `${ctx.fg}08` }}>
    <Body kit={kit} />
   </div>
  </section>
 );
}

// ── stacked ─────────────────────────────────────────────────────────────────────────────────────
// Photo above, copy centred beneath it in a narrow measure. The one arrangement that's identical on
// a phone and a desktop, so nothing reflows — worth choosing when most of a store's traffic is mobile.
function SplitStacked({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 return (
  <section className="mx-auto max-w-4xl px-5 @xl:px-8 py-16 @xl:py-24">
   <ImageSlot kit={kit} src={p.image} onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} ratio="aspect-[16/9]" rounded="vya-img" />
   <div className="vya-free-canvas relative mx-auto mt-9 max-w-2xl text-center [&_.vya-cta]:mx-auto"><Body kit={kit} /></div>
  </section>
 );
}

export function renderSplit(kit: EditKit, variant: string) {
 switch (variant) {
  case "offset": return <SplitOffset kit={kit} />;
  case "panel": return <SplitPanel kit={kit} />;
  case "stacked": return <SplitStacked kit={kit} />;
  default: return <SplitHalf kit={kit} />;
 }
}
