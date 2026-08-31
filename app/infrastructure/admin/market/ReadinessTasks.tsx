"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, href } from "./ui";

type Readiness = { paymentsReady: boolean; available: number; missingPhotos: number; missingPrice: number; multiVariant: number; legacyProducts: number; quickUnfinished?: number };
type IndexStatus = { withPhotos: number; indexed: number; configured: boolean };
type Check = { key: string; done: boolean; label: string; fix?: { label: string; href?: string; run?: () => Promise<void> } };

const WINE = "#5D0F17";

// "Before you sell" as a checklist: every check is a row — done ones ticked and struck through,
// open ones with the fix on the right. The seller always sees the full picture and gets the small
// satisfaction of watching it fill in.
export default function ReadinessTasks({ compact }: { compact?: boolean }) {
 const [ready, setReady] = useState<Readiness | null>(null);
 const [idx, setIdx] = useState<IndexStatus | null>(null);
 const [busy, setBusy] = useState<string | null>(null);
 const load = async () => {
 const [r, i] = await Promise.all([api<Readiness>("/api/store/market/readiness"), api<IndexStatus>("/api/store/market/index")]);
 if (r.ok) setReady(r.data);
 if (i.ok) setIdx(i.data);
 };
 useEffect(() => { (async () => { await load(); })(); }, []);
 if (!ready) return null;

 const n = (k: number, s: string) => `${k} ${s}${k === 1 ? "" : "s"}`;
 const checks: Check[] = [
 { key: "cards", done: ready.paymentsReady, label: ready.paymentsReady ? "Card payments on" : "Turn on card payments", fix: { label: "Set up", href: "/admin/payments" } },
 { key: "price", done: ready.missingPrice === 0, label: ready.missingPrice === 0 ? "Every item priced" : `Price ${n(ready.missingPrice, "item")}`, fix: { label: "Fix", href: "/admin/inventory?missing=price" } },
 { key: "photo", done: ready.missingPhotos === 0, label: ready.missingPhotos === 0 ? "Every item has a photo" : `Add photos to ${n(ready.missingPhotos, "item")}`, fix: { label: "Fix", href: "/admin/inventory?missing=photo" } },
 ];
 if ((ready.quickUnfinished ?? 0) > 0) checks.push({ key: "quick", done: false, label: `Finish ${n(ready.quickUnfinished!, "quick-listed item")} (cost, size)`, fix: { label: "Finish", href: "/admin/inventory?source=market&missing=details" } });
 if (ready.legacyProducts > 0) checks.push({ key: "legacy", done: false, label: `Convert ${n(ready.legacyProducts, "synced product")}`, fix: { label: "Convert", href: "/admin/inventory" } });
 if (idx?.configured) {
 const k = idx.withPhotos - idx.indexed;
 checks.push({ key: "index", done: k <= 0, label: k <= 0 ? "Camera search ready" : `Index ${n(k, "new photo")}`, fix: { label: busy === "index" ? "…" : "Index", run: async () => { setBusy("index"); await api("/api/store/market/index", { method: "POST" }); await load(); setBusy(null); } } });
 }
 const open = checks.filter((c) => !c.done).length;
 if (open === 0) return null; // nothing to do → the block simply isn't there

 return (
 <section className={compact ? "mt-4" : "mt-4 rounded-2xl border border-stone-200 bg-white p-4"}>
 <div className="flex items-baseline justify-between">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Before you sell</p>
 {open > 0 && <p className="text-[12px] text-stone-400">{open} left</p>}
 </div>
 <ul className="mt-1 divide-y divide-stone-100">
 {checks.map((c) => (
 <li key={c.key} className="flex min-h-[44px] items-center gap-3 py-2">
 <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] text-[12px] font-bold ${c.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white"}`}>{c.done ? "✓" : ""}</span>
 <span className={`min-w-0 flex-1 text-[14px] ${c.done ? "text-stone-400 line-through decoration-stone-300" : "text-stone-900"}`}>{c.label}</span>
 {!c.done && c.fix && (c.fix.href
 ? <Link href={href(c.fix.href)} className="shrink-0 text-[12.5px] font-semibold" style={{ color: WINE }}>{c.fix.label} ›</Link>
 : <button onClick={c.fix.run} disabled={busy !== null} className="shrink-0 text-[12.5px] font-semibold disabled:opacity-50" style={{ color: WINE }}>{c.fix.label} ›</button>)}
 </li>
 ))}
 </ul>
 </section>
 );
}
