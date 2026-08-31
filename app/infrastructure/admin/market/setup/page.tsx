"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { B, BigButton, MarketPage, Notice, api, href, money, type MarketItem } from "../ui";
import ReadinessTasks from "../ReadinessTasks";

type Session = { id: string; name: string; status: string; createdAt: string };

function SetupInner() {
 const [session, setSession] = useState<Session | null>(null);
 const [history, setHistory] = useState<Session[]>([]);
 const [name, setName] = useState("");
 const [items, setItems] = useState<MarketItem[]>([]);
 const [bring, setBring] = useState<Set<string>>(new Set());
 const [msg, setMsg] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [confirmClose, setConfirmClose] = useState(false);
 const [confirmSeed, setConfirmSeed] = useState(false);

 const load = async () => {
 const [s, inv, b] = await Promise.all([
 api<{ session: Session }>("/api/store/market/session"),
 api<{ items: MarketItem[] }>("/api/store/market/inventory?view=available"),
 api<{ ids: string[] }>("/api/store/market/session/items"),
 ]);
 if (s.ok) { setSession(s.data.session); setName(s.data.session.name); setHistory(((s.data as unknown as { history?: Session[] }).history || []).filter((h) => h.status === "closed")); }
 if (inv.ok) setItems(inv.data.items);
 if (b.ok) setBring(new Set(b.data.ids));
 };
 useEffect(() => { (async () => { await load(); })(); }, []);

 const bringValue = useMemo(() => items.filter((i) => bring.has(i.id)).reduce((s, i) => s + i.priceCents, 0), [items, bring]);

 async function saveName() {
 if (!name.trim()) return;
 setBusy(true);
 const r = await api("/api/store/market/session", { method: "POST", body: JSON.stringify({ name }) });
 setBusy(false); setMsg(r.ok ? "Saved." : r.data.error || "Couldn't save");
 }
 async function closeMarket() {
 setConfirmClose(false);
 setBusy(true);
 const r = await api("/api/store/market/session/close", { method: "POST" });
 setBusy(false);
 if (!r.ok) { setMsg(r.data.error || "Couldn't close"); return; }
 const sid = (r.data as unknown as { sessionId?: string }).sessionId;
 if (sid) { window.location.href = href(`${B}/summary/${sid}`); return; }
 await load(); setMsg("Market closed. A fresh one opens when you sell next.");
 }

 return (
 <MarketPage title="Market setup" back={B}>
 {msg && <div className="mb-3"><Notice tone="info">{msg}</Notice></div>}
 <section className="rounded-2xl border border-stone-200 bg-white p-4">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">This market</p>
 <div className="mt-2 flex gap-2">
 <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-stone-200 px-3 text-[15px] outline-none focus:border-stone-400" placeholder="e.g. Brooklyn Flea · Sat" />
 <button onClick={saveName} disabled={busy} className="rounded-xl bg-stone-900 px-4 text-[14px] font-semibold text-white">Save</button>
 </div>
 {session && <p className="mt-2 text-[12px] text-stone-400">Open since {new Date(session.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>}
 </section>

 <ReadinessTasks />

 <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Bring list</p>
 <div className="mt-2 flex items-center gap-3">
 <span className="min-w-0 flex-1">
 <span className="block text-[14px] font-medium text-stone-900">{bring.size ? `${bring.size} items · ${money(bringValue)}` : "Bringing everything"}</span>
 <span className="block text-[12px] text-stone-500">{bring.size ? "Only these count as here at the market." : "Pick items to track what's physically with you."}</span>
 </span>
 <a href={href(`${B}/bring`)} className="shrink-0 rounded-xl bg-stone-900 px-3.5 py-2 text-[13px] font-semibold text-white">{bring.size ? "Edit" : "Choose"}</a>
 </div>
 </section>

 <div className="mt-3 grid grid-cols-2 gap-2">
 <a href={href(`${B}/bring-list`)} className="flex min-h-[48px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-[14px] font-semibold text-stone-800">Print bring list</a>
 <a href={href(`${B}/summary/${session?.id ?? ""}`)} className="flex min-h-[48px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-[14px] font-semibold text-stone-800">Today so far</a>
 </div>
 <div className="mt-6">
 {confirmClose ? (
 <div className="rounded-2xl border border-stone-200 bg-white p-4">
 <p className="text-[15px] font-semibold text-stone-900">Close this market?</p>
 <p className="mt-1 text-[13px] text-stone-500">Sales stay in your history. A new market opens next time you sell.</p>
 <div className="mt-3 grid grid-cols-2 gap-2"><BigButton onClick={closeMarket} disabled={busy}>{busy ? "Closing…" : "Close market"}</BigButton><BigButton variant="secondary" onClick={() => setConfirmClose(false)}>Keep it open</BigButton></div>
 </div>
 ) : <BigButton variant="secondary" onClick={() => setConfirmClose(true)} disabled={busy}>Close this market</BigButton>}
 </div>
 {history.length > 0 && (
 <section className="mt-6">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Past markets</p>
 <div className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
 {history.map((h) => <a key={h.id} href={href(`${B}/summary/${h.id}`)} className="flex items-center justify-between px-4 py-3 text-[14px]"><span className="text-stone-900">{h.name}</span><span className="text-[12px] text-stone-400">{new Date(h.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} ›</span></a>)}
 </div>
 </section>
 )}

 {/* Owner-only test helpers (the endpoint refuses anyone else, so showing the button is harmless). */}
 <div className="mt-8 rounded-2xl border border-dashed border-stone-300 p-4">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Testing (owner only)</p>
 <div className="mt-2 grid grid-cols-2 gap-2">
 <button onClick={async () => { setBusy(true); const r = await api<{ count: number }>("/api/store/market/seed-test-items", { method: "POST" }); setBusy(false); setMsg(r.ok ? `Added ${r.data.count} test items.` : r.data.error || "Failed"); await load(); }} disabled={busy} className="min-h-[44px] rounded-xl border border-stone-200 bg-white text-[13px] font-medium">Add 12 test items</button>
 <button onClick={async () => { if (!confirmSeed) { setConfirmSeed(true); return; } setConfirmSeed(false); setBusy(true); const r = await api<{ deleted: number }>("/api/store/market/seed-test-items", { method: "DELETE" }); setBusy(false); setMsg(r.ok ? `Deleted ${r.data.deleted} test items.` : r.data.error || "Failed"); await load(); }} disabled={busy} className={`min-h-[44px] rounded-xl border text-[13px] font-medium ${confirmSeed ? "border-transparent bg-red-700 text-white" : "border-stone-200 bg-white text-red-700"}`}>{confirmSeed ? "Tap again to delete" : "Remove test items"}</button>
 </div>
 </div>
 </MarketPage>
 );
}

export default function SetupPage() {
 return <Suspense fallback={null}><SetupInner /></Suspense>;
}
