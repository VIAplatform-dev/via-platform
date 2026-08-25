// Marketing sections — countdown, newsletter, contact. Each wraps a real interactive component
// (a live timer, a signup POST, a message form), so every layout here shares one rule: the working
// component renders on the LIVE site, and the editor shows an inert preview of it. That's what keeps
// clicking a button on the canvas from firing a real signup, and keeps the timer from animating
// while you're trying to edit the copy around it.
import { FreeField, emptyHint, type EditKit } from "./kit";
import NewsletterForm from "../NewsletterForm";
import ContactForm from "../ContactForm";
import Countdown from "../Countdown";

function Heading({ kit, className, value }: { kit: EditKit; className: string; value?: string }) {
 const { b, ctx, p } = kit;
 const v = value ?? p.heading;
 if (!v && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={v} className={`vya-heading ${className}`} style={{ fontFamily: ctx.head }} />;
}
function Sub({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.subtext && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className={`vya-sub ${className}`} />;
}

// ── countdown ───────────────────────────────────────────────────────────────────────────────────
function Clock({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const target = (p.date || "").trim();
 return target
  ? <Countdown target={target} accent={ctx.colors.accent} headingFontFamily={ctx.head} paused={ctx.edit} />
  : <p className="text-[11px] uppercase tracking-[0.25em] opacity-40">Set a drop date &amp; time</p>;
}
// A section with no date set renders nothing on the live storefront — an empty timer is worse than
// no section at all. In the editor it always shows, so it can be configured.
const noDate = (kit: EditKit) => !(kit.p.date || "").trim() && !kit.ctx.edit;

function CountdownCentered({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 if (noDate(kit)) return null;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-3xl px-6 py-16 @xl:py-24 text-center">
   <Heading kit={kit} className="text-2xl @xl:text-3xl leading-tight" />
   <Sub kit={kit} className="mx-auto mt-2 max-w-md text-sm opacity-65" />
   <div className="mt-10"><Clock kit={kit} /></div>
   {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={p.ctaHref || ctx.shopHref} className="vya-cta mt-10 inline-block px-9 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: ctx.colors.accent, color: "#fff" }} />}
  </section>
 );
}

// A compact strip: copy on one side, clock on the other. Sits between two sections without
// commandeering the page — for a drop that's coming, not the reason the page exists.
function CountdownStrip({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 if (noDate(kit)) return null;
 return (
  <section className="vya-free-canvas relative px-6 py-8 @xl:py-10" style={{ borderTop: `1px solid ${ctx.fg}1a`, borderBottom: `1px solid ${ctx.fg}1a` }}>
   <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-5 @lg:flex-row">
    <div className="text-center @lg:text-left">
     <Heading kit={kit} className="text-lg leading-snug @xl:text-xl" />
     <Sub kit={kit} className="mt-1 text-[13px] opacity-60" />
    </div>
    <div className="flex items-center gap-5">
     <Clock kit={kit} />
     {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={p.ctaHref || ctx.shopHref} className="vya-cta hidden shrink-0 px-7 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85 @lg:inline-block" style={{ background: ctx.colors.accent, color: "#fff" }} />}
    </div>
   </div>
  </section>
 );
}

// The clock leads at full size with the copy beneath it — maximum urgency, for the drop that IS the
// page.
function CountdownDisplay({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 if (noDate(kit)) return null;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-4xl px-6 py-20 @xl:py-28 text-center">
   <div className="mb-8 scale-110 @xl:scale-125"><Clock kit={kit} /></div>
   <Heading kit={kit} className="text-3xl leading-tight @xl:text-5xl" />
   <Sub kit={kit} className="mx-auto mt-4 max-w-lg text-sm opacity-65" />
   {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={p.ctaHref || ctx.shopHref} className="vya-cta mt-9 inline-block px-9 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: ctx.colors.accent, color: "#fff" }} />}
  </section>
 );
}

// ── newsletter ──────────────────────────────────────────────────────────────────────────────────
// The editor's inert stand-in for the signup form: a disabled field plus the real, editable button,
// so its label, colour, and shape are edited on the canvas without risking a live POST.
function FormPreview({ kit, stacked }: { kit: EditKit; stacked?: boolean }) {
 const { b, ctx, p } = kit;
 if (!ctx.edit) return <NewsletterForm accent={ctx.colors.accent} label={p.cta || "Sign up"} />;
 return (
  <div className={stacked ? "mx-auto flex max-w-sm flex-col items-center gap-3" : "flex w-full max-w-md items-center gap-2"}>
   <input disabled placeholder="Email address" className="vya-field w-full border border-current/20 bg-current/[0.03] px-4 py-2.5 text-sm opacity-60 outline-none" />
   <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta || "Sign up"} className="vya-cta inline-block whitespace-nowrap px-8 py-2.5 text-[11px] uppercase tracking-[0.18em]" style={{ background: ctx.colors.accent, color: "#fff" }} />
  </div>
 );
}

function NewsletterCentered({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 return (
  <section className="vya-free-canvas relative px-6 py-20 @xl:py-24 text-center" style={{ borderTop: `1px solid ${ctx.fg}1a` }}>
   <Heading kit={kit} className="text-3xl @xl:text-4xl leading-tight" value={p.heading || (ctx.edit ? "" : "Join the list")} />
   <Sub kit={kit} className="mt-3 mx-auto max-w-md text-sm opacity-65" />
   <div className="mt-7 flex justify-center"><FormPreview kit={kit} stacked /></div>
  </section>
 );
}

// Copy on the left, form on the right. Gives the invitation room to make an argument instead of
// relying on "Join the list" to do all the work.
function NewsletterSplit({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 return (
  <section className="vya-free-canvas relative px-6 py-16 @xl:py-24" style={{ borderTop: `1px solid ${ctx.fg}1a`, borderBottom: `1px solid ${ctx.fg}1a` }}>
   <div className="mx-auto grid max-w-5xl items-center gap-8 @lg:grid-cols-2 @lg:gap-16">
    <div>
     <Heading kit={kit} className="text-2xl leading-tight @xl:text-3xl" />
     <Sub kit={kit} className="mt-3 max-w-md text-sm opacity-65" />
    </div>
    <div className="flex @lg:justify-end"><FormPreview kit={kit} /></div>
   </div>
  </section>
 );
}

// A tight band — one line of copy and the field side by side. The least demanding version, for a
// footer or between two heavy sections.
function NewsletterBar({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 return (
  <section className="vya-free-canvas relative px-6 py-8" style={{ background: `${ctx.fg}08` }}>
   <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 @lg:flex-row">
    <Heading kit={kit} className="text-lg leading-snug @xl:text-xl" />
    <div className="flex w-full @lg:w-auto @lg:justify-end"><FormPreview kit={kit} /></div>
   </div>
  </section>
 );
}

// The invitation over a photo — the section background image (Style → Background) shows through, so
// this layout is deliberately transparent and just sets its own contrast.
function NewsletterPhoto({ kit }: { kit: EditKit }) {
 return (
  <section className="vya-free-canvas vya-fill relative flex min-h-[46vh] flex-col items-center justify-center px-6 py-24 text-center">
   <Heading kit={kit} className="text-3xl leading-tight @xl:text-5xl" />
   <Sub kit={kit} className="mx-auto mt-4 max-w-md text-sm opacity-80" />
   <div className="mt-8 flex justify-center"><FormPreview kit={kit} stacked /></div>
  </section>
 );
}

// ── contact ─────────────────────────────────────────────────────────────────────────────────────
// Same rule as the newsletter: the real form only on the live site, a disabled stand-in in the
// editor (with the button still editable).
function ContactFields({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 if (!ctx.edit && ctx.storeSlug) return <ContactForm accent={ctx.colors.accent} storeSlug={ctx.storeSlug} />;
 return (
  <div className="flex flex-col gap-2.5">
   <input disabled placeholder="Name" className="vya-field w-full border border-current/20 bg-current/[0.03] px-3 py-2.5 text-[14px] opacity-60" />
   <input disabled placeholder="Email" className="vya-field w-full border border-current/20 bg-current/[0.03] px-3 py-2.5 text-[14px] opacity-60" />
   <textarea disabled placeholder="Message" rows={4} className="vya-field w-full border border-current/20 bg-current/[0.03] px-3 py-2.5 text-[14px] opacity-60" />
   <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta || "Send"} fullWidth className="vya-cta mt-1 grid place-items-center py-2.5 text-[12px] font-medium uppercase tracking-wide" style={{ background: ctx.colors.accent, color: "#fff" }} />
  </div>
 );
}
function ContactEmail({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 if (!p.email) return null;
 return <p className="mt-6 text-center text-xs opacity-55">Or email us at <a href={`mailto:${p.email}`} style={{ color: ctx.colors.accent }}>{p.email}</a></p>;
}

function ContactCentered({ kit }: { kit: EditKit }) {
 return (
  <section className="vya-free-canvas relative mx-auto max-w-xl px-6 py-16 @xl:py-24 text-center">
   <Heading kit={kit} className="text-3xl @xl:text-4xl leading-tight" />
   <Sub kit={kit} className="mt-3 mx-auto max-w-md text-sm opacity-65" />
   <div className="mt-8 text-left"><ContactFields kit={kit} /></div>
   <ContactEmail kit={kit} />
  </section>
 );
}

// Copy and contact details on one side, the form on the other. The shape most stores actually want:
// somewhere to say opening hours or a returns note next to the box people type into.
function ContactSplit({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 return (
  <section className="mx-auto grid max-w-5xl gap-10 px-6 @xl:px-8 py-16 @xl:py-24 @lg:grid-cols-2 @lg:gap-16">
   <div className="vya-free-canvas relative">
    <Heading kit={kit} className="text-3xl leading-tight @xl:text-4xl" />
    <Sub kit={kit} className="mt-4 max-w-md text-sm leading-relaxed opacity-70" />
    {p.email && <p className="mt-6 text-[13px] opacity-70"><a href={`mailto:${p.email}`} style={{ color: ctx.colors.accent }}>{p.email}</a></p>}
   </div>
   <ContactFields kit={kit} />
  </section>
 );
}

// The form inside a bordered card on a tinted ground — a self-contained block that doesn't need the
// rest of the page to frame it.
function ContactCard({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 return (
  <section className="px-6 py-16 @xl:py-24" style={{ background: `${ctx.fg}08` }}>
   <div className="vya-free-canvas vya-round relative mx-auto max-w-lg p-8 @xl:p-10" style={{ background: ctx.colors.bg, border: `1px solid ${ctx.fg}1f` }}>
    <Heading kit={kit} className="text-2xl leading-tight @xl:text-3xl" />
    <Sub kit={kit} className="mt-2 text-sm opacity-65" />
    <div className="mt-6"><ContactFields kit={kit} /></div>
    <ContactEmail kit={kit} />
   </div>
  </section>
 );
}

export function renderCountdown(kit: EditKit, variant: string) {
 switch (variant) {
  case "strip": return <CountdownStrip kit={kit} />;
  case "display": return <CountdownDisplay kit={kit} />;
  default: return <CountdownCentered kit={kit} />;
 }
}
export function renderNewsletter(kit: EditKit, variant: string) {
 switch (variant) {
  case "split": return <NewsletterSplit kit={kit} />;
  case "bar": return <NewsletterBar kit={kit} />;
  case "photo": return <NewsletterPhoto kit={kit} />;
  default: return <NewsletterCentered kit={kit} />;
 }
}
export function renderContact(kit: EditKit, variant: string) {
 switch (variant) {
  case "split": return <ContactSplit kit={kit} />;
  case "card": return <ContactCard kit={kit} />;
  default: return <ContactCentered kit={kit} />;
 }
}
// Re-exported so Blocks.tsx can keep its "no content yet" hint consistent with the rest.
export { emptyHint };
