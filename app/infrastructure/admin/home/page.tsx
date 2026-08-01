"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlusCircle, Package, ShoppingBag, Megaphone, BarChart3, Store, Sparkles, ArrowUp, ArrowUpRight, ArrowLeft, SquarePen, MessageCircle, Check } from "lucide-react";
import { RichText, TypingDots } from "@/app/store/chatRender";
import { SectionLabel, TechCard, BarChart, SegmentedControl, StatusPill, TH, TD } from "../ui";

type Overview = {
 revenueCents: number; orders: number; inventory: { active: number }; customers: number;
 productViews: number; favorites: number;
};
type Item = { id: string; title: string; priceCents: number; status: string; images?: string[]; createdAt?: string };
type Order = { id: string; itemId?: string | null; itemTitle?: string | null; amountCents?: number; feeCents?: number | null; shippingPaidCents?: number | null; costCents?: number | null; buyerEmail?: string | null; status: string; paidAt?: string | null; createdAt?: string | null };
type Offer = { id: string; buyerName?: string; amountCents: number; itemTitle?: string; title?: string; listPriceCents?: number; status?: string };
type InboxMsg = { id: string; buyerName?: string; name?: string; body?: string; text?: string; unread?: boolean; itemTitle?: string };
type Msg = { role: "user" | "assistant"; content: string };

// Representative aggregate data — sales-by-channel and demand need cross-marketplace aggregation
// we don't collect yet. Shapes are deck-final; swap for real feeds when wired.
const PERIODS: Record<string, number> = { Today: 1, "7d": 7, "30d": 30, "90d": 90 };

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const B = "/admin";

const ACTIONS = [
 { href: `${B}/add-listing`, icon: PlusCircle, title: "Add a listing", body: "Snap a photo — AI drafts the title, price, and description." },
 { href: `${B}/inventory`, icon: Package, title: "Inventory", body: "Manage your one-of-one pieces and drops." },
 { href: `${B}/orders`, icon: ShoppingBag, title: "Orders", body: "Fulfill sales and print shipping labels." },
 { href: `${B}/marketing/campaigns`, icon: Megaphone, title: "Marketing", body: "Campaigns, discounts, automations, and your sender." },
 { href: `${B}/storefront`, icon: Store, title: "Storefront", body: "Design your shop and bring your existing site over." },
 { href: `${B}/dashboard`, icon: BarChart3, title: "Analytics", body: "Revenue, best sellers, and what shoppers love." },
];

export default function WorkspaceHome() {
 const [name, setName] = useState("");
 const [ov, setOv] = useState<Overview | null>(null);
 const [items, setItems] = useState<Item[]>([]);
 const [orders, setOrders] = useState<Order[]>([]);
 const [pendingOffers, setPendingOffers] = useState(0);
 const [offersList, setOffersList] = useState<Offer[]>([]);
 const [inboxMsgs, setInboxMsgs] = useState<InboxMsg[]>([]);
 const [demand, setDemand] = useState<{ name: string; trend: string; index: number }[]>([]);
 const [period, setPeriod] = useState("30d");
 const [nowMs] = useState(() => Date.now()); // stable "now" (set once) — keeps date math pure in render

 // In-page chat state — asking from the home bar turns the page into a conversation.
 const [chatMode, setChatMode] = useState(false);
 const [msgs, setMsgs] = useState<Msg[]>([]);
 const [chatInput, setChatInput] = useState("");
 const [busy, setBusy] = useState(false);
 const msgsRef = useRef<Msg[]>([]);
 const busyRef = useRef(false);
 const scroller = useRef<HTMLDivElement>(null);

 useEffect(() => {
 fetch("/api/store/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setName(d.storeName || "")).catch(() => {});
 fetch("/api/store/items").then((r) => (r.ok ? r.json() : null)).then((d) => d?.items && setItems(d.items)).catch(() => {});
 fetch("/api/store/orders").then((r) => (r.ok ? r.json() : null)).then((d) => d?.orders && setOrders(d.orders)).catch(() => {});
 fetch("/api/store/offers").then((r) => (r.ok ? r.json() : null)).then((d) => {
 if (!d) return;
 const pend: Offer[] = Array.isArray(d.pending) ? d.pending : (Array.isArray(d.offers) ? d.offers.filter((o: Offer) => (o.status || "pending") === "pending") : []);
 setOffersList(pend);
 setPendingOffers(pend.length || (Number(d.pending) || 0));
 }).catch(() => {});
 fetch("/api/store/messages").then((r) => (r.ok ? r.json() : null)).then((d) => { const m = d?.messages || d?.threads || d; if (Array.isArray(m)) setInboxMsgs(m); }).catch(() => {});
 fetch("/api/store/market-insights").then((r) => (r.ok ? r.json() : null)).then((d) => {
 if (Array.isArray(d?.trending) && d.trending.length) setDemand(d.trending.slice(0, 6).map((t: { segmentValue: string; demandTrend: string; demandIndex: number }) => ({ name: t.segmentValue, trend: t.demandTrend, index: t.demandIndex })));
 }).catch(() => {});
 // Load any saved conversation so the chat (and its memory) continues where it left off.
 fetch("/api/store/assistant").then((r) => (r.ok ? r.json() : null)).then((d) => {
 if (d && Array.isArray(d.messages) && d.messages.length) { msgsRef.current = d.messages; setMsgs(d.messages); }
 }).catch(() => {});
 }, []);

 // Overview re-fetches when the period filter changes.
 useEffect(() => {
 fetch(`/api/store/analytics/overview?days=${PERIODS[period] || 30}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setOv(d)).catch(() => {});
 }, [period]);

 useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy, chatMode]);

 // Hide the floating Sidekick launcher while the full-page home chat is open — one "Ask VYA" at a time.
 useEffect(() => {
 window.dispatchEvent(new CustomEvent("vya:home-chat", { detail: chatMode }));
 return () => { window.dispatchEvent(new CustomEvent("vya:home-chat", { detail: false })); };
 }, [chatMode]);

 async function send(text: string) {
 const t = text.trim();
 if (!t || busyRef.current) return;
 const next = [...msgsRef.current, { role: "user" as const, content: t }];
 msgsRef.current = next; setMsgs(next); setChatInput(""); busyRef.current = true; setBusy(true);
 try {
 const r = await fetch("/api/store/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, page: "Home" }) });
 const d = await r.json();
 const reply = !r.ok ? (d.error || "Something went wrong.") : (d.reply || "(done)");
 const after = [...msgsRef.current, { role: "assistant" as const, content: reply }];
 msgsRef.current = after; setMsgs(after);
 if (r.ok && (d.actions || []).some((a: { name: string; ok: boolean }) => a.ok)) window.dispatchEvent(new Event("vya:store-updated"));
 } catch {
 const after = [...msgsRef.current, { role: "assistant" as const, content: "Couldn’t reach me just now — try again." }];
 msgsRef.current = after; setMsgs(after);
 }
 busyRef.current = false; setBusy(false);
 }

 async function newChat() {
 msgsRef.current = []; setMsgs([]); setChatInput("");
 await fetch("/api/store/assistant", { method: "DELETE" }).catch(() => {});
 }

 // Respond to an offer straight from the notifications feed (optimistic — drop it from the list).
 async function respondOffer(id: string, action: "accept" | "decline") {
 setOffersList((prev) => prev.filter((o) => o.id !== id));
 setPendingOffers((n) => Math.max(0, n - 1));
 await fetch(`/api/store/offers/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => {});
 }

 // ── Chat takes over the whole home surface ──
 if (chatMode) {
 return (
 <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-[100dvh]">
 <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
 <button onClick={() => setChatMode(false)} className="flex items-center gap-1.5 text-[13px] text-stone-500 transition hover:text-stone-900">
 <ArrowLeft size={16} /> Dashboard
 </button>
 <div className="flex items-center gap-2">
 <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent,#5D0F17)] to-[var(--accent-hover,#4a0c12)] text-white">
 <Sparkles size={14} />
 <span className="vya-status-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
 </span>
 <div className="leading-tight">
 <div className="text-[13px] font-semibold text-stone-900">VYA</div>
 <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-stone-400">AI Assistant · Online</div>
 </div>
 </div>
 <button onClick={newChat} title="New chat" className="flex items-center gap-1.5 text-[13px] text-stone-500 transition hover:text-stone-900">
 <SquarePen size={15} /> New
 </button>
 </div>

 <div ref={scroller} className="flex-1 overflow-y-auto bg-white">
 <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
 {msgs.map((m, i) => (
 m.role === "user" ? (
 <div key={i} className="vya-msg-in flex justify-end">
 <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--accent,#5D0F17)] px-4 py-2.5 text-[14px] leading-relaxed text-white">{m.content}</div>
 </div>
 ) : (
 <div key={i} className="vya-msg-in flex gap-3">
 <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent,#5D0F17)] to-[var(--accent-hover,#4a0c12)] text-white"><Sparkles size={13} /></span>
 <div className="min-w-0 flex-1 pt-0.5 text-[14px] leading-relaxed text-stone-800"><RichText text={m.content} /></div>
 </div>
 )
 ))}
 {busy && (
 <div className="vya-msg-in flex gap-3">
 <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent,#5D0F17)] to-[var(--accent-hover,#4a0c12)] text-white"><Sparkles size={13} /></span>
 <div className="pt-2"><TypingDots /></div>
 </div>
 )}
 </div>
 </div>

 <div className="border-t border-stone-200 bg-white px-4 py-3 sm:px-6">
 <form
 onSubmit={(e) => { e.preventDefault(); send(chatInput); }}
 className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 transition focus-within:border-[var(--accent,#5D0F17)]/40 focus-within:bg-white"
 >
 <textarea
 value={chatInput}
 onChange={(e) => setChatInput(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(chatInput); } }}
 placeholder="Ask VYA anything, or tell it to do something…"
 rows={1}
 className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm text-stone-800 outline-none placeholder:text-stone-400"
 />
 <button type="submit" disabled={busy || !chatInput.trim()} aria-label="Send" className="shrink-0 rounded-full bg-[var(--accent,#5D0F17)] p-1.5 text-white transition hover:bg-[var(--accent,#5D0F17)]/90 disabled:opacity-40">
 <ArrowUp size={15} />
 </button>
 </form>
 <p className="mx-auto mt-1.5 max-w-3xl text-center text-[10px] text-stone-400">VYA remembers your chats and confirms before changing anything.</p>
 </div>
 </div>
 );
 }

 const serif = { fontFamily: "var(--font-display)" } as React.CSSProperties;
 const orderAmt = (o: Order) => o.amountCents ?? 0;
 const statusTone = (s: string): "live" | "pending" | "neutral" | "down" => s === "paid" || s === "shipped" || s === "delivered" ? "live" : s === "refunded" ? "down" : "pending";
 const listTone = (s: string): "live" | "pending" | "neutral" => s === "active" ? "live" : s === "sold" ? "neutral" : "pending";
 const recentItems = items.slice(0, 5);
 const recentOrders = orders.slice(0, 5);
 const initials = (n?: string) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
 const notifCount = offersList.length + inboxMsgs.filter((m) => m.unread).length;

 const hour = new Date(nowMs).getHours();
 const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
 const dateStr = new Date(nowMs).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
 const toShip = orders.filter((o) => o.status === "paid").length;
 const drafts = items.filter((i) => i.status === "draft").length;
 const active = ov?.inventory.active ?? 0;
 // Real money math from the order list (all paid orders), filtered to the selected period by paidAt.
 const periodMs = (PERIODS[period] || 30) * 86400000;
 const isPaid = (o: Order) => o.status === "paid" || o.status === "shipped" || o.status === "delivered";
 const orderMs = (o: Order) => new Date(o.paidAt || o.createdAt || 0).getTime();
 const paidOrders = orders.filter(isPaid);
 const inPeriod = paidOrders.filter((o) => nowMs - orderMs(o) <= periodMs);
 const prevPeriod = paidOrders.filter((o) => { const d = nowMs - orderMs(o); return d > periodMs && d <= periodMs * 2; });

 const revC = inPeriod.reduce((s, o) => s + (o.amountCents || 0), 0);
 const prevRevC = prevPeriod.reduce((s, o) => s + (o.amountCents || 0), 0);
 const feesC = inPeriod.reduce((s, o) => s + (o.feeCents || 0), 0); // VYA commission + shipping margin
 const cogsC = inPeriod.reduce((s, o) => s + (o.costCents || 0), 0); // what the seller paid (real, if set)
 const cardC = inPeriod.reduce((s, o) => s + Math.round((o.amountCents || 0) * 0.029) + 30, 0); // Stripe est.
 const profitC = Math.max(0, revC - feesC - cogsC - cardC);
 const margin = revC ? Math.round((profitC / revC) * 100) : 0;
 const ordersCount = inPeriod.length;
 const aov = ordersCount ? money(Math.round(revC / ordersCount)) : "—";
 const revDelta = prevRevC > 0 ? Math.round(((revC - prevRevC) / prevRevC) * 100) : null;

 // Revenue chart — buckets tied to the selected period, so it re-shapes on Today/7d/30d/90d.
 //   Today → 6×4h · 7d → 7 daily · 30d → 15×2-day · 90d → 13 weekly. Real, from paid orders by paidAt.
 const DAY = 86400000;
 const revCfg = period === "90d" ? { n: 13, w: 7 * DAY, fmt: (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) }
 : period === "30d" ? { n: 15, w: 2 * DAY, fmt: (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) }
 // Today & 7d both read as a daily mini-trend (a lone "today" bar looks empty; hourly looks noisy).
 : { n: 7, w: DAY, fmt: (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" }) };
 const revBars = (() => {
 const bars: { label: string; value: number }[] = [];
 for (let i = revCfg.n - 1; i >= 0; i--) {
 const end = nowMs - i * revCfg.w;
 const start = end - revCfg.w;
 const value = paidOrders.filter((o) => { const t = orderMs(o); return t > start && t <= end; }).reduce((s, o) => s + (o.amountCents || 0), 0) / 100;
 bars.push({ label: revCfg.fmt(new Date(start + revCfg.w / 2)), value });
 }
 return bars;
 })();
 const chartLabel = period === "90d" ? "Weekly" : period === "30d" ? "By 2 days" : period === "7d" ? "Daily" : "Last 7 days";

 // Action-first: what a store owner needs to act on the moment they land. Live counts from real data.
 const attention = [
 { label: "Orders to ship", count: toShip, href: `${B}/orders`, urgent: toShip > 0 },
 { label: "Offers to review", count: pendingOffers, href: `${B}/inbox`, urgent: pendingOffers > 0 },
 { label: "Drafts to publish", count: drafts, href: `${B}/inventory/drafts`, urgent: false },
 { label: "Live listings", count: active, href: `${B}/inventory`, urgent: false, good: true },
 ];

 return (
 <div className="mx-auto max-w-6xl px-6 py-9 sm:px-10">
 {/* Header + command bar */}
 <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
 <div>
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">{dateStr} · Owner workspace</p>
 <h1 className="mt-2 text-[32px] leading-none tracking-[-0.015em] text-stone-900" style={serif}>{greeting}{name ? `, ${name}` : ""}.</h1>
 </div>
 <div className="flex items-center gap-2.5">
 <SegmentedControl options={["Today", "7d", "30d", "90d"]} value={period} onChange={setPeriod} />
 <button onClick={() => setChatMode(true)} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-[7px] text-[13px] font-medium text-stone-600 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent-ink)]">
 <Sparkles size={14} className="text-[var(--accent)]" /> Ask VYA
 </button>
 </div>
 </div>

 {/* Needs attention — action-first */}
 <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
 {attention.map((a) => (
 <Link key={a.label} href={a.href} className={`group relative overflow-hidden rounded-2xl border p-4 transition ${a.urgent ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50" : a.good ? "border-[var(--accent)]/15 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)]" : "border-stone-200 bg-white hover:border-stone-300"}`}>
 <div className="flex items-center justify-between">
 <span className={`text-[26px] font-semibold leading-none tabular-nums ${a.urgent ? "text-amber-600" : a.good ? "text-[var(--accent-ink)]" : "text-stone-900"}`}>{a.count}</span>
 <ArrowUpRight size={16} className="text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-500" />
 </div>
 <p className="mt-1.5 text-[12.5px] font-medium text-stone-500">{a.label}</p>
 </Link>
 ))}
 </div>

 {/* Revenue (monthly bars) + profit breakdown */}
 <div className="grid gap-4 lg:grid-cols-3">
 <TechCard className="p-6 lg:col-span-2">
 <div className="flex items-start justify-between">
 <div>
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-400">Revenue · {period === "Today" ? "today" : `last ${period}`}</p>
 <div className="mt-1.5 flex items-end gap-3">
 <span className="text-[44px] leading-none tracking-[-0.01em] text-stone-900" style={serif}>{money(revC)}</span>
 {revDelta !== null && <span className={`mb-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${revDelta >= 0 ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-rose-50 text-rose-500"}`}>{revDelta >= 0 ? "↑" : "↓"} {Math.abs(revDelta)}%</span>}
 </div>
 </div>
 <StatusPill tone="live" dot>Live</StatusPill>
 </div>
 <p className="mb-2 mt-6 font-mono text-[9.5px] uppercase tracking-[0.12em] text-stone-400">{chartLabel}</p>
 <BarChart data={revBars} h={150} money showValues={revBars.length <= 8} />
 </TechCard>

 <TechCard className="p-5">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-400">Net profit · {period === "Today" ? "today" : period}</p>
 <div className="mt-1.5 flex items-end gap-2">
 <span className="text-[32px] leading-none tracking-[-0.01em] text-stone-900" style={serif}>{money(profitC)}</span>
 <span className="mb-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)]">{margin}% margin</span>
 </div>
 <div className="mt-4">
 {[
 { label: "Revenue", value: money(revC), est: false },
 { label: "Cost of goods", value: `−${money(cogsC)}`, est: false },
 { label: "VYA fees", value: `−${money(feesC)}`, est: false },
 { label: "Card processing", value: `−${money(cardC)}`, est: true },
 ].map((r) => (
 <div key={r.label} className="flex items-center justify-between border-b border-stone-100 py-2 text-[12.5px]">
 <span className="text-stone-500">{r.label}{r.est && <span className="ml-1 align-top text-[8.5px] uppercase tracking-wide text-stone-300">est</span>}</span>
 <span className="font-semibold tabular-nums text-stone-700">{r.value}</span>
 </div>
 ))}
 <div className="flex items-center justify-between pt-2.5 text-[13px]">
 <span className="font-semibold text-stone-900">Net profit</span>
 <span className="font-semibold tabular-nums text-[var(--accent-ink)]">{money(profitC)}</span>
 </div>
 </div>
 </TechCard>
 </div>

 {/* Metric strip */}
 <TechCard className="mt-4 grid grid-cols-2 gap-px overflow-hidden bg-stone-100 p-0 sm:grid-cols-3 lg:grid-cols-6">
 {[
 { label: "Orders", value: ordersCount.toLocaleString() },
 { label: "Avg. order", value: aov },
 { label: "Active listings", value: active.toLocaleString() },
 { label: "Customers", value: ov ? ov.customers.toLocaleString() : "—" },
 { label: "Product views", value: ov ? ov.productViews.toLocaleString() : "—" },
 { label: "Favorites", value: ov ? ov.favorites.toLocaleString() : "—" },
 ].map((m) => (
 <div key={m.label} className="bg-white p-4">
 <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-stone-400">{m.label}</p>
 <p className="mt-1.5 text-[21px] font-semibold leading-none tracking-[-0.01em] text-stone-900 tabular-nums">{m.value}</p>
 </div>
 ))}
 </TechCard>

 {/* What to source — real demand from market insights (empty state until the market data builds) */}
 <TechCard className="mt-4 p-5">
 <div className="mb-2 flex items-center justify-between">
 <p className="text-[13px] font-semibold text-stone-900">What to source</p>
 <Link href={`${B}/trends`} className="text-[12px] text-[var(--accent-ink)] hover:underline">Trends</Link>
 </div>
 {demand.length ? (
 <div className="grid gap-x-10 sm:grid-cols-2">
 {demand.map((d) => {
 const up = /up|ris|grow|\+/i.test(d.trend || "");
 return (
 <div key={d.name} className="flex items-center justify-between border-b border-stone-100 py-2.5">
 <span className="truncate text-[13px] font-medium text-stone-700">{d.name}</span>
 <span className={`text-[12px] font-semibold tabular-nums ${up ? "text-[var(--accent-ink)]" : "text-stone-400"}`}>{up ? "▲" : "•"} {Math.round(d.index)}</span>
 </div>
 );
 })}
 </div>
 ) : (
 <p className="py-8 text-center text-[13px] text-stone-400">Demand insights build as marketplace data grows — see the Trends page for what’s heating up.</p>
 )}
 </TechCard>

 {/* Notifications — offers to respond to + buyer messages, actionable inline */}
 <TechCard className="mt-4 p-5">
 <div className="mb-1 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <p className="text-[13px] font-semibold text-stone-900">Needs a response</p>
 {notifCount > 0 && <StatusPill tone="pending" dot>{notifCount} new</StatusPill>}
 </div>
 <Link href={`${B}/inbox`} className="text-[12px] text-[var(--accent-ink)] hover:underline">Open inbox</Link>
 </div>
 {(offersList.length || inboxMsgs.length) ? (
 <div className="divide-y divide-stone-100">
 {offersList.slice(0, 3).map((o) => (
 <div key={o.id} className="flex flex-wrap items-center gap-3 py-3">
 <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-ink)]">{initials(o.buyerName)}</span>
 <div className="min-w-0 flex-1">
 <p className="text-[13px] text-stone-800"><span className="font-semibold">{o.buyerName || "A shopper"}</span> offered <span className="font-semibold tabular-nums">{money(o.amountCents)}</span> on {o.itemTitle || o.title || "your listing"}</p>
 <p className="text-[11px] text-stone-400">{o.listPriceCents ? `Listed at ${money(o.listPriceCents)}` : "Offer pending your review"}</p>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 <button onClick={() => respondOffer(o.id, "decline")} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50">Decline</button>
 <button onClick={() => respondOffer(o.id, "accept")} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[var(--accent-hover)]">Approve</button>
 </div>
 </div>
 ))}
 {inboxMsgs.filter((m) => m.unread).slice(0, 3).map((m) => (
 <div key={m.id} className="flex items-center gap-3 py-3">
 <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-400"><MessageCircle size={15} /></span>
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] text-stone-800"><span className="font-semibold">{m.buyerName || m.name || "Buyer"}</span>{m.itemTitle ? ` · ${m.itemTitle}` : ""}</p>
 <p className="truncate text-[11px] text-stone-400">{m.body || m.text || "New message"}</p>
 </div>
 <Link href={`${B}/inbox`} className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50">Reply</Link>
 </div>
 ))}
 </div>
 ) : (
 <div className="flex flex-col items-center gap-2 py-9 text-center">
 <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]"><Check size={18} /></span>
 <p className="text-[13px] font-medium text-stone-600">You’re all caught up</p>
 <p className="text-[12px] text-stone-400">New offers and buyer messages land here.</p>
 </div>
 )}
 </TechCard>

 {/* Recently listed + recent orders */}
 <div className="mt-4 grid gap-4 lg:grid-cols-2">
 <TechCard className="p-5">
 <div className="mb-1.5 flex items-center justify-between">
 <p className="text-[13px] font-semibold text-stone-900">Recently listed</p>
 <Link href={`${B}/inventory`} className="text-[12px] text-[var(--accent-ink)] hover:underline">View inventory</Link>
 </div>
 {recentItems.length ? (
 <table className="w-full">
 <thead><tr><TH>Item</TH><TH right>Price</TH><TH right>Status</TH></tr></thead>
 <tbody>
 {recentItems.map((it) => (
 <tr key={it.id}>
 <TD>
 <div className="flex items-center gap-3">
 {it.images?.[0] ? <img src={it.images[0]} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <span className="h-9 w-9 rounded-lg bg-stone-100" />}
 <span className="truncate font-medium text-stone-800">{it.title}</span>
 </div>
 </TD>
 <TD right className="font-semibold text-stone-900">{money(it.priceCents)}</TD>
 <TD right><StatusPill tone={listTone(it.status)} dot={it.status === "active"}>{it.status}</StatusPill></TD>
 </tr>
 ))}
 </tbody>
 </table>
 ) : <p className="py-10 text-center text-[13px] text-stone-400">No listings yet — snap a photo to add your first piece.</p>}
 </TechCard>

 <TechCard className="p-5">
 <div className="mb-1.5 flex items-center justify-between">
 <p className="text-[13px] font-semibold text-stone-900">Recent orders</p>
 <Link href={`${B}/orders`} className="text-[12px] text-[var(--accent-ink)] hover:underline">View all</Link>
 </div>
 {recentOrders.length ? (
 <div className="divide-y divide-stone-100">
 {recentOrders.map((o) => (
 <div key={o.id} className="flex items-center justify-between gap-3 py-[11px]">
 <div className="min-w-0">
 <p className="truncate text-[13px] font-medium text-stone-800">{o.itemTitle || "Order"}</p>
 <p className="truncate text-[11px] text-stone-400">{o.buyerEmail || "—"}</p>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 <span className="text-[13px] font-semibold tabular-nums text-stone-800">{money(orderAmt(o))}</span>
 <StatusPill tone={statusTone(o.status)} dot={o.status === "paid" || o.status === "shipped"}>{o.status}</StatusPill>
 </div>
 </div>
 ))}
 </div>
 ) : <p className="py-10 text-center text-[13px] text-stone-400">No orders yet.</p>}
 </TechCard>
 </div>

 {/* Quick jump */}
 <div className="mt-6">
 <SectionLabel className="mb-2.5">Jump to</SectionLabel>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
 {ACTIONS.map((a) => {
 const Icon = a.icon;
 return (
 <Link key={a.href} href={a.href} className="group flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 transition hover:border-[color:var(--accent)] hover:bg-[var(--accent-soft)]">
 <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft,#eafaf3)] text-[var(--accent,#5D0F17)]"><Icon size={15} strokeWidth={1.9} /></span>
 <span className="truncate text-[12.5px] font-medium text-stone-700">{a.title}</span>
 </Link>
 );
 })}
 </div>
 </div>
 </div>
 );
}
