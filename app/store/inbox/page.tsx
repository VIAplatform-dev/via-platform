"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Settings2, Tag, Send } from "lucide-react";
import { PageHeader, EmptyState, cn } from "../ui";

type Conv = {
 id: number;
 buyerName: string | null;
 buyerEmail: string | null;
 itemTitle: string | null;
 lastMessage: string | null;
 storeUnread: number;
 lastMessageAt: string;
};
type Msg = { id: number; sender: "buyer" | "store"; body: string; createdAt: string };
type Offer = {
 id: number; itemTitle: string | null; buyerName: string | null; buyerEmail: string | null;
 listPriceCents: number; amountCents: number;
 status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
 lastActor: "buyer" | "store"; binding: boolean;
};
type Settings = { messagingEnabled: boolean; offersEnabled: boolean; offersBinding: boolean; minOfferPct: number; notifyPhone: string | null; notifySms: boolean };

// Accent is theme-scoped: green inside /infrastructure/admin (via --accent), wine on the seller
// /store portal (the fallback). --accent-soft is the matching tint for hover/active surfaces.
const ACCENT = "var(--accent,#5D0F17)";
const SOFT = "var(--accent-soft,rgba(93,15,23,0.07))";
const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

function initials(name: string | null, email: string | null): string {
 const s = (name || email || "?").trim();
 const parts = s.split(/[\s@.]+/).filter(Boolean);
 if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
 return s.slice(0, 2).toUpperCase();
}
function timeAgo(iso: string): string {
 const ms = Date.now() - new Date(iso).getTime();
 const m = Math.floor(ms / 60000);
 if (m < 1) return "now";
 if (m < 60) return `${m}m`;
 const h = Math.floor(m / 60);
 if (h < 24) return `${h}h`;
 const d = Math.floor(h / 24);
 if (d < 7) return `${d}d`;
 return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Avatar({ name, email, className }: { name: string | null; email: string | null; className?: string }) {
 return (
 <div className={cn("flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", className || "h-9 w-9")}
 style={{ background: SOFT, color: ACCENT }}>
 {initials(name, email)}
 </div>
 );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
 accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
 declined: { label: "Declined", cls: "bg-stone-100 text-stone-500 ring-stone-200" },
 expired: { label: "Expired", cls: "bg-stone-100 text-stone-400 ring-stone-200" },
 withdrawn: { label: "Withdrawn", cls: "bg-stone-100 text-stone-400 ring-stone-200" },
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
 return (
 <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
 className="relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none"
 style={{ background: on ? ACCENT : "#d6d3d1" }}>
 <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all", on ? "left-[22px]" : "left-0.5")} />
 </button>
 );
}

const CARD = "rounded-2xl border border-stone-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.12)]";

export default function InboxPage() {
 const [tab, setTab] = useState<"messages" | "offers">("messages");
 const [showSettings, setShowSettings] = useState(false);

 const [convs, setConvs] = useState<Conv[]>([]);
 const [active, setActive] = useState<Conv | null>(null);
 const [messages, setMessages] = useState<Msg[]>([]);
 const [body, setBody] = useState("");
 const [loading, setLoading] = useState(true);

 const [offers, setOffers] = useState<Offer[]>([]);
 const [pending, setPending] = useState(0);
 const [counterFor, setCounterFor] = useState<number | null>(null);
 const [counterVal, setCounterVal] = useState("");

 const [settings, setSettings] = useState<Settings | null>(null);
 const [saved, setSaved] = useState(false);

 useEffect(() => {
 let active = true;
 (async () => {
 const [list, off, set] = await Promise.all([
 fetch("/api/store/inbox").then((r) => (r.ok ? r.json() : null)).catch(() => null),
 fetch("/api/store/offers").then((r) => (r.ok ? r.json() : null)).catch(() => null),
 fetch("/api/store/inbox-settings").then((r) => (r.ok ? r.json() : null)).catch(() => null),
 ]);
 if (!active) return;
 if (list) setConvs(list.conversations || []);
 if (off) { setOffers(off.offers || []); setPending(off.pending || 0); }
 if (set?.settings) setSettings(set.settings);
 setLoading(false);
 })();
 return () => { active = false; };
 }, []);

 async function reloadConvs() { const r = await fetch("/api/store/inbox").then((x) => (x.ok ? x.json() : null)).catch(() => null); if (r) setConvs(r.conversations || []); }
 async function reloadOffers() { const r = await fetch("/api/store/offers").then((x) => (x.ok ? x.json() : null)).catch(() => null); if (r) { setOffers(r.offers || []); setPending(r.pending || 0); } }
 async function loadMessages(id: number) { const r = await fetch(`/api/store/inbox/${id}`); if (r.ok) setMessages((await r.json()).messages || []); }

 async function open(c: Conv) { setActive(c); setMessages([]); await loadMessages(c.id); reloadConvs(); }

 async function reply(e: React.FormEvent) {
 e.preventDefault();
 if (!body.trim() || !active) return;
 const text = body; setBody("");
 await fetch(`/api/store/inbox/${active.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => {});
 loadMessages(active.id);
 }

 async function respondOffer(id: number, action: string, amountCents?: number) {
 await fetch(`/api/store/offers/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, amountCents }) }).catch(() => {});
 setCounterFor(null); setCounterVal(""); reloadOffers();
 }

 async function saveSettings(patch: Partial<Settings>) {
 if (!settings) return;
 setSettings({ ...settings, ...patch });
 const r = await fetch("/api/store/inbox-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
 if (r?.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); reloadOffers(); }
 }

 return (
 <div className="mx-auto max-w-5xl px-6 py-10 sm:px-8">
 <PageHeader
 title="Inbox"
 subtitle="Messages and offers from your shoppers."
 actions={
 <button onClick={() => setShowSettings((s) => !s)}
 className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition"
 style={showSettings ? { borderColor: ACCENT, background: SOFT, color: ACCENT } : undefined}>
 <Settings2 size={14} className={showSettings ? "" : "text-stone-500"} /> <span className={showSettings ? "" : "text-stone-600"}>Settings</span>
 </button>
 }
 />

 {/* settings */}
 {showSettings && settings && (
 <div className={cn(CARD, "mb-6 p-5 sm:p-6")}>
 <div className="mb-2 flex items-center justify-between">
 <p className="text-[13px] font-semibold text-stone-900">Inbox &amp; offers</p>
 <span className={cn("text-[11px] font-medium text-emerald-600 transition-opacity", saved ? "opacity-100" : "opacity-0")}>Saved ✓</span>
 </div>
 <div className="divide-y divide-stone-100">
 {[
 { key: "messagingEnabled", label: "Buyer messaging", hint: "Let shoppers ask questions about your pieces." },
 { key: "offersEnabled", label: "Offers", hint: "Let shoppers make price offers on your pieces." },
 { key: "offersBinding", label: "Accepted offers are binding", hint: "On: accepting reserves the piece and the buyer checks out at the agreed price. Off: it’s a soft agreement." },
 { key: "notifySms", label: "Text me new messages", hint: "Get a text (iMessage where possible) the moment a shopper messages you, so you can reply fast." },
 ].map((row) => (
 <div key={row.key} className="flex items-start justify-between gap-6 py-3.5">
 <div><p className="text-[13px] font-medium text-stone-800">{row.label}</p><p className="mt-0.5 text-[12px] leading-relaxed text-stone-500">{row.hint}</p></div>
 <Toggle on={settings[row.key as keyof Settings] as boolean} onChange={(v) => saveSettings({ [row.key]: v } as Partial<Settings>)} />
 </div>
 ))}
 {settings.notifySms && (
 <div className="py-3.5">
 <p className="text-[13px] font-medium text-stone-800">Notify this number</p>
 <input
 defaultValue={settings.notifyPhone || ""}
 onBlur={(e) => saveSettings({ notifyPhone: e.target.value.trim() || null })}
 placeholder="(555) 123-4567"
 inputMode="tel"
 className="mt-2 w-full max-w-xs rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400"
 />
 <p className="mt-1.5 text-[12px] text-stone-500">We text from VYA’s number; reply right from your inbox.</p>
 </div>
 )}
 </div>
 </div>
 )}

 {/* tabs */}
 <div className="mb-6 flex gap-6 border-b border-stone-200">
 {([
 { key: "messages", label: "Messages", icon: MessageCircle, badge: convs.reduce((s, c) => s + (c.storeUnread > 0 ? 1 : 0), 0) },
 { key: "offers", label: "Offers", icon: Tag, badge: pending },
 ] as const).map((t) => {
 const on = tab === t.key;
 return (
 <button key={t.key} onClick={() => setTab(t.key)}
 className={cn("relative flex items-center gap-1.5 pb-2.5 text-[13.5px] font-medium transition", on ? "text-stone-900" : "text-stone-400 hover:text-stone-600")}>
 <t.icon size={15} /> {t.label}
 {t.badge > 0 && <span className="ml-0.5 inline-flex items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white" style={{ height: 18, minWidth: 18, background: ACCENT }}>{t.badge}</span>}
 {on && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: ACCENT }} />}
 </button>
 );
 })}
 </div>

 {/* ── MESSAGES ── */}
 {tab === "messages" && (
 loading ? (
 <div className={cn(CARD, "flex items-center justify-center py-20 text-[13px] text-stone-400")}>Loading…</div>
 ) : convs.length === 0 ? (
 <div className={cn(CARD, "py-14")}>
 <EmptyState icon={<MessageCircle size={26} strokeWidth={1.5} />} title="No messages yet" body="When a shopper asks about one of your pieces, the conversation lands here to read and reply." />
 </div>
 ) : (
 <div className="grid gap-5 md:grid-cols-[340px_1fr]">
 <div className={cn(CARD, "overflow-hidden")}>
 <div className="divide-y divide-stone-100">
 {convs.map((c) => {
 const on = active?.id === c.id;
 return (
 <button key={c.id} onClick={() => open(c)}
 className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition", on ? "" : "hover:bg-stone-50")}
 style={on ? { background: SOFT } : undefined}>
 <Avatar name={c.buyerName} email={c.buyerEmail} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center justify-between gap-2">
 <span className="truncate text-[13px] font-semibold text-stone-900">{c.buyerName || c.buyerEmail || "Buyer"}</span>
 <span className="shrink-0 text-[11px] text-stone-400">{timeAgo(c.lastMessageAt)}</span>
 </div>
 {c.itemTitle && <span className="mt-0.5 block truncate text-[11px] text-stone-400">{c.itemTitle}</span>}
 <div className="mt-0.5 flex items-center justify-between gap-2">
 <span className={cn("line-clamp-1 text-[12.5px]", c.storeUnread > 0 ? "font-medium text-stone-700" : "text-stone-500")}>{c.lastMessage}</span>
 {c.storeUnread > 0 && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT }} />}
 </div>
 </div>
 </button>
 );
 })}
 </div>
 </div>

 <div className={cn(CARD, "flex min-h-[440px] flex-col")}>
 {!active ? (
 <div className="flex flex-1 items-center justify-center p-8">
 <EmptyState icon={<MessageCircle size={26} strokeWidth={1.5} />} title="Select a conversation" body="Pick a shopper on the left to read and reply." />
 </div>
 ) : (
 <>
 <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-3.5">
 <Avatar name={active.buyerName} email={active.buyerEmail} className="h-8 w-8" />
 <div className="min-w-0">
 <p className="truncate text-[13px] font-semibold text-stone-900">{active.buyerName || active.buyerEmail || "Buyer"}</p>
 {active.itemTitle && <p className="truncate text-[11px] text-stone-400">Re: {active.itemTitle}</p>}
 </div>
 </div>
 <div className="flex max-h-[52vh] flex-1 flex-col gap-3 overflow-y-auto px-5 py-5">
 {messages.map((m) => (
 <div key={m.id} className={cn("flex flex-col", m.sender === "store" ? "items-end" : "items-start")}>
 <div className={cn("max-w-[78%] px-3.5 py-2 text-[13px] leading-relaxed", m.sender === "store" ? "rounded-2xl rounded-tr-sm text-white" : "rounded-2xl rounded-tl-sm bg-stone-100 text-stone-800")}
 style={m.sender === "store" ? { background: ACCENT } : undefined}>
 {m.body}
 </div>
 <span className="mt-1 px-1 text-[10px] text-stone-400">{timeAgo(m.createdAt)}</span>
 </div>
 ))}
 {!messages.length && <p className="text-[13px] text-stone-400">No messages.</p>}
 </div>
 <form onSubmit={reply} className="flex items-center gap-2 border-t border-stone-100 px-4 py-3">
 <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…"
 className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 text-[13px] outline-none transition focus:bg-white" />
 <button type="submit" disabled={!body.trim()}
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-30" style={{ background: ACCENT }} aria-label="Send">
 <Send size={16} />
 </button>
 </form>
 </>
 )}
 </div>
 </div>
 )
 )}

 {/* ── OFFERS ── */}
 {tab === "offers" && (
 offers.length === 0 ? (
 <div className={cn(CARD, "py-14")}>
 <EmptyState icon={<Tag size={26} strokeWidth={1.5} />} title="No offers yet" body="When shoppers make price offers on your pieces, they land here to accept, counter, or pass." />
 </div>
 ) : (
 <div className="space-y-3">
 {offers.map((o) => {
 const storesTurn = o.status === "pending" && o.lastActor === "buyer";
 const waiting = o.status === "pending" && o.lastActor === "store";
 const off = Math.round((1 - o.amountCents / o.listPriceCents) * 100);
 const meta = STATUS_META[o.status];
 return (
 <div key={o.id} className={cn(CARD, "p-4 sm:p-5")}>
 <div className="flex items-start gap-3">
 <Avatar name={o.buyerName} email={o.buyerEmail} />
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
 <div className="min-w-0">
 <p className="truncate text-[13px] font-semibold text-stone-900">{o.itemTitle || "Item"}</p>
 <p className="truncate text-[12px] text-stone-500">
 {o.buyerName || o.buyerEmail || "Buyer"}
 {o.binding && <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">Binding</span>}
 </p>
 </div>
 {storesTurn ? (
 <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">Your move</span>
 ) : waiting ? (
 <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200">Awaiting buyer</span>
 ) : meta ? (
 <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1", meta.cls)}>{meta.label}</span>
 ) : null}
 </div>

 <div className="mt-2.5 flex items-baseline gap-2">
 <span className="text-[22px] font-semibold tabular-nums text-stone-900">{money(o.amountCents)}</span>
 <span className="text-[12.5px] text-stone-400">vs {money(o.listPriceCents)} asking</span>
 {off > 0 && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">{off}% off</span>}
 </div>

 {storesTurn && (counterFor === o.id ? (
 <div className="mt-3.5 flex items-end gap-2 border-t border-stone-100 pt-3.5">
 <div className="flex-1">
 <label className="mb-1 block text-[11px] text-stone-500">Counter price</label>
 <input type="number" min={1} autoFocus value={counterVal} onChange={(e) => setCounterVal(e.target.value)}
 placeholder={String(Math.round(o.listPriceCents / 100))}
 className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-stone-400" />
 </div>
 <button onClick={() => respondOffer(o.id, "counter", Math.round(parseFloat(counterVal) * 100))} disabled={!counterVal}
 className="rounded-lg px-4 py-2 text-[12.5px] font-medium text-white transition disabled:opacity-30" style={{ background: ACCENT }}>Send counter</button>
 <button onClick={() => { setCounterFor(null); setCounterVal(""); }} className="px-2 py-2 text-[12px] text-stone-400 hover:text-stone-700">Cancel</button>
 </div>
 ) : (
 <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3.5">
 <button onClick={() => respondOffer(o.id, "accept")}
 className="rounded-lg px-4 py-2 text-[12.5px] font-medium text-white transition hover:opacity-90" style={{ background: ACCENT }}>Accept {money(o.amountCents)}</button>
 <button onClick={() => setCounterFor(o.id)}
 className="rounded-lg border border-stone-200 px-3.5 py-2 text-[12.5px] font-medium text-stone-700 transition hover:bg-stone-50">Counter</button>
 <button onClick={() => respondOffer(o.id, "decline")}
 className="ml-auto px-2 py-2 text-[12.5px] text-stone-400 transition hover:text-rose-600">Decline</button>
 </div>
 ))}
 {waiting && <p className="mt-3 border-t border-stone-100 pt-3 text-[12px] text-stone-400">You countered at {money(o.amountCents)} — waiting on the buyer.</p>}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )
 )}
 </div>
 );
}
