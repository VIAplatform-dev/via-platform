// Content sections — announcement, text, statement, marquee. Small sections that carry words rather
// than merchandise, and where the layout choice is mostly about how loud the words are.
import { FreeField, emptyHint, type EditKit } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";

// ── announcement ────────────────────────────────────────────────────────────────────────────────
// The thin strip across the very top. Three volumes: a solid accent bar (what shipped), a quiet
// hairline rule, and a scrolling ticker for when there's more than one thing to say.
function AnnouncementBar({ kit }: { kit: EditKit }) {
 const { ctx, p, txt } = kit;
 if (!p.text) return null;
 return <div {...txt(p.text, "text")} className="px-4 py-2.5 text-center text-[10px] uppercase tracking-[0.22em]" style={{ background: ctx.colors.accent, color: "#fff" }} />;
}

// No fill: the message sits on the page's own ground between two hairlines. Reads as a note rather
// than as a banner, which suits a store that doesn't want to shout about shipping thresholds.
function AnnouncementQuiet({ kit }: { kit: EditKit }) {
 const { ctx, p, txt } = kit;
 if (!p.text) return null;
 return <div {...txt(p.text, "text")} className="px-4 py-3 text-center text-[10px] uppercase tracking-[0.22em] opacity-70" style={{ borderTop: `1px solid ${ctx.fg}1a`, borderBottom: `1px solid ${ctx.fg}1a` }} />;
}

// A ticker. The message repeats across the strip and scrolls — for stores running several notices at
// once (shipping, a drop time, a discount). Paused and shown once in the editor so it's editable.
function AnnouncementTicker({ kit }: { kit: EditKit }) {
 const { ctx, p, txt } = kit;
 if (!p.text) return null;
 return (
  <div className="vya-annticker overflow-hidden whitespace-nowrap py-2.5" style={{ background: ctx.colors.accent, color: "#fff" }}>
   <div className="vya-annticker-track inline-flex gap-16" style={ctx.edit ? { animation: "none" } : undefined}>
    {(ctx.edit ? [0] : [0, 1, 2, 3, 4, 5]).map((i) => (
     <span key={i} className="text-[10px] uppercase tracking-[0.22em]">
      {i === 0 ? <span {...txt(p.text, "text")} className="inline" /> : p.text}
     </span>
    ))}
   </div>
   <style dangerouslySetInnerHTML={{ __html: ".vya-annticker-track{animation:vya-ann 26s linear infinite}@keyframes vya-ann{to{transform:translateX(-50%)}}@media(prefers-reduced-motion:reduce){.vya-annticker-track{animation:none}}" }} />
  </div>
 );
}

// ── text ────────────────────────────────────────────────────────────────────────────────────────
function TextCentered({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-2xl px-6 py-20 @xl:py-24 text-center">
   {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading mb-5 text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: ctx.head }} />}
   {p.body && <p {...txtPlain(p.body, "body")} className="vya-body whitespace-pre-wrap text-sm leading-[1.9] opacity-75 @xl:text-[15px]" />}
  </section>
 );
}

// Left-aligned with the heading held in a narrow column beside the copy — the shape a magazine uses
// for a standfirst. Gives a long about-page paragraph somewhere to breathe.
function TextEditorial({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="mx-auto grid max-w-5xl gap-6 px-6 @xl:px-8 py-20 @xl:py-28 @lg:grid-cols-[1fr_1.6fr] @lg:gap-16">
   <div className="vya-free-canvas relative">
    {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-2xl leading-tight @xl:text-3xl" style={{ fontFamily: ctx.head }} />}
   </div>
   {p.body && <p {...txtPlain(p.body, "body")} className="vya-body whitespace-pre-wrap text-[15px] leading-[1.9] opacity-80 @xl:text-base" />}
  </section>
 );
}

// The copy set in two columns, newspaper-style. Only worth choosing for genuinely long text — it's
// the one layout here that gets better the more words you have.
function TextColumns({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-5xl px-6 @xl:px-8 py-20 @xl:py-24">
   {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading mb-8 text-3xl leading-tight @xl:text-4xl" style={{ fontFamily: ctx.head }} />}
   {p.body && <p {...txtPlain(p.body, "body")} className="vya-body whitespace-pre-wrap text-sm leading-[1.9] opacity-75 @xl:text-[15px] @lg:[column-count:2] @lg:[column-gap:3.5rem]" />}
  </section>
 );
}

// Heading set at display size with the copy beneath it as a caption. Inverts the usual hierarchy:
// the heading IS the section, the paragraph explains it.
function TextLede({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-4xl px-6 py-20 @xl:py-28">
   {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-4xl leading-[1.08] tracking-tight @xl:text-6xl" style={{ fontFamily: ctx.head }} />}
   {p.body && <p {...txtPlain(p.body, "body")} className="vya-body mt-8 max-w-xl whitespace-pre-wrap text-sm leading-[1.9] opacity-65 @xl:text-[15px]" />}
  </section>
 );
}

// ── statement ───────────────────────────────────────────────────────────────────────────────────
function StatementLarge({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-4xl px-6 py-20 @xl:py-28">
   {p.quote && <p {...txtPlain(p.quote, "quote")} className="vya-heading whitespace-pre-wrap text-3xl leading-[1.1] tracking-tight @xl:text-5xl" style={{ fontFamily: ctx.head }} />}
   {p.attribution && <FreeField b={b} ctx={ctx} fieldKey="attribution" tag="p" value={p.attribution} className="vya-sub mt-6 text-[11px] uppercase tracking-[0.22em] opacity-60" />}
  </section>
 );
}

// Centred, with a rule above and below. The quote reads as a pull-quote lifted out of the page
// rather than as a headline the page is built around.
function StatementBoxed({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-3xl px-6 py-16 @xl:py-20 text-center">
   <div className="py-10" style={{ borderTop: `1px solid ${ctx.fg}26`, borderBottom: `1px solid ${ctx.fg}26` }}>
    {p.quote && <p {...txtPlain(p.quote, "quote")} className="vya-heading whitespace-pre-wrap text-2xl leading-[1.3] @xl:text-[2rem]" style={{ fontFamily: ctx.head }} />}
    {p.attribution && <FreeField b={b} ctx={ctx} fieldKey="attribution" tag="p" value={p.attribution} className="vya-sub mt-5 text-[11px] uppercase tracking-[0.22em] opacity-60" />}
   </div>
  </section>
 );
}

// The attribution sits beside the quote rather than under it, on its own hairline column — a credit
// line, the way a magazine runs a byline down the margin.
function StatementSide({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <section className="mx-auto grid max-w-5xl gap-5 px-6 @xl:px-8 py-20 @xl:py-28 @lg:grid-cols-[1.8fr_1fr] @lg:gap-14">
   <div className="vya-free-canvas relative">
    {p.quote && <p {...txtPlain(p.quote, "quote")} className="vya-heading whitespace-pre-wrap text-3xl leading-[1.12] tracking-tight @xl:text-[2.8rem]" style={{ fontFamily: ctx.head }} />}
   </div>
   {p.attribution && (
    <div className="flex items-end @lg:pl-8" style={{ borderLeft: `1px solid ${ctx.fg}1f` }}>
     <FreeField b={b} ctx={ctx} fieldKey="attribution" tag="p" value={p.attribution} className="vya-sub text-[11px] uppercase leading-relaxed tracking-[0.22em] opacity-60" />
    </div>
   )}
  </section>
 );
}

// ── marquee ─────────────────────────────────────────────────────────────────────────────────────
const S_MARQ = ITEM_SCHEMAS.marquee;

// The names scroll. Editor shows them once and paused so each is click-to-edit; the live site doubles
// the list and animates it.
function MarqueeScroll({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const items = kit.items(S_MARQ);
 if (!items.length) return emptyHint(ctx, "Marquee — add the names you carry");
 const labels = items.map((i) => i.label);
 const sep = p.sep ?? "✦";
 const set = (i: number, v: string) => kit.setItems(S_MARQ, items.map((x, j) => (j === i ? { label: v } : x)));
 return (
  <div className="vya-marquee overflow-hidden whitespace-nowrap py-5" style={{ borderTop: `1px solid ${ctx.fg}1a`, borderBottom: `1px solid ${ctx.fg}1a` }}>
   <div className="vya-marquee-track inline-flex gap-12" style={ctx.edit ? { animation: "none" } : undefined}>
    {(ctx.edit ? labels : [...labels, ...labels]).map((it, i) => (
     <span key={i} className="text-lg uppercase tracking-wide opacity-55">
      {ctx.edit ? <span {...kit.txtItem(it, (v) => set(i, v))} /> : it}
      {sep ? <span style={{ marginLeft: "3rem", color: ctx.colors.accent }}>{sep}</span> : null}
     </span>
    ))}
   </div>
  </div>
 );
}

// Static: the names laid out in a centred row, no motion. Easier to actually read than a scroller,
// and the right choice when the list is short enough to fit.
function MarqueeStatic({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const items = kit.items(S_MARQ);
 if (!items.length) return emptyHint(ctx, "Marquee — add the names you carry");
 const sep = p.sep ?? "✦";
 const set = (i: number, v: string) => kit.setItems(S_MARQ, items.map((x, j) => (j === i ? { label: v } : x)));
 return (
  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-6" style={{ borderTop: `1px solid ${ctx.fg}1a`, borderBottom: `1px solid ${ctx.fg}1a` }}>
   {items.map((t, i) => (
    <span key={i} className="flex items-center gap-6 text-[13px] uppercase tracking-[0.18em] opacity-60">
     <span {...kit.txtItem(t.label, (v) => set(i, v))} />
     {sep && i < items.length - 1 ? <span style={{ color: ctx.colors.accent }}>{sep}</span> : null}
    </span>
   ))}
  </div>
 );
}

// Oversized display type, scrolling. The names become the graphic rather than a footnote — good as a
// break between two heavy sections.
function MarqueeDisplay({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const items = kit.items(S_MARQ);
 if (!items.length) return emptyHint(ctx, "Marquee — add the names you carry");
 const labels = items.map((i) => i.label);
 const sep = p.sep ?? "—";
 const set = (i: number, v: string) => kit.setItems(S_MARQ, items.map((x, j) => (j === i ? { label: v } : x)));
 return (
  <div className="vya-marquee overflow-hidden whitespace-nowrap py-10">
   <div className="vya-marquee-track inline-flex gap-10" style={ctx.edit ? { animation: "none" } : undefined}>
    {(ctx.edit ? labels : [...labels, ...labels]).map((it, i) => (
     <span key={i} className="text-4xl uppercase tracking-tight opacity-15 @xl:text-6xl" style={{ fontFamily: ctx.head }}>
      {ctx.edit ? <span {...kit.txtItem(it, (v) => set(i, v))} /> : it}
      {sep ? <span style={{ marginLeft: "2.5rem" }}>{sep}</span> : null}
     </span>
    ))}
   </div>
  </div>
 );
}

export function renderAnnouncement(kit: EditKit, variant: string) {
 switch (variant) {
  case "quiet": return <AnnouncementQuiet kit={kit} />;
  case "ticker": return <AnnouncementTicker kit={kit} />;
  default: return <AnnouncementBar kit={kit} />;
 }
}
export function renderText(kit: EditKit, variant: string) {
 switch (variant) {
  case "editorial": return <TextEditorial kit={kit} />;
  case "columns": return <TextColumns kit={kit} />;
  case "lede": return <TextLede kit={kit} />;
  default: return <TextCentered kit={kit} />;
 }
}
export function renderStatement(kit: EditKit, variant: string) {
 switch (variant) {
  case "boxed": return <StatementBoxed kit={kit} />;
  case "side": return <StatementSide kit={kit} />;
  default: return <StatementLarge kit={kit} />;
 }
}
export function renderMarquee(kit: EditKit, variant: string) {
 switch (variant) {
  case "static": return <MarqueeStatic kit={kit} />;
  case "display": return <MarqueeDisplay kit={kit} />;
  default: return <MarqueeScroll kit={kit} />;
 }
}
