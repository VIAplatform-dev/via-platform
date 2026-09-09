"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, TH, TD, cn } from "../ui";
import { Input, Field, inputCls } from "@/app/store/ui";
import { filterCustomers, parseAudience, audienceIsEmpty, type AudienceFilter } from "@/app/lib/customer-audience-core";
import { customerFileRefusal, CUSTOMER_FILE_TYPES, CUSTOMER_FILE_TYPES_LABEL } from "@/app/lib/customer-file-core";

type Customer = {
 email: string;
 name: string | null;
 phone: string | null;
 location: string | null;
 subscribed: boolean;
 source: "imported" | "buyer" | "both";
 orders: number;
 spentCents: number;
 lastOrderAt: string | null;
 addedAt: string | null;
 tags: string[];
 notes: string | null;
 categories: string[];
};

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function CustomersPage() {
 const [customers, setCustomers] = useState<Customer[]>([]);
 const [allTags, setAllTags] = useState<string[]>([]);
 const [categories, setCategories] = useState<string[]>([]);
 const [count, setCount] = useState(0);
 const [loading, setLoading] = useState(true);
 const [q, setQ] = useState("");
 const [showImport, setShowImport] = useState(false);
 const [adding, setAdding] = useState(false);

 // Import state
 const [csv, setCsv] = useState("");
 const [fileName, setFileName] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [result, setResult] = useState<{ found: number; added: number; total: number } | null>(null);

 // Add-customer state
 const [newC, setNewC] = useState({ name: "", email: "" });
 const [savingNew, setSavingNew] = useState(false);
 const [addErr, setAddErr] = useState<string | null>(null);

 async function load() {
 try {
 const r = await fetch("/api/store/customers");
 if (r.ok) { const d = await r.json(); setCustomers(d.customers || []); setCount(d.count || 0); setAllTags((d.tags || []).map((t: { tag: string }) => t.tag)); setCategories(d.categories || []); }
 } catch {
 /* keep whatever we have */
 }
 setLoading(false);
 }
 useEffect(() => { (async () => { await load(); })(); }, []);

 // All · Buyers · Imported. A visible chip row rather than a separate page: "Buyers" used to be
 // a sidebar child that rendered this same list with one filter baked in, which is a filter, not a
 // place. /customers/buyers still resolves (it re-exports this page) and ?filter=buyers deep-links.
 type Filter = "all" | "buyers" | "imported";
 const pathname = usePathname();
 const [filter, setFilter] = useState<Filter>(pathname.endsWith("/buyers") ? "buyers" : "all");
 // Tag (any of), spent over, bought in a category — the same filter the campaign sender runs, so
 // what this page counts is what an email reaches. ?tag=a,b&spentOver=50&category=bags deep-links.
 const [audience, setAudience] = useState<AudienceFilter>({ tags: [], spentOverCents: null, category: null });
 const [spentOverText, setSpentOverText] = useState("");
 useEffect(() => {
 const sp = new URLSearchParams(window.location.search);
 const f = sp.get("filter");
 const a = parseAudience({ tag: sp.get("tag"), spentOver: sp.get("spentOver"), category: sp.get("category") });
 void Promise.resolve().then(() => {
 if (f === "buyers" || f === "imported") setFilter(f);
 if (!audienceIsEmpty(a)) { setAudience(a); if (a.spentOverCents != null) setSpentOverText(String(a.spentOverCents / 100)); }
 });
 }, []);
 // The URL is READ on arrival (links work) but not rewritten on every change: Next intercepts
 // history.replaceState as a navigation, and a router refresh per keystroke made the chips lag by
 // seconds. The "Email these" link below carries the filter across instead.
 const toggleTag = (t: string) => setAudience((a) => ({ ...a, tags: (a.tags || []).includes(t) ? (a.tags || []).filter((x) => x !== t) : [...(a.tags || []), t] }));
 const setSpentOver = (text: string) => {
 setSpentOverText(text);
 const n = Number(text);
 setAudience((a) => ({ ...a, spentOverCents: text.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null }));
 };
 const filtered = useMemo(() => {
 const s = q.trim().toLowerCase();
 let list = filter === "buyers" ? customers.filter((c) => c.orders > 0) : filter === "imported" ? customers.filter((c) => c.source !== "buyer") : customers;
 list = filterCustomers(list, audience);
 if (s) list = list.filter((c) => (c.name || "").toLowerCase().includes(s) || c.email.toLowerCase().includes(s) || (c.location || "").toLowerCase().includes(s) || (c.phone || "").includes(s) || (c.tags || []).some((t) => t.includes(s)));
 return list;
 }, [customers, q, filter, audience]);

 async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
 const f = e.target.files?.[0];
 if (!f) return;
 const text = await f.text();
 // An Excel workbook read as text is zip bytes — the parser would report "no email addresses"
 // and the seller would blame her list. Name the real problem and the way out instead.
 const refusal = customerFileRefusal({ name: f.name, text });
 if (refusal) { setErr(refusal); setFileName(null); setCsv(""); e.target.value = ""; return; }
 setErr(null);
 setFileName(f.name);
 setCsv(text);
 }

 async function importNow() {
 if (!csv.trim()) return;
 setBusy(true);
 setErr(null);
 setResult(null);
 try {
 const r = await fetch("/api/store/customers/import", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ csv, source: fileName }),
 });
 const d = await r.json();
 if (!r.ok) setErr(d.error || "Couldn’t import that list.");
 else { setResult(d); setCsv(""); setFileName(null); await load(); }
 } catch {
 setErr("Couldn’t import that list.");
 }
 setBusy(false);
 }

 async function addCustomer() {
 setSavingNew(true);
 setAddErr(null);
 try {
 const r = await fetch("/api/store/customers", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name: newC.name, email: newC.email }),
 });
 const d = await r.json();
 if (!r.ok) { setAddErr(d.error || "Couldn’t add that customer."); }
 else { setAdding(false); setNewC({ name: "", email: "" }); await load(); }
 } catch {
 setAddErr("Couldn’t add that customer.");
 }
 setSavingNew(false);
 }

 function exportCsv() {
 // Her tags and her note travel with the list — the memory is the point of the export.
 const head = "email,name,phone,location,orders,amount_spent,subscribed,source,tags,notes";
 const lines = customers.map((c) =>
 [c.email, c.name || "", c.phone || "", c.location || "", c.orders, (c.spentCents / 100).toFixed(2), c.subscribed ? "subscribed" : "unsubscribed", c.source, (c.tags || []).join(" | "), c.notes || ""].map(csvCell).join(","),
 );
 const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = "customers.csv";
 a.click();
 URL.revokeObjectURL(url);
 }

 if (loading) return <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>;

 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Store · Customers"
 title="Customers"
 subtitle={`${count.toLocaleString()} ${count === 1 ? "customer" : "customers"} · 100% of your customer base`}
 actions={
 <div className="flex items-center gap-2">
 {customers.length > 0 && <TechButton variant="ghost" onClick={exportCsv}>Export</TechButton>}
 <TechButton variant="ghost" onClick={() => setShowImport((v) => !v)}>{showImport ? "Close import" : "Import"}</TechButton>
 <TechButton onClick={() => { setAddErr(null); setAdding(true); }}>Add customer</TechButton>
 </div>
 }
 />

 {/* Import panel — toggled from the header. */}
 {showImport && (
 <TechCard className="mb-6 p-6">
 {result ? (
 <div>
 <p className="text-[15px] font-semibold text-[var(--accent-ink,#0b7a5c)]">Imported</p>
 <p className="mt-1 text-[13px] text-stone-600">
 Read <b>{result.found}</b> {result.found === 1 ? "contact" : "contacts"} · added <b>{result.added}</b> new · you now have <b>{result.total}</b> total.
 </p>
 <TechButton variant="ghost" className="mt-3 px-0" onClick={() => setResult(null)}>Upload another list</TechButton>
 </div>
 ) : (
 <>
 <p className="mb-2 text-[13px] font-medium text-stone-700">Bring your audience with you</p>
 <p className="mb-4 text-[13px] text-stone-500">Upload a CSV export from Shopify, Square, Mailchimp, or any list of emails. We skip anything that isn’t an email and never add duplicates.</p>
 <p className="mb-2 text-[12px] font-medium text-stone-600">CSV file <span className="font-normal text-stone-400">({CUSTOMER_FILE_TYPES_LABEL}). From Excel or Numbers, use File › Save as › CSV first.</span></p>
 <input type="file" accept={CUSTOMER_FILE_TYPES.join(",")} onChange={onFile} className="block w-full text-[13px] text-stone-500 file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-stone-700 hover:file:bg-stone-50" />
 <p className="my-4 text-center text-[11px] uppercase tracking-[0.16em] text-stone-300">or paste it</p>
 <textarea
 className={cn(inputCls, "h-32 py-2.5 font-mono text-xs")}
 value={csv}
 onChange={(e) => { setCsv(e.target.value); setFileName(null); }}
 placeholder={"email,first name,last name\njane@example.com,Jane,Doe\nbob@shop.co,Bob,Smith"}
 />
 <div className="mt-4 flex items-center gap-3">
 <TechButton onClick={importNow} disabled={busy || !csv.trim()}>{busy ? "Importing…" : "Import customers"}</TechButton>
 {err && <span className="text-xs text-red-600">{err}</span>}
 </div>
 </>
 )}
 </TechCard>
 )}

 {customers.length === 0 ? (
 <TechEmpty
 icon={<Users size={28} strokeWidth={1.5} />}
 title="No customers yet"
 body="Everyone who buys from you shows up here. If you already have a customer list, you can import it."
 action={<TechButton onClick={() => setShowImport(true)}>Import list</TechButton>}
 />
 ) : (
 <TechCard className="overflow-hidden">
 <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
 <div className="flex gap-1.5" role="tablist" aria-label="Customer filter">
 {([["all", "All"], ["buyers", "Buyers"], ["imported", "Imported"]] as const).map(([k, lab]) => (
 <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
 className={cn("rounded-full border px-2.5 py-1 text-[12px] transition", filter === k ? "border-transparent bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:border-stone-400")}>
 {lab}
 </button>
 ))}
 </div>
 <input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Search customers…"
 className={cn(inputCls, "h-9 min-w-[200px] flex-1 text-[13px]")}
 />
 </div>
 {(allTags.length > 0 || categories.length > 0 || customers.some((c) => c.spentCents > 0)) && (
 <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-2.5" data-testid="audience-filters">
 {allTags.length > 0 && (
 <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
 <span className="text-[11px] uppercase tracking-[0.12em] text-stone-400">Tag</span>
 {allTags.map((t) => {
 const on = (audience.tags || []).includes(t);
 return (
 <button key={t} type="button" aria-pressed={on} onClick={() => toggleTag(t)}
 className={cn("rounded-full border px-2.5 py-1 text-[12px] transition", on ? "border-transparent bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:border-stone-400")}>{t}</button>
 );
 })}
 </div>
 )}
 <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
 <span className="whitespace-nowrap">Spent over $</span>
 <input type="number" inputMode="decimal" min={0} value={spentOverText} onChange={(e) => setSpentOver(e.target.value)} placeholder="0" aria-label="Spent over" className={cn(inputCls, "h-8 w-24 text-[12.5px]")} />
 </label>
 {categories.length > 0 && (
 <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
 <span className="whitespace-nowrap">Bought in</span>
 <select value={audience.category || ""} onChange={(e) => setAudience((a) => ({ ...a, category: e.target.value || null }))} aria-label="Bought in category" className={cn(inputCls, "h-8 w-auto text-[12.5px]")}>
 <option value="">any category</option>
 {categories.map((c) => <option key={c} value={c}>{c}</option>)}
 </select>
 </label>
 )}
 {!audienceIsEmpty(audience) && (
 <>
 <span className="text-[12px] text-stone-500"><b className="text-stone-800">{filtered.length}</b> match</span>
 <button type="button" onClick={() => { setAudience({ tags: [], spentOverCents: null, category: null }); setSpentOverText(""); }} className="text-[12px] text-stone-500 underline underline-offset-2 hover:text-stone-800">Clear</button>
 <Link href={`/admin/marketing/campaigns/compose?${new URLSearchParams({ ...(audience.tags?.length ? { tag: audience.tags.join(",") } : {}), ...(audience.spentOverCents != null ? { spentOver: String(audience.spentOverCents / 100) } : {}), ...(audience.category ? { category: audience.category } : {}) }).toString()}`} className="ml-auto text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)] hover:underline">Email these {filtered.length} →</Link>
 </>
 )}
 </div>
 )}
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
  <TH className="px-3">Customer name</TH>
 <TH className="px-5">Email subscription</TH>
 <TH className="px-5">Location</TH>
 <TH right className="px-5">Orders</TH>
 <TH right className="px-5">Amount spent</TH>
 </tr>
 </thead>
 <tbody>
 {filtered.map((c) => (
 <tr key={c.email} className="transition hover:bg-stone-50/70">
  <TD className="px-3">
 <Link href={`/admin/customers/${encodeURIComponent(c.email)}`} className="group/name inline-block">
 <div className="font-medium text-stone-900 group-hover/name:underline">{c.name || c.email}</div>
 {c.name && <div className="text-[12px] text-stone-400">{c.email}</div>}
 </Link>
 {(c.tags || []).length > 0 && (
 <div className="mt-1 flex flex-wrap gap-1">
 {c.tags.map((t) => <button key={t} type="button" onClick={() => toggleTag(t)} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] text-stone-600 hover:bg-stone-200">{t}</button>)}
 </div>
 )}
 </TD>
 <TD className="px-5">
 {c.subscribed
 ? <StatusPill tone="live" dot>Subscribed</StatusPill>
 : <StatusPill tone="neutral">Not subscribed</StatusPill>}
 </TD>
 <TD className="px-5 text-stone-500">{c.location || "—"}</TD>
 <TD right className="px-5 text-stone-600">{c.orders}</TD>
 <TD right className="px-5 text-stone-900">{money(c.spentCents)}</TD>
 </tr>
 ))}
 {filtered.length === 0 && (
 <tr><td colSpan={5} className="px-5 py-10 text-center text-stone-400">{q ? `No customers match “${q}”.` : "No customers match those filters."}</td></tr>
 )}
 </tbody>
 </table>
 </div>
 </TechCard>
 )}

 <p className="mt-4 text-xs text-stone-400">Your list stays yours.</p>

 {/* Add-customer modal */}
 {adding && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setAdding(false)}>
 <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
 <h2 className="mb-4 text-base font-semibold text-stone-900">Add customer</h2>
 <div className="space-y-3">
 <Field label="Name"><Input value={newC.name} onChange={(e) => setNewC((c) => ({ ...c, name: e.target.value }))} placeholder="Jane Doe" /></Field>
 <Field label="Email"><Input type="email" value={newC.email} onChange={(e) => setNewC((c) => ({ ...c, email: e.target.value }))} placeholder="jane@example.com" /></Field>
 </div>
 {addErr && <p className="mt-3 text-xs text-red-600">{addErr}</p>}
 <div className="mt-5 flex items-center justify-end gap-2">
 <TechButton variant="ghost" onClick={() => setAdding(false)}>Cancel</TechButton>
 <TechButton disabled={savingNew || !newC.email.trim()} onClick={addCustomer}>{savingNew ? "Adding…" : "Add customer"}</TechButton>
 </div>
 </div>
 </div>
 )}
 </AdminPage>
 );
}
