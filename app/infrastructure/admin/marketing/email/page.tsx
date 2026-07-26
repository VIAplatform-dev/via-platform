"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, TH, TD } from "../../ui";
import { Input, Field } from "@/app/store/ui";

type DnsRecord = { record?: string; name?: string; type?: string; value?: string; ttl?: string; status?: string; priority?: number };
type Settings = { fromName: string | null; replyTo: string | null; domain: string | null; sendingEmail: string | null; verified: boolean; dnsRecords: DnsRecord[] | null };
type Sender = { fromName: string; fromAddress: string; replyTo: string | null; verified: boolean };

export default function EmailSenderPage() {
 const [settings, setSettings] = useState<Settings | null>(null);
 const [sender, setSender] = useState<Sender | null>(null);
 const [fromName, setFromName] = useState("");
 const [replyTo, setReplyTo] = useState("");
 const [domain, setDomain] = useState("");
 const [busy, setBusy] = useState<string | null>(null);
 const [msg, setMsg] = useState<string | null>(null);
 const [copied, setCopied] = useState<string | null>(null);

 function apply(d: { settings: Settings; sender: Sender }) {
 setSettings(d.settings); setSender(d.sender);
 setFromName(d.settings?.fromName || d.sender?.fromName || "");
 setReplyTo(d.settings?.replyTo || d.sender?.replyTo || "");
 }

 useEffect(() => {
 fetch("/api/store/email-domain").then((r) => (r.ok ? r.json() : null)).then((d) => d && apply(d)).catch(() => {});
 }, []);

 async function saveIdentity() {
 setBusy("identity"); setMsg(null);
 try {
 const r = await fetch("/api/store/email-domain", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromName, replyTo }) });
 const d = await r.json();
 if (r.ok) { apply(d); setMsg("Saved."); } else setMsg(d.error || "Couldn’t save.");
 } catch { setMsg("Couldn’t save."); }
 setBusy(null);
 }
 async function addDomain() {
 setBusy("domain"); setMsg(null);
 try {
 const r = await fetch("/api/store/email-domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
 const d = await r.json();
 if (r.ok) { setSettings(d.settings); setDomain(""); } else setMsg(d.error || "Couldn’t add domain.");
 } catch { setMsg("Couldn’t add domain."); }
 setBusy(null);
 }
 async function verify() {
 setBusy("verify"); setMsg(null);
 try {
 const r = await fetch("/api/store/email-domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify" }) });
 const d = await r.json();
 if (r.ok) { setSettings(d.settings); setSender(d.sender); setMsg(d.verified ? "Verified! Your emails now send from your domain." : "Not verified yet — DNS can take a bit to propagate. Try again shortly."); }
 else setMsg(d.error || "Couldn’t verify.");
 } catch { setMsg("Couldn’t verify."); }
 setBusy(null);
 }
 async function copy(key: string, v: string) {
 try { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* ignore */ }
 }

 return (
 <AdminPage className="max-w-2xl">
 <AdminHeader eyebrow="Store · Marketing · Sender" title="Sender" subtitle="How your marketing emails send — the name customers see, where replies go, and (optionally) your own domain." />

 {/* Sender identity */}
 <TechCard className="mb-5">
 <div className="border-b border-stone-100 px-5 py-3.5">
 <h3 className="text-[13px] font-semibold text-stone-900">Sender identity</h3>
 <p className="mt-0.5 text-xs text-stone-500">Shown as the sender on every automation + campaign.</p>
 </div>
 <div className="space-y-3 px-5 py-4">
 <Field label="From name"><Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your store name" /></Field>
 <Field label="Reply-to email" hint="Where customer replies land."><Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@yourstore.com" /></Field>
 <div className="flex items-center gap-3 pt-1">
 <TechButton onClick={saveIdentity} disabled={busy === "identity"}>{busy === "identity" ? "Saving…" : "Save"}</TechButton>
 {sender && <span className="text-[12px] text-stone-500">Currently sends as <b className="text-stone-700">{sender.fromName}</b> &lt;{sender.fromAddress}&gt;</span>}
 </div>
 </div>
 </TechCard>

 {/* Domain authentication */}
 <TechCard>
 <div className="border-b border-stone-100 px-5 py-3.5">
 <h3 className="text-[13px] font-semibold text-stone-900">Send from your own domain</h3>
 <p className="mt-0.5 text-xs text-stone-500">Authenticate your domain so emails send FROM your address — better trust + deliverability.</p>
 </div>
 <div className="px-5 py-4">
 {settings?.verified ? (
 <div className="rounded-lg border border-[var(--accent,#0e9f76)]/25 bg-[var(--accent-soft,#eafaf3)] px-4 py-3">
 <p className="text-[13px] font-medium text-[var(--accent-ink,#0b7a5c)]">✓ {settings.domain} is verified</p>
 <p className="mt-0.5 text-[12px] text-[var(--accent-ink,#0b7a5c)]/80">Emails now send from <b>{settings.sendingEmail}</b>.</p>
 </div>
 ) : settings?.domain ? (
 <>
 <p className="mb-3 text-[13px] text-stone-600">Add these records to <b>{settings.domain}</b>’s DNS, then verify. (At your registrar — GoDaddy, Namecheap, Cloudflare, etc.)</p>
 <div className="overflow-x-auto rounded-lg border border-stone-200">
 <table className="w-full text-[12px]">
 <thead><tr><TH className="px-3">Type</TH><TH className="px-3">Name</TH><TH className="px-3">Value</TH></tr></thead>
 <tbody>
 {(settings.dnsRecords || []).map((rec, i) => (
 <tr key={i}>
 <TD className="whitespace-nowrap px-3 font-mono text-stone-700">{rec.type}</TD>
 <TD className="px-3 font-mono text-stone-600"><span className="flex items-center gap-1"><span className="max-w-[140px] truncate">{rec.name}</span><button onClick={() => copy(`n${i}`, rec.name || "")} className="text-stone-300 hover:text-stone-600">{copied === `n${i}` ? <Check size={12} /> : <Copy size={12} />}</button></span></TD>
 <TD className="px-3 font-mono text-stone-600"><span className="flex items-center gap-1"><span className="max-w-[200px] truncate">{rec.value}</span><button onClick={() => copy(`v${i}`, rec.value || "")} className="text-stone-300 hover:text-stone-600">{copied === `v${i}` ? <Check size={12} /> : <Copy size={12} />}</button></span></TD>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <div className="mt-3 flex items-center gap-3">
 <TechButton onClick={verify} disabled={busy === "verify"}>{busy === "verify" ? "Checking…" : "Verify domain"}</TechButton>
 <span className="text-[11px] text-stone-400">DNS changes can take minutes to a few hours.</span>
 </div>
 </>
 ) : (
 <div className="flex flex-wrap items-end gap-2">
 <div className="flex-1"><Field label="Your domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourstore.com" /></Field></div>
 <TechButton onClick={addDomain} disabled={busy === "domain" || !domain.trim()}>{busy === "domain" ? "Adding…" : "Authenticate"}</TechButton>
 </div>
 )}
 </div>
 </TechCard>

 {msg && <p className="mt-3 text-[12px] text-stone-600">{msg}</p>}
 <p className="mt-3 text-[11px] text-stone-400">Until you authenticate a domain, emails send from your name via VYA’s shared sending domain — replies still route to you.</p>
 </AdminPage>
 );
}
