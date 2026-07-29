"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Event = { actor: "buyer" | "store"; action: string; amountCents: number | null; createdAt: string };
type Offer = {
 storeSlug: string; itemId: string | null; itemTitle: string | null;
 listPriceCents: number; amountCents: number;
 status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
 lastActor: "buyer" | "store"; binding: boolean;
};

const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

export default function OfferPage() {
 const { token } = useParams<{ token: string }>();
 const [offer, setOffer] = useState<Offer | null>(null);
 const [events, setEvents] = useState<Event[]>([]);
 const [loading, setLoading] = useState(true);
 const [counter, setCounter] = useState("");
 const [showCounter, setShowCounter] = useState(false);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState("");

 useEffect(() => {
 let active = true;
 (async () => {
 const r = await fetch(`/api/storefront/offer/${token}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (!active) return;
 if (r?.offer) { setOffer(r.offer); setEvents(r.events || []); }
 setLoading(false);
 })();
 return () => { active = false; };
 }, [token]);

 async function act(action: string, amountCents?: number) {
 setBusy(true); setErr("");
 const r = await fetch(`/api/storefront/offer/${token}`, {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action, amountCents }),
 });
 const d = await r.json().catch(() => ({}));
 setBusy(false);
 if (!r.ok) { setErr(d?.error || "Couldn’t update your offer."); return; }
 setOffer(d.offer); setEvents(d.events || []); setShowCounter(false); setCounter("");
 }

 if (loading) return <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-black/40 text-sm">Loading…</div>;
 if (!offer) return <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-black/50 text-sm">This offer link isn’t valid.</div>;

 const buyersTurn = offer.status === "pending" && offer.lastActor === "store";
 const waiting = offer.status === "pending" && offer.lastActor === "buyer";

 return (
 <div className="min-h-screen bg-[#FFFDF8] px-6 py-16">
 <div className="mx-auto max-w-md">
 <p className="text-[10px] uppercase tracking-[0.2em] text-black/40">Your offer</p>
 <h1 className="mt-1 text-2xl font-medium text-black">{offer.itemTitle || "Item"}</h1>
 <p className="mt-1 text-sm text-black/50">Asking {money(offer.listPriceCents)}</p>

 {/* state banner */}
 <div className="mt-6 border border-neutral-200 bg-white p-5">
 {offer.status === "accepted" ? (
 <>
 <p className="text-[13px] font-medium text-emerald-700">✓ Accepted at {money(offer.amountCents)}</p>
 <p className="mt-1 text-[13px] text-black/60">{offer.binding ? "Complete your purchase at the agreed price." : "The seller will honor this price."}</p>
 {offer.itemId && <a href={offer.binding ? `/checkout?item=${offer.itemId}&offer=${token}` : `/products/${offer.itemId}`} className="mt-3 inline-block bg-[#5D0F17] text-[#FFFDF8] text-[11px] uppercase tracking-[0.15em] px-6 py-3 hover:bg-[#5D0F17]/85 transition">Buy now</a>}
 </>
 ) : offer.status === "declined" ? (
 <p className="text-[13px] text-black/60">The seller passed on this offer. The piece is still available at {money(offer.listPriceCents)}.</p>
 ) : offer.status === "expired" ? (
 <p className="text-[13px] text-black/60">This offer expired. You’re welcome to make a new one.</p>
 ) : offer.status === "withdrawn" ? (
 <p className="text-[13px] text-black/60">You withdrew this offer.</p>
 ) : buyersTurn ? (
 <>
 <p className="text-[13px] font-medium text-black">The seller countered at {money(offer.amountCents)}</p>
 <p className="mt-1 text-[12px] text-black/50">Your last offer was lower — accept their price, counter back, or pass.</p>
 </>
 ) : (
 <p className="text-[13px] text-black/60">Your offer of <b>{money(offer.amountCents)}</b> is with the seller. We’ll email you the moment they respond.</p>
 )}
 </div>

 {/* buyer actions when it's their move */}
 {buyersTurn && (
 <div className="mt-4 space-y-3">
 {!showCounter ? (
 <div className="flex flex-wrap gap-2">
 <button onClick={() => act("accept")} disabled={busy} className="bg-[#5D0F17] text-[#FFFDF8] text-[11px] uppercase tracking-[0.15em] px-5 py-3 hover:bg-[#5D0F17]/85 transition disabled:opacity-50">Accept {money(offer.amountCents)}</button>
 <button onClick={() => setShowCounter(true)} disabled={busy} className="border border-neutral-300 text-black text-[11px] uppercase tracking-[0.15em] px-5 py-3 hover:border-black/50 transition disabled:opacity-50">Counter</button>
 <button onClick={() => act("decline")} disabled={busy} className="text-black/40 text-[11px] uppercase tracking-[0.15em] px-3 py-3 hover:text-black transition disabled:opacity-50">Pass</button>
 </div>
 ) : (
 <div className="flex items-end gap-2">
 <div className="flex-1">
 <label className="block text-[10px] uppercase tracking-[0.15em] text-black/50 mb-1">Your counter (under {money(offer.listPriceCents)})</label>
 <input type="number" min="1" value={counter} onChange={(e) => setCounter(e.target.value)} className="w-full border border-neutral-200 px-3 py-2.5 text-sm text-black focus:outline-none focus:border-black/40" />
 </div>
 <button onClick={() => act("counter", Math.round(parseFloat(counter) * 100))} disabled={busy || !counter} className="bg-[#5D0F17] text-[#FFFDF8] text-[11px] uppercase tracking-[0.15em] px-5 py-3 hover:bg-[#5D0F17]/85 transition disabled:opacity-50">Send</button>
 </div>
 )}
 {err && <p className="text-[11px] text-red-600">{err}</p>}
 </div>
 )}

 {waiting && (
 <button onClick={() => act("withdraw")} disabled={busy} className="mt-4 text-black/40 text-[11px] uppercase tracking-[0.15em] hover:text-black transition disabled:opacity-50">Withdraw offer</button>
 )}

 {/* the back-and-forth */}
 {events.length > 0 && (
 <div className="mt-8">
 <p className="text-[10px] uppercase tracking-[0.2em] text-black/40 mb-3">History</p>
 <div className="space-y-2">
 {events.map((e, i) => (
 <div key={i} className="flex items-center justify-between text-[12px] text-black/60">
 <span>{e.actor === "buyer" ? "You" : "Seller"} · {labelFor(e.action)}</span>
 <span className="tabular-nums">{e.amountCents != null ? money(e.amountCents) : ""}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>
 );
}

function labelFor(action: string): string {
 return { offer: "offered", counter: "countered", accept: "accepted", decline: "passed", withdraw: "withdrew" }[action] || action;
}
