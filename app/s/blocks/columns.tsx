// Columns — the general-purpose "content side by side" family: feature rows, values, how-it-works,
// service promises. Each column is a repeated item (heading, body, image, button label, button link),
// so all four layouts share one editor and one set of add/reorder controls.
import { FreeField, emptyHint, ImageSlot, type EditKit, type Item } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";

const S = ITEM_SCHEMAS.columns;
// A column with nothing in it at all shouldn't render a ghost card on the live site.
const filled = (c: Item) => c.heading || c.body || c.img;

function Heading({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.heading && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className={`vya-heading ${className}`} style={{ fontFamily: ctx.head }} />;
}
const gridFor = (cols?: string) => (cols === "2" ? "@lg:grid-cols-2" : cols === "4" ? "@lg:grid-cols-4" : "@lg:grid-cols-3");

// A column's button. It's one of several in a repeated list rather than a single top-level field, so
// it has no dedicated "edit button" panel of its own — but it carries `.vya-cta`, so every
// section-level button style (fill, shape, outline, border, hover) applies to it automatically. In
// the editor the link is inert, so clicking it edits the label instead of navigating away.
function ColButton({ kit, c, i, set }: { kit: EditKit; c: Item; i: number; set: (i: number, patch: Item) => void }) {
 const { ctx } = kit;
 if (!c.btn) return null;
 return <a {...kit.txtItem(c.btn, (v) => set(i, { btn: v }))} href={c.href || ctx.shopHref} onClick={ctx.edit ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined} className="vya-cta mt-4 inline-block self-start px-6 py-2.5 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85" style={{ background: ctx.colors.accent, color: "#fff" }} />;
}

function useCols(kit: EditKit) {
 const all = kit.items(S);
 const cols = kit.ctx.edit ? all : all.filter(filled);
 const set = (i: number, patch: Item) => kit.setItems(S, all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
 return { cols, set };
}

// ── image (the layout that shipped) ─────────────────────────────────────────────────────────────
function ColumnsImage({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { cols, set } = useCols(kit);
 if (!cols.length) return emptyHint(ctx, "Columns — add content");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24">
   <Heading kit={kit} className="mb-12 text-center text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className={`grid grid-cols-1 gap-8 @sm:grid-cols-2 @lg:gap-10 ${gridFor(p.cols)}`} style={p.gap ? { gap: `${p.gap}px` } : undefined}>
    {cols.slice(0, 8).map((c, i) => (
     <div key={i} className="flex flex-col">
      <ImageSlot kit={kit} src={c.img} alt={c.heading} onPick={(url) => set(i, { img: url })} className="mb-5" />
      {(c.heading || ctx.edit) && <h3 {...kit.txtItem(c.heading, (v) => set(i, { heading: v }))} className="text-xl leading-snug @xl:text-2xl" style={{ fontFamily: ctx.head }} />}
      {(c.body || ctx.edit) && <p {...kit.txtItem(c.body, (v) => set(i, { body: v }))} className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70" />}
      <ColButton kit={kit} c={c} i={i} set={set} />
     </div>
    ))}
   </div>
  </section>
 );
}

// ── claims ──────────────────────────────────────────────────────────────────────────────────────
// No photos: each column is a short promise set in display type over one line of explanation.
// The service-promise band ("Authenticated · Shipped in 24h · One of one") every good store runs.
function ColumnsClaims({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { cols, set } = useCols(kit);
 if (!cols.length) return emptyHint(ctx, "Columns — add your promises");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-8 @lg:py-14 @xl:py-20" style={{ borderTop: `1px solid ${ctx.fg}14`, borderBottom: `1px solid ${ctx.fg}14` }}>
   <Heading kit={kit} className="mb-10 text-center text-[11px] uppercase tracking-[0.24em] opacity-50" />
   <div className={`grid grid-cols-1 gap-8 @sm:grid-cols-2 @lg:gap-12 ${gridFor(p.cols)}`}>
    {cols.slice(0, 8).map((c, i) => (
     <div key={i} className="flex flex-col items-center text-center">
      {(c.heading || ctx.edit) && <h3 {...kit.txtItem(c.heading, (v) => set(i, { heading: v }))} className="text-lg uppercase tracking-[0.12em] @xl:text-xl" style={{ fontFamily: ctx.head }} />}
      {(c.body || ctx.edit) && <p {...kit.txtItem(c.body, (v) => set(i, { body: v }))} className="mt-2.5 max-w-[26ch] whitespace-pre-wrap text-[13px] leading-relaxed opacity-65" />}
     </div>
    ))}
   </div>
  </section>
 );
}

// ── steps ───────────────────────────────────────────────────────────────────────────────────────
// Numbered, in sequence, with a hairline running between them — for anything that happens in an
// order: how consignment works, how to sell, what happens after you buy. The number comes from
// position, so reordering a step renumbers it automatically.
function ColumnsSteps({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { cols, set } = useCols(kit);
 if (!cols.length) return emptyHint(ctx, "Columns — add your steps");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24">
   <Heading kit={kit} className="mb-12 text-center text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className={`grid grid-cols-1 gap-10 @sm:grid-cols-2 ${gridFor(p.cols)}`}>
    {cols.slice(0, 8).map((c, i) => (
     <div key={i} className="relative flex flex-col">
      <div className="mb-4 flex items-center gap-3">
       <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-medium" style={{ background: ctx.colors.accent, color: "#fff" }}>{i + 1}</span>
       <span className="h-px flex-1" style={{ background: `${ctx.fg}1f` }} />
      </div>
      {(c.heading || ctx.edit) && <h3 {...kit.txtItem(c.heading, (v) => set(i, { heading: v }))} className="text-lg leading-snug @xl:text-xl" style={{ fontFamily: ctx.head }} />}
      {(c.body || ctx.edit) && <p {...kit.txtItem(c.body, (v) => set(i, { body: v }))} className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70" />}
      <ColButton kit={kit} c={c} i={i} set={set} />
     </div>
    ))}
   </div>
  </section>
 );
}

// ── bordered ────────────────────────────────────────────────────────────────────────────────────
// Each column is a bordered card with real padding, sitting flush against its neighbours — a grid
// of framed panels rather than floating text. Holds together on a busy page where plain columns drift.
function ColumnsBordered({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { cols, set } = useCols(kit);
 if (!cols.length) return emptyHint(ctx, "Columns — add content");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24">
   <Heading kit={kit} className="mb-10 text-center text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className={`grid grid-cols-1 gap-0 @sm:grid-cols-2 ${gridFor(p.cols)}`} style={{ border: `1px solid ${ctx.fg}1f` }}>
    {cols.slice(0, 8).map((c, i) => (
     <div key={i} className="flex flex-col p-7 @xl:p-9" style={{ borderRight: `1px solid ${ctx.fg}14`, borderBottom: `1px solid ${ctx.fg}14` }}>
      <ImageSlot kit={kit} src={c.img} alt={c.heading} onPick={(url) => set(i, { img: url })} className="mb-5" />
      {(c.heading || ctx.edit) && <h3 {...kit.txtItem(c.heading, (v) => set(i, { heading: v }))} className="text-lg leading-snug @xl:text-xl" style={{ fontFamily: ctx.head }} />}
      {(c.body || ctx.edit) && <p {...kit.txtItem(c.body, (v) => set(i, { body: v }))} className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70" />}
      <ColButton kit={kit} c={c} i={i} set={set} />
     </div>
    ))}
   </div>
  </section>
 );
}

export function renderColumns(kit: EditKit, variant: string) {
 switch (variant) {
  case "claims": return <ColumnsClaims kit={kit} />;
  case "steps": return <ColumnsSteps kit={kit} />;
  case "bordered": return <ColumnsBordered kit={kit} />;
  default: return <ColumnsImage kit={kit} />;
 }
}
