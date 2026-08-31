/* eslint-disable @next/next/no-img-element */
// The hero family — five genuinely different compositions, one shared editing contract.
//
// Every layout here renders its text through <FreeField>, so heading/subtext/button are selectable,
// draggable, corner-scalable, and inline-editable in all five without any layout-specific wiring.
// Everything structural (padding, height, radius, border, background, overlays) is applied by the
// section wrapper in Blocks.tsx, so these files only ever describe composition.
//
// Height: any element that forces its own height carries `.vya-fill`, which is what the section's
// resize handle (style.minH) targets. A layout that invents its own height mechanism silently breaks
// dragging the section taller — this class is the contract.
import { FreeField, PhotoFrame, emptyHint, panBgImg, type EditKit } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";
import { backgroundEmbedSrc } from "@/app/lib/storefront-blocks";

// The photo / video / embedded link behind a full-bleed hero. bgMedia (an uploaded video or a pasted
// YouTube-Vimeo-Drive link) takes the still photo's place in the same frame.
function heroMedia(kit: EditKit) {
 const { b, p, ctx } = kit;
 const bm = ctx.bgMedia;
 const bmEmbed = bm?.kind === "embed" ? backgroundEmbedSrc(bm.url) : null;
 return bm?.kind === "video"
  ? <video className="absolute inset-0 h-full w-full object-cover" src={bm.url} poster={bm.poster} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
  : bmEmbed
  ? <iframe className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full max-w-none -translate-x-1/2 -translate-y-1/2 border-0" src={bmEmbed} title="Background video" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" tabIndex={-1} aria-hidden="true" />
  : p.image ? <img src={p.image} alt="" {...panBgImg(ctx, b)} className={`absolute inset-0 h-full w-full object-cover ${ctx.edit ? "cursor-grab touch-none" : ""}`} /> : null;
}

// ── bleed ───────────────────────────────────────────────────────────────────────────────────────
// The layout that shipped before variants existed. A block with no `variant` renders THIS, and its
// markup is deliberately unchanged — every storefront saved to date depends on it byte for byte.
function HeroBleed({ kit }: { kit: EditKit }) {
 const { b, ctx, p, moveGrip } = kit;
 const { colors, head, shopHref } = ctx;
 // Free-positioned content: when the seller has dragged the content group, it's absolutely placed at
 // cx/cy% of the banner (anchored by its centre). Otherwise it keeps the default bottom-centre layout.
 const free = p.cx !== undefined && p.cx !== "" && p.cy !== undefined && p.cy !== "";
 const media = heroMedia(kit);
 return media ? (
  <div className="vya-hero-frame vya-fill relative w-full overflow-hidden" style={{ minHeight: "84vh" }}>
   <PhotoFrame kit={kit} className="absolute inset-0 overflow-hidden">{media}</PhotoFrame>
   <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.6) 100%)" }} />
   <div
    className={`vya-hero-inner vya-free-canvas relative z-10 px-6 text-center text-white ${free ? "vya-hero-free" : "flex min-h-[84vh] flex-col items-center justify-end pb-8 @lg:pb-14 @lg:pb-24 pt-20 @lg:pt-36"}`}
    style={free ? { position: "absolute", left: `${p.cx}%`, top: `${p.cy}%`, transform: "translate(-50%,-50%)", width: "max-content", maxWidth: "min(88%,46rem)" } : undefined}
   >
    {moveGrip}
    <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading max-w-3xl text-[2rem] @lg:text-5xl leading-[1.04] @xl:text-7xl" style={{ fontFamily: head }} />
    {p.subtext && <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className="vya-sub mt-5 max-w-xl text-sm leading-relaxed text-white/85 @xl:text-[15px]" />}
    {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={shopHref} className="vya-cta mt-9 inline-block border border-white/70 px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:bg-white hover:text-black" />}
   </div>
  </div>
 ) : (
  <div className="vya-hero-inner vya-free-canvas relative px-6 py-16 @lg:py-32 text-center">
   <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading mx-auto max-w-3xl text-[2rem] @lg:text-5xl leading-[1.05] @xl:text-6xl" style={{ fontFamily: head }} />
   {p.subtext && <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className="vya-sub mt-5 mx-auto max-w-xl text-sm leading-relaxed opacity-65 @xl:text-[15px]" />}
   {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={shopHref} className="vya-cta mt-9 inline-block px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }} />}
  </div>
 );
}

// ── slides ──────────────────────────────────────────────────────────────────────────────────────
// A swipeable set of full-bleed slides. Deliberately CSS-only (scroll-snap): this renderer is shared
// with the live storefront's server component and must stay hook-free, and a scroll track degrades
// perfectly — it's swipeable on a phone, drag/trackpad-scrollable on desktop, and needs no JS.
//
// Per-slide copy is edited in place (click the text and type); slides themselves are added, removed,
// and reordered from the section panel. Free DRAG positioning is per-field rather than per-slide, so
// it isn't offered here — the overlay layer covers "put this anywhere" for a slideshow.
function HeroSlides({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { head, shopHref } = ctx;
 const slides = kit.items(ITEM_SCHEMAS.slides);
 if (!slides.length) return emptyHint(ctx, "Slideshow — add your first slide");
 const set = (i: number, key: string, val: string) => kit.setItems(ITEM_SCHEMAS.slides, slides.map((s, j) => (j === i ? { ...s, [key]: val } : s)));
 return (
  <div className="vya-fill vya-slides relative w-full overflow-hidden" style={{ minHeight: "84vh" }}>
   <div className="vya-slides-track flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
    {slides.map((s, i) => (
     <div key={i} className="vya-slide relative h-full w-full shrink-0 snap-start snap-always" style={{ minHeight: "84vh" }}>
      {s.image
       ? <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
       : <div className="absolute inset-0" style={{ background: `${ctx.fg}12` }} />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.6) 100%)" }} />
      <div className="relative z-10 flex h-full flex-col items-center justify-end px-6 pb-8 @lg:pb-14 @lg:pb-24 pt-20 @lg:pt-36 text-center text-white" style={{ minHeight: "84vh" }}>
       <h2 {...kit.txtItem(s.heading, (v) => set(i, "heading", v))} data-field={`slide${i}heading`} className="vya-heading max-w-3xl text-[2rem] @lg:text-5xl leading-[1.04] @xl:text-7xl" style={{ fontFamily: head }} />
       {(s.subtext || ctx.edit) && <p {...kit.txtItem(s.subtext, (v) => set(i, "subtext", v))} data-field={`slide${i}subtext`} className="vya-sub mt-5 max-w-xl text-sm leading-relaxed text-white/85 @xl:text-[15px]" />}
       {(s.cta || ctx.edit) && (
        <a
         {...kit.txtItem(s.cta, (v) => set(i, "cta", v))}
         data-field={`slide${i}cta`}
         href={ctx.edit ? undefined : shopHref}
         className="vya-cta mt-9 inline-block border border-white/70 px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:bg-white hover:text-black"
        />
       )}
      </div>
      {/* Position dots — which slide of how many. Anchors on the live site (a real, keyboard-reachable
          control); inert markers in the editor so clicking one selects the section instead of jumping. */}
      <div className="absolute inset-x-0 bottom-7 z-10 flex justify-center gap-2">
       {slides.map((_, j) => (ctx.edit
        ? <span key={j} className="h-1.5 w-1.5 rounded-full" style={{ background: j === i ? "#fff" : "rgba(255,255,255,0.45)" }} />
        // The dot stays 6px because that is the design; the TAP TARGET around it does not. A 6×6
        // hit area is unhittable with a thumb, so the link is a 28px box with the dot centred in it
        // — same look, an actual target. (Negative margin keeps the row's visual spacing unchanged.)
        : <a key={j} href={`#slide-${j}`} aria-label={`Slide ${j + 1}`} className="-m-3.5 grid h-9 w-9 place-items-center rounded-full transition"><span className="h-1.5 w-1.5 rounded-full" style={{ background: j === i ? "#fff" : "rgba(255,255,255,0.45)" }} /></a>
       ))}
      </div>
      {!ctx.edit && <span id={`slide-${i}`} className="absolute left-0 top-0" aria-hidden="true" />}
     </div>
    ))}
   </div>
   {slides.length > 1 && <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center text-[10px] uppercase tracking-[0.24em] text-white/60">{ctx.edit ? "scroll to preview each slide" : ""}</div>}
   <style dangerouslySetInnerHTML={{ __html: ".vya-slides-track{scrollbar-width:none;-ms-overflow-style:none}.vya-slides-track::-webkit-scrollbar{display:none}.vya-slides-track{scroll-behavior:smooth}@media(prefers-reduced-motion:reduce){.vya-slides-track{scroll-behavior:auto}}" }} />
  </div>
 );
}

// ── split ───────────────────────────────────────────────────────────────────────────────────────
// Photo on one side, copy on the other, at hero scale. The calmer, more editorial opening — and the
// only hero layout where the headline sits on the page's own background rather than over a photo.
function HeroSplit({ kit }: { kit: EditKit }) {
 const { b, ctx, p, moveGrip } = kit;
 const { colors, head, shopHref, fg } = ctx;
 const right = (p.imageSide || "").toLowerCase().startsWith("r");
 // The divider position is a percentage the merchant drags (style-free: it's structural, so it lives
 // in props). Clamped to keep both panels usable no matter how far the handle is dragged.
 const ratio = Math.min(75, Math.max(25, Number(p.splitRatio) || 50));
 // A split hero with no photo is half a tinted rectangle and half a squeezed column of text. When
 // there is nothing to show, the whole split collapses and the type takes the full width — the
 // panel is hidden AND the grid stops splitting, because hiding only the panel would leave the
 // headline stranded in a 50% column with nothing beside it.
 const showMedia = !!p.image || ctx.edit;
 return (
  <div
   className={`vya-fill grid w-full items-stretch ${showMedia ? "@lg:grid-cols-[var(--vya-split)]" : ""}`}
   style={showMedia ? { ["--vya-split" as string]: `${ratio}% 1fr` } : undefined}
  >
   {showMedia && (
    <PhotoFrame kit={kit} className={`relative min-h-[42vh] w-full overflow-hidden @lg:min-h-[78vh] ${right ? "@lg:order-2" : ""}`} style={{ background: `${fg}0d` }}>
     {p.image && <img src={p.image} alt="" {...panBgImg(ctx, b)} className={`absolute inset-0 h-full w-full object-cover ${ctx.edit ? "cursor-grab touch-none" : ""}`} />}
    </PhotoFrame>
   )}
   <div className="vya-hero-inner vya-free-canvas relative flex flex-col justify-center px-7 py-12 @lg:py-20 @lg:px-14 @xl:px-20">
    {moveGrip}
    <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading max-w-xl text-[1.75rem] @lg:text-4xl leading-[1.06] @xl:text-6xl" style={{ fontFamily: head }} />
    {p.subtext && <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className="vya-sub mt-5 max-w-md text-sm leading-relaxed opacity-70 @xl:text-[15px]" />}
    {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={shopHref} className="vya-cta mt-9 inline-block self-start px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }} />}
   </div>
  </div>
 );
}

// ── stack ───────────────────────────────────────────────────────────────────────────────────────
// Type leads, image supports: a centred headline and button above a wide, cropped photo. The most
// typographic of the five, and the one that survives a missing photo most gracefully.
function HeroStack({ kit }: { kit: EditKit }) {
 const { b, ctx, p, moveGrip } = kit;
 const { colors, head, shopHref, fg } = ctx;
 return (
  <div className="vya-fill flex w-full flex-col">
   <div className="vya-hero-inner vya-free-canvas relative px-6 pb-8 @lg:pb-14 pt-14 @lg:pt-24 text-center @xl:pt-32">
    {moveGrip}
    <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading mx-auto max-w-4xl text-[2rem] @lg:text-5xl leading-[1.03] @xl:text-7xl" style={{ fontFamily: head }} />
    {p.subtext && <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className="vya-sub mx-auto mt-5 max-w-xl text-sm leading-relaxed opacity-65 @xl:text-[15px]" />}
    {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={shopHref} className="vya-cta mt-8 inline-block px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }} />}
   </div>
   {/* No photo, no box. A 46vh tinted rectangle with nothing in it doesn't read as "a picture goes
       here" — it reads as a rendering fault, which is exactly how it looked on Heirloom. The editor
       still shows the empty slot, because that is where a seller clicks to add one. */}
   {(p.image || ctx.edit) && (
    <PhotoFrame kit={kit} className="relative w-full flex-1 overflow-hidden" style={{ minHeight: "46vh", background: `${fg}0d` }}>
     {p.image && <img src={p.image} alt="" {...panBgImg(ctx, b)} className={`absolute inset-0 h-full w-full object-cover ${ctx.edit ? "cursor-grab touch-none" : ""}`} />}
    </PhotoFrame>
   )}
  </div>
 );
}

// ── frame ───────────────────────────────────────────────────────────────────────────────────────
// An inset photo with generous margin, the headline sitting across its lower edge — the gallery-wall
// opening. The margin is real whitespace, so it reads as deliberate rather than as a hero that failed
// to reach the edges.
function HeroFrame({ kit }: { kit: EditKit }) {
 const { b, ctx, p, moveGrip } = kit;
 const { colors, head, shopHref, fg } = ctx;
 return (
  <div className="vya-fill relative w-full px-5 py-10 @xl:px-14 @xl:py-16">
   <PhotoFrame kit={kit} className="vya-round relative w-full overflow-hidden" style={{ minHeight: "62vh", background: `${fg}0d` }}>
    {p.image && <img src={p.image} alt="" {...panBgImg(ctx, b)} className={`absolute inset-0 h-full w-full object-cover ${ctx.edit ? "cursor-grab touch-none" : ""}`} />}
    {p.image && <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.55) 100%)" }} />}
    <div className={`vya-hero-inner vya-free-canvas relative flex flex-col items-start justify-end px-7 pb-8 @lg:pb-12 pt-40 @xl:px-12 ${p.image ? "text-white" : ""}`} style={{ minHeight: "62vh" }}>
     {moveGrip}
     <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading max-w-2xl text-[1.75rem] @lg:text-4xl leading-[1.05] @xl:text-6xl" style={{ fontFamily: head }} />
     {p.subtext && <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className={`vya-sub mt-4 max-w-md text-sm leading-relaxed @xl:text-[15px] ${p.image ? "text-white/85" : "opacity-65"}`} />}
     {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={shopHref} className={`vya-cta mt-8 inline-block px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition ${p.image ? "border border-white/70 hover:bg-white hover:text-black" : "hover:opacity-85"}`} style={p.image ? undefined : { background: colors.accent, color: "#fff" }} />}
    </div>
   </PhotoFrame>
  </div>
 );
}

export function renderHero(kit: EditKit, variant: string) {
 switch (variant) {
  case "slides": return <HeroSlides kit={kit} />;
  case "split": return <HeroSplit kit={kit} />;
  case "stack": return <HeroStack kit={kit} />;
  case "frame": return <HeroFrame kit={kit} />;
  default: return <HeroBleed kit={kit} />;
 }
}
