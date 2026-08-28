// FAQ — six arrangements of the same question-and-answer pairs.
//
// This is the section with the most machinery behind it: rows drag to reorder (within a section AND
// between two FAQ sections), rows add and remove, and on the live site each row is a native
// <details> that expands with zero JavaScript. All of that is shared here so a layout only ever
// describes an arrangement.
//
// The drag targeting hit-tests the pointer against `[data-faq-row]` and reads that row's own
// `data-faq-index` (see onGripDown in the studio), so it works in a grid or a two-column split as
// readily as in a single stack — provided every row carries those attributes. `EditRow` is the only
// thing that renders them, which is why every layout below goes through it.
import { FreeField, type EditKit } from "./kit";
import { GripVertical } from "lucide-react";

export type Pair = { q: string; a: string; i: number };

// Pairs are stored as q0/a0, q1/a1… so each is an ordinary editable field rather than one blob.
// Back-compat: an assistant-built "items" blob (a question line, its answer, blank line between).
export function readPairs(p: Record<string, string>): Pair[] {
 const pairs: Pair[] = [];
 for (let i = 0; p[`q${i}`] !== undefined; i++) pairs.push({ q: p[`q${i}`] || "", a: p[`a${i}`] || "", i });
 if (!pairs.length && p.items) {
  String(p.items).split(/\n\s*\n/).forEach((blk, i) => {
   const ls = blk.split("\n");
   const q = (ls.shift() || "").trim();
   const a = ls.join("\n").trim();
   if (q) pairs.push({ q, a, i });
  });
 }
 return pairs;
}

const Chev = () => (
 <svg className="vya-faq-chev ml-3 shrink-0 opacity-50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
);

// The editor's row: grip, editable question, editable answer, remove. Always shows the answer —
// hiding it behind a disclosure you'd have to open before typing would make editing a chore.
function EditRow({ kit, pair, children }: { kit: EditKit; pair: Pair; children?: React.ReactNode }) {
 const { b, ctx, txt, txtPlain } = kit;
 const { q, a, i } = pair;
 const dnd = ctx.faqDnd;
 return (
  <div
   data-faq-row data-faq-block={b.id} data-faq-index={i}
   className={`group/faq relative flex items-start gap-2 py-4 ${dnd?.dragBlock === b.id && dnd?.dragIndex === i ? "opacity-40" : ""}`}
   style={{ borderTop: `1px solid ${ctx.fg}1f` }}
  >
   {/* where the dragged row will land */}
   {dnd?.overBlock === b.id && dnd?.overIndex === i && <div className="pointer-events-none absolute inset-x-0 -top-px z-10 h-[2px]" style={{ background: ctx.colors.accent }} />}
   {dnd && (
    <span
     role="button" title="Drag to reorder" aria-label="Drag to reorder"
     onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); dnd.onGripDown(b.id, i, e); }}
     onClick={(e) => e.stopPropagation()}
     className="mt-0.5 grid h-7 w-6 shrink-0 cursor-grab touch-none select-none place-items-center rounded text-current opacity-30 transition hover:bg-black/5 hover:opacity-70 group-hover/faq:opacity-60 active:cursor-grabbing"
    ><GripVertical size={15} /></span>
   )}
   {children}
   <div className="min-w-0 flex-1">
    <div className="flex items-start justify-between gap-3">
     <div {...txt(q, `q${i}`)} className="vya-faq-q flex-1 text-[15px] font-medium leading-snug" />
     {ctx.onFaqOp && <button type="button" title="Remove question" onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctx.onFaqOp!(b.id, { remove: i }); }} className="shrink-0 rounded p-1 text-xs opacity-0 transition hover:bg-black/5 group-hover/faq:opacity-60">✕</button>}
    </div>
    <div {...txtPlain(a, `a${i}`)} className="vya-faq-a mt-2 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70" />
   </div>
  </div>
 );
}

// The live row: a native <details>, so it expands on click with no script.
function LiveRow({ kit, pair }: { kit: EditKit; pair: Pair }) {
 const { ctx } = kit;
 return (
  <details style={{ borderTop: `1px solid ${ctx.fg}1f` }}>
   <summary className="flex cursor-pointer items-center justify-between gap-3 py-4 text-[15px] font-medium leading-snug">
    <span>{pair.q}</span><Chev />
   </summary>
   <div className="pb-4 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70">{pair.a}</div>
  </details>
 );
}

// A question and answer both always visible — for the layouts that don't hide anything (cards,
// index). Editable in place in the editor, plain on the live site.
function OpenPair({ kit, pair, qClass = "text-[15px] font-medium leading-snug", aClass = "mt-2 text-[14px] leading-relaxed opacity-70" }: { kit: EditKit; pair: Pair; qClass?: string; aClass?: string }) {
 const { ctx, txt, txtPlain } = kit;
 if (!ctx.edit) return (
  <div>
   <p className={`vya-faq-q ${qClass}`}>{pair.q}</p>
   <p className={`vya-faq-a whitespace-pre-wrap ${aClass}`}>{pair.a}</p>
  </div>
 );
 return (
  <div>
   <div {...txt(pair.q, `q${pair.i}`)} className={`vya-faq-q ${qClass}`} />
   <div {...txtPlain(pair.a, `a${pair.i}`)} className={`vya-faq-a whitespace-pre-wrap ${aClass}`} />
  </div>
 );
}

// The drop line that sits after the last row, plus the "+ Add question" control.
function Tail({ kit, count }: { kit: EditKit; count: number }) {
 const { b, ctx } = kit;
 if (!ctx.edit) return null;
 return (
  <>
   {ctx.faqDnd?.overBlock === b.id && ctx.faqDnd?.overIndex === count && <div className="pointer-events-none h-[2px]" style={{ background: ctx.colors.accent }} />}
   {ctx.onFaqOp && <button type="button" onClick={() => ctx.onFaqOp!(b.id, "add")} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-[12px] font-medium opacity-60 transition hover:opacity-100" style={{ borderColor: `${ctx.fg}40` }}>+ Add question</button>}
  </>
 );
}

function Head({ kit, align = "text-center" }: { kit: EditKit; align?: string }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <>
   {(p.heading || ctx.edit) && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className={`vya-heading mb-3 ${align} text-3xl @xl:text-4xl leading-tight`} style={{ fontFamily: ctx.head }} />}
   {(p.subtext || ctx.edit) && <p {...txtPlain(p.subtext, "subtext")} className={`vya-sub mb-8 max-w-xl ${align} text-sm leading-relaxed opacity-65 ${align === "text-center" ? "mx-auto" : ""}`} />}
  </>
 );
}

// The rows container. `data-faq-container` is what a drag falling outside any row targets, so it
// belongs on every layout's row wrapper — that's how you drop a row at the end of the list.
function Rows({ kit, pairs, className = "" }: { kit: EditKit; pairs: Pair[]; className?: string }) {
 const { b, ctx } = kit;
 return (
  <div className={`vya-faq ${className}`} data-faq-container data-faq-block={b.id} style={{ borderBottom: `1px solid ${ctx.fg}1f` }}>
   {pairs.map((pair) => (ctx.edit ? <EditRow key={pair.i} kit={kit} pair={pair} /> : <LiveRow key={pair.i} kit={kit} pair={pair} />))}
  </div>
 );
}

// ── accordion (the layout that shipped) ─────────────────────────────────────────────────────────
function FaqAccordion({ kit }: { kit: EditKit }) {
 const pairs = readPairs(kit.p);
 return (
  <section className="vya-free-canvas relative mx-auto max-w-3xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-20">
   <Head kit={kit} />
   <Rows kit={kit} pairs={pairs} />
   <Tail kit={kit} count={pairs.length} />
  </section>
 );
}

// ── two column ──────────────────────────────────────────────────────────────────────────────────
// The same accordion split down the middle: first half left, second half right, so reading order
// still runs top-to-bottom in each column. Collapses to one column on a narrow container.
function FaqTwoColumn({ kit }: { kit: EditKit }) {
 const { b, ctx } = kit;
 const pairs = readPairs(kit.p);
 const half = Math.ceil(pairs.length / 2);
 const cols = [pairs.slice(0, half), pairs.slice(half)];
 return (
  <section className="vya-free-canvas relative mx-auto max-w-5xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-20">
   <Head kit={kit} />
   <div className="vya-faq grid gap-x-10 @lg:grid-cols-2" data-faq-container data-faq-block={b.id}>
    {cols.map((col, c) => (
     <div key={c} style={{ borderBottom: `1px solid ${ctx.fg}1f` }}>
      {col.map((pair) => (ctx.edit ? <EditRow key={pair.i} kit={kit} pair={pair} /> : <LiveRow key={pair.i} kit={kit} pair={pair} />))}
     </div>
    ))}
   </div>
   <Tail kit={kit} count={pairs.length} />
  </section>
 );
}

// ── sided ───────────────────────────────────────────────────────────────────────────────────────
// Heading and intro pinned in a left column, questions stacked on the right. Gives the intro line
// real work instead of leaving it a subtitle under a centred heading.
function FaqSided({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 const pairs = readPairs(kit.p);
 return (
  <section className="mx-auto grid max-w-6xl gap-8 px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24 @lg:grid-cols-[0.85fr_1.15fr] @lg:gap-16">
   <div className="vya-free-canvas relative">
    {(p.heading || ctx.edit) && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: ctx.head }} />}
    {(p.subtext || ctx.edit) && <p {...txtPlain(p.subtext, "subtext")} className="vya-sub mt-4 text-sm leading-relaxed opacity-65" />}
   </div>
   <div>
    <Rows kit={kit} pairs={pairs} />
    <Tail kit={kit} count={pairs.length} />
   </div>
  </section>
 );
}

// ── cards ───────────────────────────────────────────────────────────────────────────────────────
// Each pair in its own bordered panel, in a grid. Nothing is hidden here — a disclosure inside a
// card reads as a box that does nothing until you poke it — so answers are always visible. Best
// when they're short.
function FaqCards({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 const pairs = readPairs(kit.p);
 const cols = p.cols === "3" ? "@lg:grid-cols-3" : "@lg:grid-cols-2";
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-20">
   <Head kit={kit} />
   <div className={`vya-faq grid gap-3 @xl:gap-4 ${cols}`} data-faq-container data-faq-block={b.id}>
    {pairs.map((pair) => (
     <div
      key={pair.i}
      {...(ctx.edit ? { "data-faq-row": true, "data-faq-block": b.id, "data-faq-index": pair.i } : {})}
      className={`vya-round group/faq relative p-5 @xl:p-6 ${ctx.edit && ctx.faqDnd?.dragBlock === b.id && ctx.faqDnd?.dragIndex === pair.i ? "opacity-40" : ""}`}
      style={{ border: `1px solid ${ctx.fg}1f`, background: `${ctx.fg}06` }}
     >
      {ctx.edit && ctx.faqDnd?.overBlock === b.id && ctx.faqDnd?.overIndex === pair.i && <div className="pointer-events-none absolute inset-y-0 -left-1.5 z-10 w-[2px]" style={{ background: ctx.colors.accent }} />}
      {ctx.edit && ctx.faqDnd && (
       <span
        role="button" title="Drag to reorder" aria-label="Drag to reorder"
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); ctx.faqDnd!.onGripDown(b.id, pair.i, e); }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-9 top-3 grid h-6 w-5 cursor-grab touch-none select-none place-items-center rounded opacity-0 transition hover:bg-black/5 group-hover/faq:opacity-50 active:cursor-grabbing"
       ><GripVertical size={14} /></span>
      )}
      {ctx.edit && ctx.onFaqOp && <button type="button" title="Remove question" onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctx.onFaqOp!(b.id, { remove: pair.i }); }} className="absolute right-3 top-3 rounded p-1 text-xs opacity-0 transition hover:bg-black/5 group-hover/faq:opacity-60">✕</button>}
      <OpenPair kit={kit} pair={pair} />
     </div>
    ))}
   </div>
   <Tail kit={kit} count={pairs.length} />
  </section>
 );
}

// ── numbered ────────────────────────────────────────────────────────────────────────────────────
// Display numerals beside each question. The numeral comes from POSITION, so reordering renumbers
// automatically — it's a graphic element, not stored data, and nothing has to be kept in sync.
function FaqNumbered({ kit }: { kit: EditKit }) {
 const { b, ctx } = kit;
 const pairs = readPairs(kit.p);
 const num = (n: number) => String(n + 1).padStart(2, "0");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-3xl px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-20">
   <Head kit={kit} />
   <div className="vya-faq" data-faq-container data-faq-block={b.id} style={{ borderBottom: `1px solid ${ctx.fg}1f` }}>
    {pairs.map((pair, n) => {
     const marker = <span className="mt-0.5 shrink-0 text-2xl leading-none opacity-40 @xl:text-3xl" style={{ fontFamily: ctx.head, color: ctx.colors.accent, fontVariantNumeric: "tabular-nums" }}>{num(n)}</span>;
     if (ctx.edit) return <EditRow key={pair.i} kit={kit} pair={pair}>{marker}</EditRow>;
     return (
      <details key={pair.i} style={{ borderTop: `1px solid ${ctx.fg}1f` }}>
       <summary className="flex cursor-pointer items-start gap-4 py-4 text-[15px] font-medium leading-snug">
        {marker}
        <span className="flex flex-1 items-center justify-between gap-3"><span>{pair.q}</span><Chev /></span>
       </summary>
       <div className="pb-4 pl-12 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70">{pair.a}</div>
      </details>
     );
    })}
   </div>
   <Tail kit={kit} count={pairs.length} />
  </section>
 );
}

// ── index ───────────────────────────────────────────────────────────────────────────────────────
// A contents column of questions beside the answers, all open. The documentation pattern: jump links
// down one side, everything readable on the other. Earns its place past roughly fifteen questions.
//
// The anchors are real ids on the live site, scoped by block id so two FAQ sections on one page
// can't collide. In the editor they're inert text — clicking a contents entry there should not jump
// the canvas out from under you.
function FaqIndex({ kit }: { kit: EditKit }) {
 const { b, ctx } = kit;
 const pairs = readPairs(kit.p);
 const anchor = (i: number) => `faq-${b.id}-${i}`;
 return (
  <section className="mx-auto grid max-w-6xl gap-8 px-5 @xl:px-8 py-10 @lg:py-16 @xl:py-24 @lg:grid-cols-[0.7fr_1.3fr] @lg:gap-14">
   <div>
    <div className="vya-free-canvas relative"><Head kit={kit} align="text-left" /></div>
    <nav className="flex flex-col gap-2 @lg:sticky @lg:top-8" style={{ borderTop: `1px solid ${ctx.fg}1f`, paddingTop: "1rem" }}>
     {pairs.map((pair) => (ctx.edit
      ? <span key={pair.i} className="text-[13px] leading-snug opacity-60">{pair.q}</span>
      // py-2 on the LINK, not the row: an 18px-tall anchor is a miss on a phone however carefully you
      // aim. This lands it near the 44px guideline without changing how the list looks.
      : <a key={pair.i} href={`#${anchor(pair.i)}`} className="-my-2 py-2 text-[13px] leading-snug transition-opacity hover:opacity-60" style={{ color: ctx.colors.accent }}>{pair.q}</a>
     ))}
    </nav>
   </div>
   <div>
    <div className="vya-faq" data-faq-container data-faq-block={b.id}>
     {pairs.map((pair) => (ctx.edit ? (
      <EditRow key={pair.i} kit={kit} pair={pair} />
     ) : (
      <div key={pair.i} id={anchor(pair.i)} className="scroll-mt-8 py-5" style={{ borderTop: `1px solid ${ctx.fg}1f` }}>
       <OpenPair kit={kit} pair={pair} qClass="text-[17px] font-medium leading-snug" aClass="mt-2 text-[14px] leading-relaxed opacity-70" />
      </div>
     )))}
    </div>
    <Tail kit={kit} count={pairs.length} />
   </div>
  </section>
 );
}

export function renderFaq(kit: EditKit, variant: string) {
 switch (variant) {
  case "two-column": return <FaqTwoColumn kit={kit} />;
  case "sided": return <FaqSided kit={kit} />;
  case "cards": return <FaqCards kit={kit} />;
  case "numbered": return <FaqNumbered kit={kit} />;
  case "index": return <FaqIndex kit={kit} />;
  default: return <FaqAccordion kit={kit} />;
 }
}
