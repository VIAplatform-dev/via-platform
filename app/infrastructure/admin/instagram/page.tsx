"use client";

import { useEffect, useState } from "react";
import { Input, Field } from "@/app/store/ui";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, Toggle } from "../ui";
import { Instagram, Check } from "lucide-react";

type IgStatus = {
 connected: boolean;
 igUsername: string | null;
 autoPost: boolean;
 oauthAvailable: boolean;
};

const NOTICE: Record<string, string> = {
 connected: "Instagram connected ✓",
 denied: "Connection cancelled.",
 no_ig_account: "No Instagram Business account was found on that login. Instagram must be a Business/Creator account linked to a Facebook Page.",
 token_failed: "Couldn’t finish connecting — try again.",
 unconfigured: "One-click connect isn’t set up on the server yet — paste a token instead.",
 error: "Something went wrong — try again.",
};

export default function InstagramPage() {
 const [s, setS] = useState<IgStatus | null>(null);
 const [igUserId, setIgUserId] = useState("");
 const [token, setToken] = useState("");
 const [username, setUsername] = useState("");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState("");
 const [notice, setNotice] = useState("");
 const [testId, setTestId] = useState("");
 const [testMsg, setTestMsg] = useState("");
 const [showToken, setShowToken] = useState(false);

 useEffect(() => {
 (async () => {
 const d = await fetch("/api/store/instagram").then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d) setS(d);
 const q = new URLSearchParams(window.location.search).get("ig");
 if (q && NOTICE[q]) setNotice(NOTICE[q]);
 if (q) window.history.replaceState({}, "", window.location.pathname);
 })();
 }, []);

 async function connectToken() {
 setBusy(true); setErr("");
 const r = await fetch("/api/store/instagram", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "connect", igUserId: igUserId.trim(), accessToken: token.trim(), igUsername: username.trim() || null }),
 });
 const d = await r.json().catch(() => ({}));
 setBusy(false);
 if (!r.ok) { setErr(d.error || "Couldn’t connect."); return; }
 setS({ connected: true, igUsername: username.trim() || null, autoPost: true, oauthAvailable: !!s?.oauthAvailable });
 setToken(""); setIgUserId(""); setUsername("");
 }

 async function toggleAuto() {
 if (!s) return;
 const next = !s.autoPost;
 setS({ ...s, autoPost: next });
 await fetch("/api/store/instagram", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "toggle", autoPost: next }),
 }).catch(() => {});
 }

 async function disconnect() {
 if (!window.confirm("Disconnect Instagram? VYA will stop auto-posting your new pieces.")) return;
 await fetch("/api/store/instagram", { method: "DELETE" }).catch(() => {});
 setS({ connected: false, igUsername: null, autoPost: false, oauthAvailable: !!s?.oauthAvailable });
 }

 async function postNow() {
 if (!testId.trim()) return;
 setBusy(true); setTestMsg("Posting…");
 const r = await fetch("/api/store/instagram", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "post-now", itemId: testId.trim() }),
 });
 const d = await r.json().catch(() => ({}));
 setBusy(false);
 setTestMsg(r.ok && d.ok ? "Posted to your Story ✓" : `Couldn’t post${d.detail ? ` — ${d.detail}` : d.reason ? ` — ${d.reason}` : ""}.`);
 }

 const tokenForm = (
 <div className="space-y-3">
 <ol className="space-y-1.5 text-[13px] text-stone-600">
 <li><span className="font-medium text-stone-800">1.</span> Make sure your Instagram is a <span className="font-medium">Business or Creator</span> account linked to a Facebook Page.</li>
 <li><span className="font-medium text-stone-800">2.</span> In the Meta Graph API Explorer, generate a token with <span className="font-mono text-[12px]">instagram_content_publish</span>, then paste your IG account id + token below.</li>
 </ol>
 <Field label="Instagram Business account ID"><Input value={igUserId} onChange={(e) => setIgUserId(e.target.value)} placeholder="17841400000000000" /></Field>
 <Field label="Access token"><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG••••••••••••" /></Field>
 <Field label="@username (optional)"><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="venusvintage" /></Field>
 <div className="flex flex-wrap items-center gap-2">
 <TechButton onClick={connectToken} disabled={busy || !igUserId.trim() || !token.trim()}>{busy ? "Connecting…" : "Connect"}</TechButton>
 {err && <span className="text-[12px] text-rose-600">{err}</span>}
 </div>
 </div>
 );

 return (
 <AdminPage className="max-w-3xl">
 <AdminHeader eyebrow="Apps · Social" title="Instagram" subtitle="Auto-post every new piece to your Story." />

 {notice && <div className="mb-4 rounded-lg bg-[var(--accent-soft,#eafaf3)] px-4 py-2.5 text-[13px] font-medium text-[var(--accent-ink,#0b7a5c)]">{notice}</div>}

 {/* How it works */}
 <div className="mb-5 rounded-xl border border-stone-200/70 bg-stone-50/70 px-4 py-3 text-[12.5px] leading-relaxed text-stone-500">
 When you publish a new piece, VYA posts it to your Instagram Story automatically — a clean photo card with a <span className="font-medium text-stone-600">Shop now</span> prompt. Buyers land on <span className="font-medium text-stone-600">your own storefront</span>, so the sale and the customer stay yours. Keep renting, keep selling — this just turns every new listing into a story.
 </div>

 <TechCard className="p-5">
 <div className="flex items-center gap-3">
 <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" }}><Instagram size={18} /></span>
 <div>
 <p className="text-[14px] font-semibold text-stone-900">Instagram</p>
 <p className="text-[11px] uppercase tracking-[0.08em] text-stone-400">Auto-post to Story</p>
 </div>
 {s?.connected && <StatusPill tone="live" dot className="ml-auto">Connected{s.igUsername ? ` · @${s.igUsername}` : ""}</StatusPill>}
 </div>

 {s?.connected ? (
 <div className="mt-5 space-y-5">
 <div className="flex items-center justify-between rounded-lg border border-stone-200/70 bg-white px-4 py-3">
 <div>
 <p className="text-[13.5px] font-medium text-stone-800">Auto-post new pieces</p>
 <p className="text-[12px] text-stone-500">Every item you publish is posted to your Story.</p>
 </div>
 <Toggle on={!!s.autoPost} onClick={toggleAuto} />
 </div>

 <div className="rounded-lg border border-stone-200/70 bg-white px-4 py-3">
 <p className="text-[13.5px] font-medium text-stone-800">Test it</p>
 <p className="mb-2.5 text-[12px] text-stone-500">Paste any published item’s id to post its story card right now.</p>
 <div className="flex flex-wrap items-center gap-2">
 <div className="min-w-[220px] flex-1"><Input value={testId} onChange={(e) => setTestId(e.target.value)} placeholder="item id" /></div>
 <TechButton variant="secondary" onClick={postNow} disabled={busy || !testId.trim()}>Post to Story now</TechButton>
 </div>
 {testMsg && <p className="mt-2 text-[12px] text-stone-600">{testMsg}</p>}
 </div>

 <button onClick={disconnect} className="text-[12px] text-stone-400 transition hover:text-rose-600">Disconnect Instagram</button>
 </div>
 ) : (
 <div className="mt-5 space-y-4">
 <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-[13px] text-stone-600"><Check size={14} className="text-stone-400" /> Connect once — then new pieces post themselves.</div>
 {s?.oauthAvailable ? (
 <div className="space-y-2">
 <a href="/api/store/instagram/connect" className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium text-white transition hover:opacity-90" style={{ background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" }}><Instagram size={15} /> Connect Instagram</a>
 {!showToken ? (
 <button onClick={() => setShowToken(true)} className="text-[12px] text-stone-400 underline hover:text-stone-600">or paste a token instead</button>
 ) : tokenForm}
 </div>
 ) : tokenForm}
 </div>
 )}
 </TechCard>

 <p className="mt-4 text-[12px] leading-relaxed text-stone-400">Instagram must be a Business or Creator account. VYA only posts the pieces you publish — it never reads your DMs or posts anything else.</p>
 </AdminPage>
 );
}
