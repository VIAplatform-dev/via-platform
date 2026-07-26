"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TechEmpty, StatusPill, TH, TD, cn } from "../ui";
import { Input, Field, inputCls } from "@/app/store/ui";

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
};

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function CustomersPage() {
 const [customers, setCustomers] = useState<Customer[]>([]);
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
 if (r.ok) { const d = await r.json(); setCustomers(d.customers || []); setCount(d.count || 0); }
 } catch {
 /* keep whatever we have */
 }
 setLoading(false);
 }
 useEffect(() => { (async () => { await load(); })(); }, []);

 const buyersOnly = usePathname().endsWith("/buyers");
 const filtered = useMemo(() => {
 const s = q.trim().toLowerCase();
 let list = buyersOnly ? customers.filter((c) => c.orders > 0) : customers;
 if (s) list = list.filter((c) => (c.name || "").toLowerCase().includes(s) || c.email.toLowerCase().includes(s) || (c.location || "").toLowerCase().includes(s) || (c.phone || "").includes(s));
 return list;
 }, [customers, q, buyersOnly]);

 async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
 const f = e.target.files?.[0];
 if (!f) return;
 setFileName(f.name);
 setCsv(await f.text());
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
 const head = "email,name,phone,location,orders,amount_spent,subscribed,source";
 const lines = customers.map((c) =>
 [c.email, c.name || "", c.phone || "", c.location || "", c.orders, (c.spentCents / 100).toFixed(2), c.subscribed ? "subscribed" : "unsubscribed", c.source].map(csvCell).join(","),
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
 <p className="mb-4 text-[13px] text-stone-500">Upload a list from any platform — Shopify, Square, Mailchimp, or plain emails. We read any format, skip non-emails, and never add duplicates.</p>
 <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="block w-full text-[13px] text-stone-500 file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-stone-700 hover:file:bg-stone-50" />
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
 body="As people buy from you they’ll appear here. Already have a list? Import it to bring your audience with you."
 action={<TechButton onClick={() => setShowImport(true)}>Import list</TechButton>}
 />
 ) : (
 <TechCard className="overflow-hidden">
 <div className="border-b border-stone-100 px-4 py-3">
 <input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Search customers…"
 className={cn(inputCls, "h-9 text-[13px]")}
 />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead>
 <tr>
 <TH className="px-4 w-9"><input type="checkbox" disabled className="h-3.5 w-3.5 accent-[var(--accent,#0e9f76)]" aria-label="Select all" /></TH>
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
 <TD className="px-4"><input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent,#0e9f76)]" aria-label={`Select ${c.email}`} /></TD>
 <TD className="px-3">
 <Link href={`/infrastructure/admin/customers/${encodeURIComponent(c.email)}`} className="group/name inline-block">
 <div className="font-medium text-stone-900 group-hover/name:underline">{c.name || c.email}</div>
 {c.name && <div className="text-[12px] text-stone-400">{c.email}</div>}
 </Link>
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
 <tr><td colSpan={6} className="px-5 py-10 text-center text-stone-400">No customers match “{q}”.</td></tr>
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
