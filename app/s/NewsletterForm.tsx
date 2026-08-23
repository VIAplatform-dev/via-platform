"use client";

import { useState } from "react";

export default function NewsletterForm({ accent, label }: { accent: string; label?: string }) {
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
 body: JSON.stringify({ email }),
 });
 } catch {
 /* still show thanks */
 }
 setDone(true);
 setBusy(false);
 }

 if (done) return <p className="mt-6 text-sm opacity-70">Thanks — you’re on the list.</p>;

 return (
 <form onSubmit={submit} className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3">
 <input
 type="email"
 required
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder="Email address"
 className="w-full border border-black/20 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-black/50"
 />
 <button
 type="submit"
 disabled={busy}
 className="px-8 py-2.5 text-[11px] uppercase tracking-[0.18em] text-white transition hover:opacity-90 disabled:opacity-50"
 style={{ background: accent }}
 >
 {busy ? "…" : (label || "Sign up")}
 </button>
 </form>
 );
}
