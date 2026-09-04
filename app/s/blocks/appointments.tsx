// Appointments — booking a time with the shop.
//
// Not a rental section. A store that only sells still takes fittings, sourcing chats and
// collections, so this sits in its own category and never asks whether the store rents anything.
//
// Everything here goes through the SAME hooks as every other section — `vya-cta` on the button,
// `vya-round` on the chips, FreeField on the copy — so a seller styles it with the controls they
// already know. A section that needs its own bespoke settings panel is a section that will drift.
//
// In the editor the times are a disabled sketch: the real ones come from the store's opening hours
// and change by the minute, and a preview that fetched would make the canvas jump while a seller is
// arranging the page.
import { FreeField, type EditKit } from "./kit";
import AppointmentBooker from "../AppointmentBooker";
import BookingEmbedFrame from "../BookingEmbedFrame";
import { bookingEmbed } from "@/app/lib/appointments/embed-core";

function Heading({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.heading && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className={`vya-heading ${className}`} style={{ fontFamily: ctx.head }} />;
}
function Sub({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.subtext && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="subtext" tag="p" value={p.subtext} className={`vya-sub ${className}`} />;
}

/** The button. A FreeField so its words are edited on the canvas, `vya-cta` so its look follows the
 *  section's button controls — colour, hover, corner style — like every other section's button. */
function Cta({ kit }: { kit: EditKit }) {
 const { b, ctx, p } = kit;
 if (!p.cta && !ctx.edit) return null;
 return (
  <FreeField
   b={b} ctx={ctx} fieldKey="cta" tag="span" value={p.cta || "Book it"}
   className="vya-cta block w-full px-8 py-3.5 text-center text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85"
   style={{ background: ctx.colors.accent, color: "#fff" }}
  />
 );
}

/** A sketch of the picker, for the canvas. Same classes as the live one, so what a seller styles
 *  here is what a shopper gets. */
function Sketch({ kit }: { kit: EditKit }) {
 const chip = "vya-round border border-current/20 px-4 py-2.5 text-center text-[12px]";
 return (
  <div className="flex flex-col gap-3">
   <div className="flex gap-2">
    {["Thu 11", "Fri 12", "Sat 13"].map((d) => <span key={d} className={chip}>{d}</span>)}
   </div>
   <div className="flex flex-wrap gap-2">
    {["11:00", "11:45", "12:30", "14:00"].map((t) => <span key={t} className={`${chip} tabular-nums`}>{t}</span>)}
   </div>
   <Cta kit={kit} />
  </div>
 );
}

function Booker({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 // A shop already running Calendly, Cal.com or Google's appointment schedules shouldn't have to
 // move its diary here. Where the provider can be framed we show the real calendar in place —
 // every hand-off to another website loses people — and otherwise fall back to a button.
 const link = p.bookingUrl?.trim();
 if (link) {
  const embed = bookingEmbed(link);
  if (embed) {
   return <BookingEmbedFrame embed={embed} url={link} accent={ctx.colors.accent} cta={p.cta || "Book it"} inert={ctx.edit} />;
  }
  return (
   <a
    href={ctx.edit ? undefined : link}
    target="_blank" rel="noreferrer"
    onClick={ctx.edit ? (e) => e.preventDefault() : undefined}
    className="vya-cta block w-full px-8 py-3.5 text-center text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85"
    style={{ background: ctx.colors.accent, color: "#fff" }}
   >{p.cta || "Book it"}</a>
  );
 }
 // Show the store's REAL setup, in the editor as well as live. A canvas that always drew a stock
 // picker meant a seller could paste their Calendly, come back, and see no sign of it — with
 // nothing to tell them whether it had worked.
 if (ctx.storeSlug || ctx.edit) {
  return (
   <div style={ctx.edit ? { pointerEvents: "none" } : undefined}>
    <AppointmentBooker accent={ctx.colors.accent} storeSlug={ctx.storeSlug} cta={p.cta || "Book it"} />
   </div>
  );
 }
 return <Sketch kit={kit} />;
}

function Centered({ kit }: { kit: EditKit }) {
 return (
  <section className="vya-free-canvas relative mx-auto max-w-xl px-6 py-10 text-center @lg:py-16 @xl:py-24">
   <Heading kit={kit} className="text-2xl leading-tight @xl:text-3xl" />
   <Sub kit={kit} className="mx-auto mt-3 max-w-[46ch] text-sm leading-relaxed opacity-70" />
   <div className="mt-9 text-left"><Booker kit={kit} /></div>
  </section>
 );
}

function Split({ kit }: { kit: EditKit }) {
 return (
  <section className="vya-free-canvas relative mx-auto grid max-w-5xl gap-10 px-6 py-10 @lg:py-16 @xl:grid-cols-2 @xl:items-start @xl:gap-16 @xl:py-24">
   <div>
    <Heading kit={kit} className="text-2xl leading-tight @xl:text-3xl" />
    <Sub kit={kit} className="mt-3 max-w-[42ch] text-sm leading-relaxed opacity-70" />
   </div>
   <div><Booker kit={kit} /></div>
  </section>
 );
}

function Card({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-2xl px-6 py-10 @lg:py-16 @xl:py-24">
   <div className="vya-round p-8 @xl:p-10" style={{ background: ctx.colors.bg, border: `1px solid ${ctx.fg}1f` }}>
    <Heading kit={kit} className="text-xl leading-tight @xl:text-2xl" />
    <Sub kit={kit} className="mt-3 max-w-[46ch] text-sm leading-relaxed opacity-70" />
    <div className="mt-7"><Booker kit={kit} /></div>
   </div>
  </section>
 );
}

export function renderAppointments(kit: EditKit, variant: string) {
 switch (variant) {
  case "split": return <Split kit={kit} />;
  case "card": return <Card kit={kit} />;
  default: return <Centered kit={kit} />;
 }
}
