"use client";

import { useEffect, useState } from "react";

type Props = { storeSlug: string; itemId: string; itemTitle: string; listPriceCents: number; accent: string };

// A compact "Make an offer" affordance under a product on a store's own storefront. Only shows
// if the store takes offers. Opens a negotiation the store sees in their inbox; the buyer tracks
// it at /offer/[token]. Styled to the storefront's accent, alongside "Ask about this".
export default function MakeOffer({ storeSlug, itemId, itemTitle, listPriceCents, accent }: Props) {
 const [enabled, setEnabled] = useState(false);
 const [open, setOpen] = useState(false);
 const [price, setPrice] = useState("");
 const [email, setEmail] = useState("");
 const [name, setName] = useState("");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState("");
 const [token, setToken] = useState<string | null>(null);

 useEffect(() => {
 let active = true;
 fetch(`/api/storefront/offer?slug=${encodeURIComponent(storeSlug)}`)
 .then((r) => (r.ok ? r.json() : null))
 .then((d) => { if (active && d?.offersEnabled) setEnabled(true); })
 .catch(() => {});
 return () => { active = false; };
 }, [storeSlug]);

 if (!enabled) return null;
 const list = `$${Math.round(listPriceCents / 100).toLocaleString()}`;

 async function submit(e: React.FormEvent) {
 e.preventDefault();
 const amountCents = Math.round(parseFloat(price) * 100);
 if (!amountCents || amountCents <= 0) { setErr("Enter an offer amount."); return; }
 setBusy(true); setErr("");
 try {
 const r = await fetch("/api/storefront/offer", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug, itemId, itemTitle, listPriceCents, amountCents, name, email }),
 });
 const d = await r.json().catch(() => ({}));
 if (!r.ok) { setErr(d?.error || "Couldn’t send your offer."); setBusy(false); return; }
 setToken(d.token);
 } catch { setErr("Something went wrong. Try again."); }
 setBusy(false);
 }

 if (token) {
 return <p className="mt-1.5 text-[11px] opacity-60">Offer sent. <a href={`/offer/${token}`} className="underline hover:opacity-100">track it →</a></p>;
 }
 if (!open) {
 return <button onClick={() => setOpen(true)} className="mt-1.5 text-[11px] underline opacity-50 hover:opacity-100">Make an offer</button>;
 }

 const field = "w-full border border-black/20 bg-white/70 px-2.5 py-1.5 text-[12px] outline-none focus:border-black/50";
 return (
 <form onSubmit={submit} className="mt-2 flex flex-col gap-1.5">
 <input type="number" min="1" step="1" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Your offer (asking ${list})`} className={field} />
 <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email (for the reply)" className={field} />
 <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={field} />
 <button type="submit" disabled={busy} className="self-start px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white disabled:opacity-50" style={{ background: accent }}>
 {busy ? "Sending…" : "Send offer"}
 </button>
 {err && <p className="text-[11px] text-red-600">{err}</p>}
 </form>
 );
}
