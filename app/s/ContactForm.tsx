"use client";

import { useState } from "react";
import { FIELD, SUBMIT } from "./formStyles";
import { DEFAULT_CONTACT_FIELDS, answerKey, canSubmit, splitSubmission, type ContactField } from "@/app/lib/contact-fields";

/**
 * The store's message form. Used by the contact SECTION as-is, and by a form ELEMENT a seller drops
 * anywhere and labels for its own purpose — wholesale, stylist bookings, sourcing requests. `topic`
 * travels with the message so the seller can tell those apart in their inbox instead of receiving a
 * pile of identical "get in touch" notes.
 *
 * The questions come from the section (see contact-fields.ts) rather than being fixed here, so a
 * store that needs a size or a phone number can ask for one.
 */
export default function ContactForm({ accent, storeSlug, topic, cta = "Send", compact = false, fields = DEFAULT_CONTACT_FIELDS }: {
 accent: string; storeSlug: string; topic?: string; cta?: string; compact?: boolean; fields?: ContactField[];
}) {
 const [values, setValues] = useState<Record<string, string>>({});
 const [done, setDone] = useState(false);
 const [busy, setBusy] = useState(false);
 const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

 async function submit(e: React.FormEvent) {
  e.preventDefault();
  if (!canSubmit(fields, values)) return;
  setBusy(true);
  const { name, email, message } = splitSubmission(fields, values);
  try {
   await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `topic` was being dropped here, which is why every form on a site — wholesale, sourcing,
    // get-in-touch — arrived in the inbox looking identical.
    body: JSON.stringify({ storeSlug, name, email, message, itemTitle: topic || undefined }),
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
   {fields.map((f, i) => {
    const k = answerKey(i);
    const v = values[k] || "";
    // The label is the placeholder: these forms are three or four short questions, and a label
    // above every input doubles the height of the section for no extra clarity. Required fields
    // say so, because a form that silently refuses to send is the worst version of this.
    const placeholder = f.required && f.label ? `${f.label} *` : f.label;
    if (f.type === "long") {
     // resize-none kills the browser's drag grip in the corner, which read as a torn-off edge.
     return <textarea key={k} value={v} onChange={(e) => set(k, e.target.value)} required={f.required} placeholder={placeholder} rows={compact ? 3 : 5} className={`${FIELD} resize-none`} />;
    }
    if (f.type === "choice") {
     return (
      <select key={k} value={v} onChange={(e) => set(k, e.target.value)} required={f.required} className={FIELD} style={{ color: v ? undefined : "inherit" }}>
       <option value="">{placeholder}</option>
       {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
     );
    }
    return (
     <input
      key={k}
      type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
      inputMode={f.type === "phone" ? "tel" : undefined}
      value={v}
      onChange={(e) => set(k, e.target.value)}
      required={f.required}
      placeholder={placeholder}
      className={FIELD}
     />
    );
   })}
   <button type="submit" disabled={busy} className={SUBMIT} style={{ background: accent }}>
    {busy ? "Sending…" : cta}
   </button>
  </form>
 );
}
