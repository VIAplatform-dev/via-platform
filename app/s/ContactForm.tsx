"use client";

import { useState } from "react";
import { FIELD, SUBMIT } from "./formStyles";

/**
 * The store's message form. Used by the contact SECTION as-is, and by a form ELEMENT a seller drops
 * anywhere and labels for its own purpose — wholesale, stylist bookings, sourcing requests. `topic`
 * travels with the message so the seller can tell those apart in their inbox instead of receiving a
 * pile of identical "get in touch" notes.
 */
export default function ContactForm({ accent, storeSlug, topic, cta = "Send", compact = false }: { accent: string; storeSlug: string; topic?: string; cta?: string; compact?: boolean }) {
 const [name, setName] = useState("");
 const [email, setEmail] = useState("");
 const [message, setMessage] = useState("");
 const [done, setDone] = useState(false);
 const [busy, setBusy] = useState(false);

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 if (!message.trim()) return;
 setBusy(true);
 try {
 await fetch("/api/contact", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug, name, email, message }),
 });
 } catch {
 /* still acknowledge */
 }
 setDone(true);
 setBusy(false);
 }

 if (done) return <p className="mt-8 text-sm opacity-70">Thanks — your message has been sent. We’ll be in touch.</p>;

 // `currentColor` rather than black-on-white: the form inherits the storefront's ink and ground, so
 // it belongs to the page instead of looking pasted onto it. `vya-field` picks up the template's
 // corner setting, the same one the buttons and photos use.
 return (
 <form onSubmit={submit} className={compact ? "flex w-full flex-col gap-2" : "mx-auto mt-8 flex w-full max-w-md flex-col gap-3"}>
 <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={FIELD} />
 <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={FIELD} />
 {/* resize-none kills the browser's drag grip in the corner, which read as a torn-off edge. */}
 <textarea value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="Message" rows={compact ? 3 : 5} className={`${FIELD} resize-none`} />
 <button
 type="submit"
 disabled={busy}
 className="vya-cta mt-1 w-full px-8 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition hover:opacity-90 disabled:opacity-50"
 style={{ background: accent }}
 >
 {busy ? "Sending…" : cta}
 </button>
 </form>
 );
}
