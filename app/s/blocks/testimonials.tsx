// Reviews — social proof, four ways. Quotes and names are repeated content (ITEM_SCHEMAS.testimonials),
// so every layout gets add/delete/reorder from the same panel editor, and each quote and name is
// editable straight on the canvas.
import { FreeField, emptyHint, type EditKit } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";

const S = ITEM_SCHEMAS.testimonials;
const Stars = ({ accent, className = "" }: { accent: string; className?: string }) => (
 <div className={`text-[13px] tracking-[0.25em] ${className}`} style={{ color: accent }}>★★★★★</div>
);

function Heading({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.heading && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className={`vya-heading ${className}`} style={{ fontFamily: ctx.head }} />;
}

// ── cards (the layout that shipped) ─────────────────────────────────────────────────────────────
function TestimonialsCards({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const items = kit.items(S);
 if (!items.length) return emptyHint(ctx, "Reviews — add customer quotes");
 const set = (i: number, patch: Record<string, string>) => kit.setItems(S, items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
 return (
  <section className="vya-free-canvas relative mx-auto max-w-5xl px-6 @xl:px-8 py-16 @xl:py-24" style={{ borderTop: `1px solid ${ctx.fg}14`, borderBottom: `1px solid ${ctx.fg}14` }}>
   <Heading kit={kit} className="mb-12 text-center text-2xl @xl:text-3xl leading-tight" />
   <div className="grid gap-8 @lg:grid-cols-3 @lg:gap-10">
    {items.slice(0, 3).map((t, i) => (
     <div key={i} className="text-center @lg:text-left">
      <Stars accent={ctx.colors.accent} className="mb-3" />
      <p className="text-[15px] leading-relaxed @xl:text-[16px]">“<span {...kit.txtItem(t.quote, (v) => set(i, { quote: v }))} />”</p>
      {(t.name || ctx.edit) && <p {...kit.txtItem(t.name, (v) => set(i, { name: v }))} className="mt-4 text-[11px] uppercase tracking-[0.18em] opacity-55" />}
     </div>
    ))}
   </div>
  </section>
 );
}

// ── single ──────────────────────────────────────────────────────────────────────────────────────
// One review at display size. A single quote given real scale carries more weight than three set
// small — the right choice when a store has one review it's genuinely proud of.
function TestimonialsSingle({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const items = kit.items(S);
 if (!items.length) return emptyHint(ctx, "Reviews — add a customer quote");
 const set = (i: number, patch: Record<string, string>) => kit.setItems(S, items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
 const t = items[0];
 return (
  <section className="vya-free-canvas relative mx-auto max-w-3xl px-6 @xl:px-8 py-20 @xl:py-28 text-center">
   <Heading kit={kit} className="mb-8 text-[11px] uppercase tracking-[0.24em] opacity-50" />
   <Stars accent={ctx.colors.accent} className="mb-6 flex justify-center" />
   <p className="text-2xl leading-[1.4] @xl:text-[2rem]" style={{ fontFamily: ctx.head }}>“<span {...kit.txtItem(t.quote, (v) => set(0, { quote: v }))} />”</p>
   {(t.name || ctx.edit) && <p {...kit.txtItem(t.name, (v) => set(0, { name: v }))} className="mt-7 text-[11px] uppercase tracking-[0.2em] opacity-55" />}
   {items.length > 1 && ctx.edit && <p className="mt-6 text-[10px] uppercase tracking-[0.2em] opacity-35">This layout shows the first review — the rest stay saved</p>}
  </section>
 );
}

// ── plain ───────────────────────────────────────────────────────────────────────────────────────
// No stars, no cards, no borders: quotes as running text with the name beneath, stacked down a
// narrow measure. The quietest treatment, for stores whose whole aesthetic is restraint.
function TestimonialsPlain({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const items = kit.items(S);
 if (!items.length) return emptyHint(ctx, "Reviews — add customer quotes");
 const set = (i: number, patch: Record<string, string>) => kit.setItems(S, items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
 return (
  <section className="vya-free-canvas relative mx-auto max-w-2xl px-6 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-10 text-[11px] uppercase tracking-[0.24em] opacity-50" />
   <div className="flex flex-col gap-9">
    {items.map((t, i) => (
     <div key={i}>
      <p className="text-[17px] leading-[1.7] @xl:text-[19px]" style={{ fontFamily: ctx.head }}><span {...kit.txtItem(t.quote, (v) => set(i, { quote: v }))} /></p>
      {(t.name || ctx.edit) && <p {...kit.txtItem(t.name, (v) => set(i, { name: v }))} className="mt-2.5 text-[11px] uppercase tracking-[0.18em] opacity-45" />}
     </div>
    ))}
   </div>
  </section>
 );
}

// ── marquee ─────────────────────────────────────────────────────────────────────────────────────
// Quotes scrolling continuously across a strip. Fits many reviews in one band of the page and reads
// as ambient reassurance rather than as a section demanding to be read.
//
// Editor vs live differ deliberately: paused and shown once in the editor (so each quote is
// click-to-edit and nothing crawls away mid-edit), doubled and animated on the live site. Honours
// prefers-reduced-motion.
function TestimonialsMarquee({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const items = kit.items(S);
 if (!items.length) return emptyHint(ctx, "Reviews — add customer quotes");
 const set = (i: number, patch: Record<string, string>) => kit.setItems(S, items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
 const row = ctx.edit ? items : [...items, ...items];
 return (
  <section className="vya-free-canvas relative py-14 @xl:py-16" style={{ borderTop: `1px solid ${ctx.fg}14`, borderBottom: `1px solid ${ctx.fg}14` }}>
   <div className="mx-auto mb-8 max-w-5xl px-6"><Heading kit={kit} className="text-center text-[11px] uppercase tracking-[0.24em] opacity-50" /></div>
   <div className="vya-tmarq overflow-hidden whitespace-nowrap">
    <div className="vya-tmarq-track inline-flex gap-14" style={ctx.edit ? { animation: "none" } : undefined}>
     {row.map((t, i) => {
      const idx = i % items.length;
      return (
       <span key={i} className="inline-flex items-baseline gap-3">
        <span className="text-[15px] opacity-80">“{ctx.edit ? <span {...kit.txtItem(t.quote, (v) => set(idx, { quote: v }))} /> : t.quote}”</span>
        <span className="text-[11px] uppercase tracking-[0.18em] opacity-45">{ctx.edit ? <span {...kit.txtItem(t.name, (v) => set(idx, { name: v }))} /> : t.name}</span>
       </span>
      );
     })}
    </div>
   </div>
   <style dangerouslySetInnerHTML={{ __html: ".vya-tmarq-track{animation:vya-tmarq 42s linear infinite}@keyframes vya-tmarq{to{transform:translateX(-50%)}}@media(prefers-reduced-motion:reduce){.vya-tmarq-track{animation:none}}" }} />
  </section>
 );
}

export function renderTestimonials(kit: EditKit, variant: string) {
 switch (variant) {
  case "single": return <TestimonialsSingle kit={kit} />;
  case "plain": return <TestimonialsPlain kit={kit} />;
  case "marquee": return <TestimonialsMarquee kit={kit} />;
  default: return <TestimonialsCards kit={kit} />;
 }
}
