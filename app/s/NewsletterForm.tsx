"use client";

import { useState } from "react";
import { FIELD, SUBMIT } from "./formStyles";
import { acquisitionSource } from "@/app/lib/capturedSource";

export default function NewsletterForm({ accent, label, placeholder, thanks }: { accent: string; label?: string; placeholder?: string; thanks?: string }) {
 const [email, setEmail] = useState("");
 const [done, setDone] = useState(false);
 const [busy, setBusy] = useState(false);

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 if (!email.trim()) return;
 setBusy(true);
 try {
 await fetch("/api/newsletter", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email, source: acquisitionSource("storefront_newsletter") }),
 });
 } catch {
 /* still show thanks */
 }
 setDone(true);
 setBusy(false);
 }

 if (done) return <p className="mt-6 text-sm opacity-70">{thanks || "Thanks — you’re on the list."}</p>;

 return (
 <form onSubmit={submit} className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-3">
 <input
 type="email"
 required
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder={placeholder || "Email address"}
 // formStyles exists precisely so a form belongs to the page it sits on; this one still carried
 // the hardcoded white box that module was written to remove, so on a cream or dark template the
 // signup read as a rectangle pasted over the design.
 className={FIELD}
 />
 <button
 type="submit"
 disabled={busy}
 className={SUBMIT}
 style={{ background: accent }}
 >
 {busy ? "…" : (label || "Sign up")}
 </button>
 </form>
 );
}
