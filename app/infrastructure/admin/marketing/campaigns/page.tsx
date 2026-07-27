"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Send, Check, AlertCircle, Palette } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton } from "../../ui";
import { Input, Field } from "@/app/store/ui";
import EmailEditor from "@/app/store/EmailEditor";

export default function CampaignsPage() {
 const [subject, setSubject] = useState("");
 const [msg, setMsg] = useState("");
 const [link, setLink] = useState("");
 const [camp, setCamp] = useState<{ recipientCount: number; storeEmail: string | null; storeName?: string; audience?: { subscribers: number; unsubscribed: number; buyers: number; imported: number; total: number } } | null>(null);
 const [sending, setSending] = useState(false);
 const [campMsg, setCampMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

 useEffect(() => {
 fetch("/api/store/campaign").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCamp(d)).catch(() => {});
 }, []);

 const count = camp?.recipientCount ?? 0;
 const ready = subject.trim().length > 0 && msg.trim().length > 0;

 async function send(test: boolean) {
 if (!ready) { setCampMsg({ text: "Add a subject and a message first.", tone: "err" }); return; }
 if (!test && !window.confirm(`Send this to ${count} customer${count === 1 ? "" : "s"}? This can’t be undone.`)) return;
 setSending(true); setCampMsg(null);
 try {
 const r = await fetch("/api/store/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body: msg, link, test }) });
 const d = await r.json();
 if (!r.ok) setCampMsg({ text: d.error || "Couldn’t send.", tone: "err" });
 else if (test) setCampMsg({ text: `Test sent to ${d.sentTo} — check your inbox.`, tone: "ok" });
 else setCampMsg({ text: `Sent to ${d.sent} customer${d.sent === 1 ? "" : "s"}${d.failed ? ` (${d.failed} failed)` : ""}.`, tone: "ok" });
 } catch { setCampMsg({ text: "Couldn’t send.", tone: "err" }); }
 setSending(false);
 }

 return (
 <AdminPage className="max-w-5xl">
 <AdminHeader eyebrow="Store · Marketing" title="Campaigns" subtitle="Write an email, see exactly how it lands, and send it to your customers — as your store." />

 <TechCard className="overflow-hidden">
 {/* Who it's from / who it's going to — the context you want before you write a word. */}
 <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-5 py-3">
 <div className="min-w-0">
 <p className="text-[13px] font-semibold text-stone-900">New email</p>
 <p className="mt-0.5 text-[12px] text-stone-500">From <span className="font-medium text-stone-700">{camp?.storeName || "your store"}</span> · replies go to {camp?.storeEmail || "your contact email"}</p>
 </div>
 <div className="flex items-center gap-2">
 <Link href="/infrastructure/admin/marketing/design" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-stone-500 ring-1 ring-stone-200 transition hover:text-stone-800 hover:ring-stone-300">
 <Palette size={13} className="text-stone-400" /> Design
 </Link>
 <span title={camp?.audience ? `${camp.audience.buyers} from orders · ${camp.audience.imported} imported${camp.audience.unsubscribed ? ` · ${camp.audience.unsubscribed} unsubscribed (skipped)` : ""}` : undefined} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-stone-600 ring-1 ring-stone-200">
 <Users size={13} className="text-stone-400" />
 {camp == null ? "…" : `${count.toLocaleString()} subscriber${count === 1 ? "" : "s"}`}
 </span>
 </div>
 </div>

 {/* Compose */}
 <div className="space-y-5 px-5 py-5">
 <Field label="Subject" hint="The one line that decides whether it gets opened.">
 <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New drop just landed ✨" />
 </Field>

 <div>
 <p className="mb-1.5 text-[12px] font-medium text-stone-700">Message</p>
 <EmailEditor body={msg} onBody={setMsg} subject={subject} link={link} storeName={camp?.storeName}
 placeholder={"Hi! We just added a few new pieces we think you’ll love…\n\nSelect any text to make it a heading, bold, or a list with the toolbar above."} />
 </div>

 <Field label="“Shop now” button" hint="Where the button at the bottom of the email sends people. Leave blank to point at your store.">
 <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourstore.com/new-arrivals" />
 </Field>
 </div>

 {/* Send bar — a distinct final step, not buttons floating in the compose area. */}
 <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/60 px-5 py-3.5">
 <div className="flex items-center gap-2 text-[12px]">
 {campMsg ? (
 <span className={`inline-flex items-center gap-1.5 font-medium ${campMsg.tone === "ok" ? "text-[var(--accent-ink,#0b7a5c)]" : "text-rose-600"}`}>
 {campMsg.tone === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}{campMsg.text}
 </span>
 ) : (
 <span className="text-stone-400">Send a test to yourself first — links are tagged so opens &amp; clicks show up in Analytics.</span>
 )}
 </div>
 <div className="flex items-center gap-2">
 <TechButton variant="secondary" onClick={() => send(true)} disabled={sending || !ready}>Send test to myself</TechButton>
 <TechButton onClick={() => send(false)} disabled={sending || !ready || !count}>
 <Send size={14} />{sending ? "Sending…" : `Send to ${count.toLocaleString()}`}
 </TechButton>
 </div>
 </div>
 </TechCard>
 </AdminPage>
 );
}
