"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Msg = { sender: "buyer" | "store"; body: string; createdAt: string };
type Conv = { id: number; itemTitle: string | null; lastMessageAt: string; messages: Msg[] };

export default function MessagesPage() {
 return (
 <Suspense fallback={<main className="min-h-screen bg-[#FBF9F5]" />}>
 <Inner />
 </Suspense>
 );
}

function Inner() {
 const { handle } = useParams<{ handle: string }>();
 const sp = useSearchParams();
 const token = sp.get("t") || "";
 const [convs, setConvs] = useState<Conv[] | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [drafts, setDrafts] = useState<Record<number, string>>({});
 const storeName = (handle || "").replace(/-/g, " ");

 const load = useCallback(async () => {
 if (!token) { setErr("This link is missing its access token."); return; }
 try {
 const r = await fetch(`/api/storefront/my-messages?token=${encodeURIComponent(token)}`);
 if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || "This link has expired."); return; }
 const d = await r.json();
 setConvs(d.conversations || []);
 } catch { setErr("Couldn’t load your messages."); }
 }, [token]);

 useEffect(() => { load(); }, [load]);

 async function send(id: number) {
 const b = (drafts[id] || "").trim();
 if (!b) return;
 await fetch("/api/storefront/my-messages", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ token, conversationId: id, body: b }),
 }).catch(() => {});
 setDrafts((s) => ({ ...s, [id]: "" }));
 load();
 }

 const fmt = (s: string) => { try { return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

 return (
 <main className="min-h-screen bg-[#FBF9F5] text-[#211d19]">
 <header className="border-b border-black/[0.07] px-6 py-5">
 <div className="mx-auto max-w-2xl">
 <p className="text-[11px] uppercase tracking-[0.18em] text-black/40">Your messages with</p>
 <h1 className="mt-1 font-serif text-2xl capitalize" style={{ fontFamily: "Georgia, serif" }}>{storeName}</h1>
 </div>
 </header>

 <div className="mx-auto max-w-2xl px-6 py-8">
 {err ? (
 <p className="rounded-lg border border-dashed border-black/15 bg-white px-4 py-8 text-center text-sm text-black/50">{err}</p>
 ) : convs === null ? (
 <p className="text-center text-sm text-black/40">Loading…</p>
 ) : convs.length === 0 ? (
 <p className="rounded-lg border border-dashed border-black/15 bg-white px-4 py-8 text-center text-sm text-black/50">No messages yet.</p>
 ) : (
 <div className="space-y-5">
 {convs.map((c) => (
 <div key={c.id} className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
 {c.itemTitle && <div className="border-b border-black/[0.06] px-4 py-2.5 text-[12px] font-medium text-black/60">{c.itemTitle}</div>}
 <div className="space-y-2.5 p-4">
 {c.messages.map((m, i) => (
 <div key={i} className={`flex ${m.sender === "buyer" ? "justify-end" : "justify-start"}`}>
 <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${m.sender === "buyer" ? "bg-[#211d19] text-[#FBF9F5]" : "bg-black/[0.05] text-[#211d19]"}`}>
 <p className="whitespace-pre-wrap">{m.body}</p>
 <p className={`mt-1 text-[10px] ${m.sender === "buyer" ? "text-white/45" : "text-black/35"}`}>{fmt(m.createdAt)}</p>
 </div>
 </div>
 ))}
 </div>
 <div className="flex gap-2 border-t border-black/[0.06] p-3">
 <input
 value={drafts[c.id] || ""}
 onChange={(e) => setDrafts((s) => ({ ...s, [c.id]: e.target.value }))}
 onKeyDown={(e) => { if (e.key === "Enter") send(c.id); }}
 placeholder="Write a reply…"
 className="flex-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-black/40"
 />
 <button onClick={() => send(c.id)} disabled={!(drafts[c.id] || "").trim()} className="rounded-lg bg-[#211d19] px-4 text-[12px] uppercase tracking-[0.12em] text-[#FBF9F5] disabled:opacity-40">Send</button>
 </div>
 </div>
 ))}
 </div>
 )}
 <p className="mt-8 text-center text-[11px] text-black/30">Powered by VYA</p>
 </div>
 </main>
 );
}
