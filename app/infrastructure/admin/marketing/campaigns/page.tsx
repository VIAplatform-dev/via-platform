"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminHeader, TechCard, TechButton } from "../../ui";
import { Input, Field } from "@/app/store/ui";
import EmailEditor from "@/app/store/EmailEditor";

export default function CampaignsPage() {
 const [subject, setSubject] = useState("");
 const [msg, setMsg] = useState("");
 const [link, setLink] = useState("");
 const [camp, setCamp] = useState<{ recipientCount: number; storeEmail: string | null; storeName?: string } | null>(null);
 const [sending, setSending] = useState(false);
 const [campMsg, setCampMsg] = useState<string | null>(null);

 useEffect(() => {
 fetch("/api/store/campaign").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCamp(d)).catch(() => {});
 }, []);

 async function send(test: boolean) {
 if (!subject.trim() || !msg.trim()) { setCampMsg("Add a subject and a message."); return; }
 if (!test && !window.confirm(`Send this to ${camp?.recipientCount ?? 0} customers? This can't be undone.`)) return;
 setSending(true); setCampMsg(null);
 try {
 const r = await fetch("/api/store/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body: msg, link, test }) });
 const d = await r.json();
 if (!r.ok) setCampMsg(d.error || "Couldn’t send.");
 else if (test) setCampMsg(`Test sent to ${d.sentTo}. Check your inbox.`);
 else setCampMsg(`Sent to ${d.sent} customer${d.sent === 1 ? "" : "s"}${d.failed ? ` (${d.failed} failed)` : ""}. ✓`);
 } catch { setCampMsg("Couldn’t send."); }
 setSending(false);
 }

 return (
 <AdminPage className="max-w-4xl">
 <AdminHeader eyebrow="Store · Marketing · Campaigns" title="Campaigns" subtitle="Write, format, and preview an email — then send it as your store." />
 <TechCard>
 <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
 <div className="min-w-0">
 <h3 className="text-[13px] font-semibold text-stone-900">New email</h3>
 <p className="mt-0.5 text-xs text-stone-500">Sends as {camp?.storeName || "your store"} — replies go to {camp?.storeEmail || "your contact email"}</p>
 </div>
 </div>
 <div className="space-y-4 px-5 py-4">
 <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New drop just landed ✨" /></Field>
 <EmailEditor body={msg} onBody={setMsg} subject={subject} link={link} storeName={camp?.storeName}
 placeholder={"Write to your customers…\n\n## A heading\nUse **bold**, *italic*, [links](https://…), and\n- bullet points"} />
 <Field label="Button link" hint="Where “Shop now” points. Defaults to your store."><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourstore.com" /></Field>
 <div className="flex flex-wrap items-center gap-2 pt-1">
 <TechButton variant="secondary" onClick={() => send(true)} disabled={sending}>Send test to myself</TechButton>
 <TechButton onClick={() => send(false)} disabled={sending || !camp?.recipientCount}>{sending ? "Sending…" : `Send to ${camp?.recipientCount ?? 0} customer${camp?.recipientCount === 1 ? "" : "s"}`}</TechButton>
 {campMsg && <span className="text-xs text-stone-600">{campMsg}</span>}
 </div>
 <p className="text-[11px] text-stone-400">Tip: send a test first. Links are tagged so email traffic shows up in Analytics.</p>
 </div>
 </TechCard>
 </AdminPage>
 );
}
