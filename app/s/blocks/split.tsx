/* eslint-disable @next/next/no-img-element */
// Split — a photo beside a story. The editorial workhorse: an about paragraph, a category pitch, a
// sourcing note. Four arrangements of the same four fields (heading, body, button, photo).
import { FreeField, ImageSlot, PhotoFrame, panBgImg, type EditKit } from "./kit";

// Which side the photo sits on. Stored as a word ("left"/"right") because it predates variants and
// existing storefronts hold it that way.
const imageRight = (p: Record<string, string>) => (p.imageSide || "").toLowerCase().startsWith("r");

function Body({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <>
   {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: ctx.head }} />}
   {p.body && <p {...txtPlain(p.body, "body")} className="vya-body mt-4 whitespace-pre-wrap text-sm leading-[1.9] opacity-75 @xl:text-[15px]" />}
   {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={p.ctaHref || ctx.shopHref} className="vya-cta mt-7 inline-block px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85" style={{ background: ctx.colors.accent, color: "#fff" }} />}
  </>
 );
}

// ── half (the layout that shipped) ──────────────────────────────────────────────────────────────
function SplitHalf({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 const right = imageRight(p);
 return (
  <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24 @lg:grid-cols-2 @lg:gap-14">
   <div className={right ? "@lg:order-2" : ""}>
    <PhotoFrame kit={kit} className="relative w-full"><ImageSlot kit={kit} src={p.image} onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} pos={p.imagePos} onPos={(v) => ctx.onEditField?.(kit.b.id, "imagePos", v)} zoom={p.imageZoom} ratio="aspect-[4/5]" rounded="vya-img" /></PhotoFrame>
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
  <section className="mx-auto grid max-w-6xl gap-8 px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-28 @lg:grid-cols-[1.15fr_1fr] @lg:gap-16">
   <div className={right ? "@lg:order-2" : ""}>
    <PhotoFrame kit={kit} className="relative w-full"><ImageSlot kit={kit} src={p.image} onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} pos={p.imagePos} onPos={(v) => ctx.onEditField?.(kit.b.id, "imagePos", v)} zoom={p.imageZoom} ratio="aspect-[3/4] @lg:aspect-[4/5]" rounded="vya-img" /></PhotoFrame>
   </div>
   <div className="vya-free-canvas relative flex flex-col justify-end pb-4 @lg:pb-16"><Body kit={kit} /></div>
  </section>
 );
}

// ── panel ───────────────────────────────────────────────────────────────────────────────────────
// Edge to edge, no page margin: the photo fills its half and the copy sits on a solid panel filling
// the other. The most graphic of the four — the two halves meet on a hard line.
function SplitPanel({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 const right = imageRight(p);
 return (
  <section className="vya-fill grid w-full items-stretch @lg:grid-cols-2">
   <PhotoFrame kit={kit} className={`relative min-h-[46vh] w-full overflow-hidden @lg:min-h-[70vh] ${right ? "@lg:order-2" : ""}`} style={{ background: `${ctx.fg}0d` }}>
    {p.image && <img src={p.image} alt="" {...panBgImg(ctx, b)} className={`absolute inset-0 h-full w-full object-cover ${ctx.edit ? "cursor-grab touch-none" : ""}`} />}
   </PhotoFrame>
   <div className="vya-free-canvas relative flex flex-col justify-center px-7 py-10 @lg:py-16 @lg:px-14 @xl:px-20" style={{ background: `${ctx.fg}08` }}>
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
  <section className="mx-auto max-w-4xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24">
   <PhotoFrame kit={kit} className="relative w-full"><ImageSlot kit={kit} src={p.image} onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} pos={p.imagePos} onPos={(v) => ctx.onEditField?.(kit.b.id, "imagePos", v)} zoom={p.imageZoom} ratio="aspect-[16/9]" rounded="vya-img" /></PhotoFrame>
   <div className="vya-free-canvas relative mx-auto mt-9 max-w-2xl text-center [&_.vya-cta]:mx-auto"><Body kit={kit} /></div>
  </section>
 );
}

// No photo → the copy re-centres in a single measure.
//
// Deleting the picture out of a two-column split used to leave the words stranded in one half with
// dead space beside them, which reads as a broken layout rather than as a text section. Removing the
// image is therefore a change of ARRANGEMENT, not a blanked cell: what's left is centred, the way the
// section would have looked had it never carried a photo. In the editor a compact slot stays above
// the copy so the photo can be put straight back.
function SplitCentred({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 return (
  <section className="mx-auto max-w-3xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24 text-center">
   {ctx.edit && (
    <div className="mx-auto mb-9 max-w-[15rem]">
     <ImageSlot kit={kit} src="" onPick={(url) => ctx.onEditField?.(kit.b.id, "image", url)} ratio="aspect-[4/3]" rounded="vya-img" />
    </div>
   )}
   <div className="vya-free-canvas relative [&_.vya-cta]:mx-auto"><Body kit={kit} /></div>
  </section>
 );
}

export function renderSplit(kit: EditKit, variant: string) {
 // Applies to every arrangement: with nothing to sit beside, none of the four have a second column
 // to justify. Checked before the switch so a new variant inherits it rather than re-deciding.
 if (!(kit.p.image || "").trim()) return <SplitCentred kit={kit} />;
 switch (variant) {
  case "offset": return <SplitOffset kit={kit} />;
  case "panel": return <SplitPanel kit={kit} />;
  case "stacked": return <SplitStacked kit={kit} />;
  default: return <SplitHalf kit={kit} />;
 }
}
