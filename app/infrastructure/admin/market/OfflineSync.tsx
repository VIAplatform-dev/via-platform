"use client";

import { useEffect, useState } from "react";
import { api } from "./ui";
import { readQueue, writeQueue } from "./cart";

// Replays queued offline cash sales whenever we're online; shows a small pill while any are pending.
// Mounted inside every Market Mode page so a sale never waits for the seller to find a sync button.
export function useOfflineSync(): { pending: number; syncing: boolean; syncNow: () => Promise<void> } {
 const [pending, setPending] = useState(0);
 const [syncing, setSyncing] = useState(false);
 const syncNow = async () => {
 const q = readQueue();
 setPending(q.length);
 if (!q.length || syncing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
 setSyncing(true);
 const remaining = [];
 for (const sale of q) {
 try {
 const r = await api<{ ok: boolean }>("/api/store/market/checkout/cash-direct", { method: "POST", body: JSON.stringify({ lines: sale.lines, clientKey: sale.clientKey, tenderedCents: sale.tenderedCents }) });
 // 2xx (recorded or replayed) or a definitive 4xx (e.g. sold elsewhere) → done; network errors → keep.
 if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 429)) continue;
 remaining.push({ ...sale, error: r.data.error });
 } catch { remaining.push(sale); }
 }
 writeQueue(remaining);
 setPending(remaining.length);
 setSyncing(false);
 };
 useEffect(() => {
 const t = setTimeout(syncNow, 500);
 const on = () => { void syncNow(); };
 window.addEventListener("online", on);
 const iv = setInterval(on, 30_000);
 return () => { clearTimeout(t); window.removeEventListener("online", on); clearInterval(iv); };
 }, []); // eslint-disable-line react-hooks/exhaustive-deps
 return { pending, syncing, syncNow };
}

export default function OfflinePill() {
 const { pending, syncing, syncNow } = useOfflineSync();
 if (!pending) return null;
 return (
 <button onClick={syncNow} className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-[13px] text-amber-900">
 <span className="h-2 w-2 rounded-full bg-amber-500" />
 {syncing ? "Syncing offline sales…" : `${pending} cash sale${pending === 1 ? "" : "s"} saved offline — will sync when you're back online. Tap to retry.`}
 </button>
 );
}
