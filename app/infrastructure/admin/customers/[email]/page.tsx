"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingBag, Tag, MessageCircle } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButtonLink, StatusPill, MetricCard, TH, TD, cn } from "../../ui";
import { inputCls } from "@/app/store/ui";
import { fmtOrderNo } from "@/app/store/orders/page";

type Profile = { email: string; name: string | null; phone: string | null; location: string | null; subscribed: boolean; source: string; orders: number; spentCents: number; lastOrderAt: string | null; addedAt: string | null; tags?: string[]; notes?: string | null };
type Order = { id: string; orderNo: number; itemTitle: string | null; amountCents: number; status: string; paidAt: string | null; createdAt: string | null };
type Offer = { id: number; itemTitle: string | null; amountCents: number; listPriceCents: number; status: string; lastActor: string; createdAt: string };
type Conv = { id: number; itemTitle: string | null; lastMessage: string | null; lastMessageAt: string; storeUnread: number };
type Data = { profile: Profile; orders: Order[]; offers: Offer[]; conversations: Conv[]; allTags?: string[] };

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const initials = (n: string) => (n || "?").trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const orderTone = (s: string): "live" | "pending" | "info" | "down" | "neutral" =>
 s === "delivered" ? "live" : s === "shipped" ? "info" : s === "refunded" ? "down" : s === "paid" ? "pending" : "neutral";
const orderLabel = (s: string) => (s === "paid" ? "needs shipping" : s);
const offerTone = (s: string): "live" | "pending" | "neutral" => (s === "accepted" ? "live" : s === "pending" ? "pending" : "neutral");

export default function CustomerDetailPage() {
 const { email } = useParams<{ email: string }>();
 const decoded = decodeURIComponent(email);
 const [data, setData] = useState<Data | null>(null);
 const [loading, setLoading] = useState(true);
 // Her memory of this person: a private note (saved when she clicks away) and tags (saved on change).
 const [notes, setNotes] = useState("");
 const [tags, setTags] = useState<string[]>([]);
 const [newTag, setNewTag] = useState("");
 const [saved, setSaved] = useState<null | "saving" | "saved" | "error">(null);
 const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 async function saveMemory(patch: { notes?: string; tags?: string[] }) {
 setSaved("saving");
 const r = await fetch("/api/store/customers/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: decoded, ...patch }) }).catch(() => null);
 setSaved(r?.ok ? "saved" : "error");
 if (savedTimer.current) clearTimeout(savedTimer.current);
 savedTimer.current = setTimeout(() => setSaved(null), 1800);
 }
 function addTag(raw: string) {
 const t = raw.trim().toLowerCase();
 if (!t || tags.includes(t)) { setNewTag(""); return; }
 const next = [...tags, t];
 setTags(next); setNewTag("");
 void saveMemory({ tags: next });
 }
 function removeTag(t: string) {
 const next = tags.filter((x) => x !== t);
 setTags(next);
 void saveMemory({ tags: next });
 }

 useEffect(() => {
 let active = true;
 fetch(`/api/store/customers/profile?email=${encodeURIComponent(decoded)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (active && d?.ok) { setData(d); setNotes(d.profile?.notes || ""); setTags(Array.isArray(d.profile?.tags) ? d.profile.tags : []); } }).catch(() => {}).finally(() => { if (active) setLoading(false); });
 return () => { active = false; };
 }, [decoded]);

 if (loading) return <AdminPage><div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div></AdminPage>;
 if (!data) return <AdminPage><div className="flex items-center justify-center py-32 text-sm text-stone-500">Couldn’t load this customer.</div></AdminPage>;

 const { profile: p, orders, offers, conversations } = data;
 const name = p.name || decoded;

 return (
 <AdminPage>
 <Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Customers</Link>
 <AdminHeader
 eyebrow="Store · Customers"
 title={
 <span className="flex items-center gap-3">
 <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft,#eafaf3)] text-[13px] font-semibold text-[var(--accent-ink,#0b7a5c)]">{initials(name)}</span>
 {name}
 </span>
 }
 subtitle={[decoded, p.phone, p.location].filter(Boolean).join(" · ")}
 actions={<StatusPill tone={p.subscribed ? "live" : "neutral"} dot={p.subscribed}>{p.subscribed ? "Subscribed" : "Not subscribed"}</StatusPill>}
 />

 <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
 <MetricCard label="Orders" value={orders.length} sub={p.lastOrderAt ? `Last ${date(p.lastOrderAt)}` : "None yet"} />
 <MetricCard label="Total spent" value={money(p.spentCents)} sub="Lifetime" />
 <MetricCard label="Offers" value={offers.length} sub={offers.filter((o) => o.status === "pending").length ? `${offers.filter((o) => o.status === "pending").length} open` : "None open"} />
 <MetricCard label="Conversations" value={conversations.length} sub={conversations.reduce((s, c) => s + c.storeUnread, 0) ? "Unread replies" : "All read"} />
 </div>

 {/* Notes + tags — what she knows about this person, in her words. */}
 <TechCard className="mb-5 p-5" data-testid="customer-memory">
 <div className="grid gap-4 sm:grid-cols-2">
 <div>
 <div className="mb-1.5 flex items-center justify-between">
 <label htmlFor="customer-notes" className="text-[12px] font-medium text-stone-700">Notes</label>
 <span className="text-[11px] text-stone-400">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : saved === "error" ? "Couldn’t save" : "Private — saves when you click away"}</span>
 </div>
 <textarea id="customer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== (data.profile.notes || "")) void saveMemory({ notes }); }} rows={4}
 placeholder="Size 8, loves 70s prints, asked about a Chloé bag…" className={cn(inputCls, "h-auto py-2.5 text-[13px]")} />
 </div>
 <div>
 <label className="mb-1.5 block text-[12px] font-medium text-stone-700">Tags</label>
 <div className="flex flex-wrap items-center gap-1.5" data-testid="customer-tags">
 {tags.map((t) => (
 <span key={t} className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-2.5 py-1 text-[12px] text-white">
 {t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)} className="ml-0.5 text-white/70 hover:text-white">×</button>
 </span>
 ))}
 <input value={newTag} onChange={(e) => setNewTag(e.target.value)} list="all-tags" placeholder={tags.length ? "Add a tag…" : "vip, wholesale, market:brick-lane…"}
 onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(newTag); } if (e.key === "Backspace" && !newTag && tags.length) removeTag(tags[tags.length - 1]); }}
 onBlur={() => { if (newTag.trim()) addTag(newTag); }}
 className="min-w-[140px] flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-stone-400" />
 <datalist id="all-tags">{(data.allTags || []).filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
 </div>
 {(data.allTags || []).filter((t) => !tags.includes(t)).length > 0 && (
 <div className="mt-2 flex flex-wrap gap-1">
 {(data.allTags || []).filter((t) => !tags.includes(t)).slice(0, 8).map((t) => (
 <button key={t} type="button" onClick={() => addTag(t)} className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] text-stone-500 transition hover:border-stone-400 hover:text-stone-800">+ {t}</button>
 ))}
 </div>
 )}
 </div>
 </div>
 </TechCard>

 {/* Orders */}
 <TechCard className="mb-5 overflow-hidden">
 <div className="border-b border-stone-100 px-5 py-4"><h3 className="text-[13px] font-semibold text-stone-900">Orders</h3></div>
 {orders.length === 0 ? (
 <div className="px-5 py-8 text-center text-[13px] text-stone-400">No orders from this customer yet.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead><tr><TH className="px-5">Order</TH><TH className="px-4">Item</TH><TH right className="px-4">Amount</TH><TH className="px-4">Status</TH><TH right className="px-5">Date</TH></tr></thead>
 <tbody>
 {orders.map((o) => (
 <tr key={o.id} className="cursor-pointer transition hover:bg-stone-50/70" onClick={() => { window.location.href = `/admin/orders/${o.id}`; }}>
 <TD className="px-5 font-mono text-[12px] tabular-nums text-stone-500">{fmtOrderNo(o.orderNo)}</TD>
 <TD className="px-4 font-medium text-stone-800">{o.itemTitle || "Item"}</TD>
 <TD right className="px-4 text-stone-700">{money(o.amountCents)}</TD>
 <TD className="px-4"><StatusPill tone={orderTone(o.status)} dot={o.status === "delivered"}>{orderLabel(o.status)}</StatusPill></TD>
 <TD right className="px-5 text-stone-500">{date(o.paidAt || o.createdAt)}</TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </TechCard>

 {/* Offers */}
 <TechCard className="mb-5 overflow-hidden">
 <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
 <h3 className="text-[13px] font-semibold text-stone-900">Offers sent</h3>
 <TechButtonLink variant="secondary" href="/admin/inbox" className="px-3 py-1 text-[12px]"><Tag size={12} /> Inbox</TechButtonLink>
 </div>
 {offers.length === 0 ? (
 <div className="px-5 py-8 text-center text-[13px] text-stone-400">No offers from this customer.</div>
 ) : (
 <div className="divide-y divide-stone-100">
 {offers.map((o) => {
 const off = o.listPriceCents ? Math.round((1 - o.amountCents / o.listPriceCents) * 100) : 0;
 return (
 <div key={o.id} className="flex items-center gap-3 px-5 py-3">
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] font-medium text-stone-800">{o.itemTitle || "Item"}</p>
 <p className="text-[12px] text-stone-400"><span className="tabular-nums text-stone-600">{money(o.amountCents)}</span> vs {money(o.listPriceCents)} asking{off > 0 ? ` · ${off}% off` : ""}</p>
 </div>
 <StatusPill tone={offerTone(o.status)} dot={o.status === "accepted"}>{o.status === "pending" && o.lastActor === "buyer" ? "Your move" : o.status}</StatusPill>
 </div>
 );
 })}
 </div>
 )}
 </TechCard>

 {/* Messages */}
 <TechCard className="overflow-hidden">
 <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
 <h3 className="text-[13px] font-semibold text-stone-900">Messages</h3>
 <TechButtonLink variant="secondary" href="/admin/inbox" className="px-3 py-1 text-[12px]"><MessageCircle size={12} /> Open inbox</TechButtonLink>
 </div>
 {conversations.length === 0 ? (
 <div className="px-5 py-8 text-center text-[13px] text-stone-400">No messages from this customer.</div>
 ) : (
 <div className="divide-y divide-stone-100">
 {conversations.map((c) => (
 <Link key={c.id} href="/admin/inbox" className="flex items-center gap-3 px-5 py-3 transition hover:bg-stone-50/70">
 <div className="min-w-0 flex-1">
 {c.itemTitle && <p className="truncate text-[12px] text-stone-400">Re: {c.itemTitle}</p>}
 <p className="truncate text-[13px] text-stone-700">{c.lastMessage || "—"}</p>
 </div>
 {c.storeUnread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent,#0e9f76)]" />}
 <span className="shrink-0 text-[11px] text-stone-400">{date(c.lastMessageAt)}</span>
 </Link>
 ))}
 </div>
 )}
 </TechCard>
 </AdminPage>
 );
}
