"use client";

import { useEffect, useState } from "react";
import { Globe, Check, Copy } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, StatusPill, TH, TD, cn } from "../../ui";

// Your own domain — connect one you already own, or buy one here.
//
// The API has done both since it shipped; the only way in was the legacy /store
// portal, so in practice almost no store has a domain set. This is that panel,
// in the workspace people actually use.

type DnsRecord = { type: "A" | "CNAME"; name: string; value: string };
type DomainStatus = {
 domain: string;
 verified: boolean;
 misconfigured: boolean;
 records: DnsRecord[];
 verification: { type: string; domain: string; value: string }[];
};
type DomainOption = { domain: string; tld: string; available: boolean; priceCents: number | null };
type DomainInfo = { managed: boolean; boughtThroughUs: boolean; expiresAt: string | null; autoRenew: boolean };
type ZoneRecord = { id: string; type: string; name: string; value: string; ttl: number | null; mxPriority: number | null; locked: boolean };
type MxPreset = { label: string; records: { type: string; name: string; value: string; mxPriority: number }[] };

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"];

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const CONTACT_FIELDS: { key: string; label: string; half: boolean; hint?: string }[] = [
 { key: "firstName", label: "First name", half: true },
 { key: "lastName", label: "Last name", half: true },
 { key: "email", label: "Email", half: true },
 { key: "phone", label: "Phone", half: true, hint: "+15551234567" },
 { key: "address1", label: "Address", half: false },
 { key: "city", label: "City", half: true },
 { key: "state", label: "State / region", half: true },
 { key: "zip", label: "Postcode", half: true },
 { key: "country", label: "Country", half: true, hint: "US" },
];

function CopyField({ value }: { value: string }) {
 const [copied, setCopied] = useState(false);
 return (
  <button
   onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }}
   className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-stone-100 px-2 py-1 font-mono text-[12px] text-stone-700 transition hover:bg-stone-200"
  >
   <span className="truncate">{value}</span>
   {copied ? <Check size={12} className="shrink-0 text-[var(--accent,#0e9f76)]" /> : <Copy size={12} className="shrink-0 text-stone-400" />}
  </button>
 );
}

export default function DomainPage() {
 const [loading, setLoading] = useState(true);
 const [configured, setConfigured] = useState(false);
 const [domain, setDomain] = useState<string | null>(null);
 const [status, setStatus] = useState<DomainStatus | null>(null);
 const [info, setInfo] = useState<DomainInfo | null>(null);
 const [records, setRecords] = useState<ZoneRecord[]>([]);
 const [presets, setPresets] = useState<Record<string, MxPreset>>({});
 const [rec, setRec] = useState({ type: "TXT", name: "@", value: "", mxPriority: "10" });
 const [dnsBusy, setDnsBusy] = useState(false);
 const [dnsErr, setDnsErr] = useState<string | null>(null);
 const [authCode, setAuthCode] = useState<string | null>(null);
 const [transferNote, setTransferNote] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);

 // "I already own one"
 const [connectInput, setConnectInput] = useState("");
 // "Find me one"
 const [search, setSearch] = useState("");
 const [options, setOptions] = useState<DomainOption[] | null>(null);
 const [searching, setSearching] = useState(false);
 const [buying, setBuying] = useState<string | null>(null);
 // The domain the seller has picked and is now confirming. Registrant details are
 // asked for HERE, not up front: a wall of legal fields before you've even chosen
 // reads as a form to fill in rather than a thing to buy.
 const [picked, setPicked] = useState<DomainOption | null>(null);
 const [buyErr, setBuyErr] = useState<string | null>(null);
 const [contact, setContact] = useState<Record<string, string>>({ country: "US" });

 useEffect(() => {
  let active = true;
  (async () => {
   try {
    const r = await fetch("/api/store/domain");
    const d = await r.json();
    if (active && r.ok) {
     setConfigured(!!d.configured); setDomain(d.domain || null); setStatus(d.status || null);
     setInfo(d.info || null); setRecords(d.records || []); setPresets(d.mxPresets || {});
    }
   } catch { /* leave whatever is on screen */ }
   if (active) setLoading(false);
  })();
  return () => { active = false; };
 }, []);

 async function post(body: Record<string, unknown>, onOk: (d: Record<string, unknown>) => void) {
  setErr(null);
  const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { setErr(d.error || "That didn't work."); return false; }
  onOk(d);
  return true;
 }

 async function connect() {
  if (!connectInput.trim()) return;
  setBusy(true);
  await post({ domain: connectInput.trim() }, (d) => {
   setDomain(d.domain as string); setStatus(d.status as DomainStatus); setConnectInput("");
  });
  setBusy(false);
 }

 async function recheck() {
  setBusy(true);
  await post({ action: "verify" }, (d) => setStatus(d.status as DomainStatus));
  setBusy(false);
 }

 async function disconnect() {
  if (!confirm(`Disconnect ${domain}? Your storefront stays live on its VYA address.`)) return;
  setBusy(true);
  await fetch("/api/store/domain", { method: "DELETE" }).catch(() => {});
  setDomain(null); setStatus(null); setBusy(false);
 }

 async function runSearch() {
  if (search.trim().length < 2) return;
  setSearching(true); setOptions(null); setErr(null);
  await post({ action: "suggest", name: search.trim() }, (d) => setOptions((d.options as DomainOption[]) || []));
  setSearching(false);
 }

 async function buy(pick: DomainOption) {
  const missing = CONTACT_FIELDS.filter((f) => !contact[f.key]?.trim());
  if (missing.length) { setBuyErr(`Still needed: ${missing.map((m) => m.label.toLowerCase()).join(", ")}.`); return; }
  setBuyErr(null);
  setBuying(pick.domain);
  const ok = await post({ action: "buy", domain: pick.domain, contact }, (d) => {
   setDomain(d.domain as string); setStatus(d.status as DomainStatus);
   setOptions(null); setSearch(""); setPicked(null);
  });
  if (!ok) setBuyErr(null); // the page banner carries API errors
  setBuying(null);
 }

 async function addRecord(preset?: string) {
  setDnsBusy(true); setDnsErr(null);
  const payload = preset
   ? { action: "dns-add", preset }
   : { action: "dns-add", type: rec.type, name: rec.name || "@", value: rec.value.trim(), mxPriority: Number(rec.mxPriority) || 10 };
  const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const d2 = await r.json().catch(() => ({}));
  if (!r.ok) setDnsErr(d2.error || "Couldn't add that record.");
  else { setRecords(d2.records || []); setRec({ type: "TXT", name: "@", value: "", mxPriority: "10" }); }
  setDnsBusy(false);
 }

 async function removeRecord(id: string) {
  setDnsBusy(true); setDnsErr(null);
  const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dns-remove", recordId: id }) });
  const d2 = await r.json().catch(() => ({}));
  if (!r.ok) setDnsErr(d2.error || "Couldn't remove that record.");
  else setRecords(d2.records || []);
  setDnsBusy(false);
 }

 async function transferOut() {
  if (!confirm(`Move ${domain} to another registrar?\n\nYou keep the domain — we'll give you the auth code to hand your new registrar. Your storefront stays live until the transfer completes on their side.`)) return;
  setDnsBusy(true); setDnsErr(null);
  const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transfer-out" }) });
  const d2 = await r.json().catch(() => ({}));
  if (!r.ok) setDnsErr(d2.error || "Couldn't start the transfer.");
  else { setAuthCode(d2.authCode || null); setTransferNote(d2.note || null); }
  setDnsBusy(false);
 }

 const live = status?.verified && !status?.misconfigured;
 const renews = info?.expiresAt ? new Date(info.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;

 return (
  <AdminPage className="max-w-3xl">
   <AdminHeader
    eyebrow="Store · Storefront"
    title="Your own domain"
    subtitle="Use your own web address instead of a VYA one. Connect a domain you already own, or buy one here."
   />

   {loading ? (
    <div className="py-20 text-center text-[13px] text-stone-400">Loading…</div>
   ) : !configured ? (
    <TechCard className="p-5">
     <p className="text-[13px] text-stone-600">Custom domains aren&apos;t switched on for this server yet. Once they are, this page connects one in a couple of minutes.</p>
    </TechCard>
   ) : (
    <div className="space-y-5">
     {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{err}</div>}

     {domain ? (
      <>
      <TechCard className="p-5">
       <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
         <div className="flex items-center gap-2">
          <Globe size={15} className="text-stone-400" />
          <span className="text-[15px] font-semibold text-stone-900">{domain}</span>
          <StatusPill tone={live ? "live" : "pending"} dot>{live ? "Live" : "Waiting on DNS"}</StatusPill>
         </div>
         <p className="mt-1 text-[12px] text-stone-500">
          {live
           ? "Your storefront is being served here. Shoppers never see a VYA address."
           : "Add the records below at your domain provider. It usually goes live within the hour, sometimes up to 48."}
         </p>
        </div>
        <div className="flex gap-2">
         <TechButton className="px-3 py-1.5 text-[12px]" disabled={busy} onClick={recheck}>{busy ? "Checking…" : "Check again"}</TechButton>
         <TechButton variant="secondary" className="px-3 py-1.5 text-[12px]" disabled={busy} onClick={disconnect}>Disconnect</TechButton>
        </div>
       </div>

       {!live && (status?.records?.length || status?.verification?.length) ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
         <table className="w-full">
          <thead><tr><TH>Type</TH><TH>Name</TH><TH>Value</TH></tr></thead>
          <tbody>
           {[...(status?.records ?? []), ...(status?.verification ?? []).map((v) => ({ type: v.type as "A" | "CNAME", name: v.domain, value: v.value }))].map((r, i) => (
            <tr key={`${r.type}-${r.name}-${i}`}>
             <TD><span className="font-mono text-[12px] uppercase text-stone-500">{r.type}</span></TD>
             <TD><CopyField value={r.name || "@"} /></TD>
             <TD><CopyField value={r.value} /></TD>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       ) : null}
      </TechCard>

      {/* ── DNS, only when Vercel runs the nameservers (i.e. we registered it) ── */}
      {info?.managed ? (
       <TechCard className="p-5">
        <p className="text-[13px] font-medium text-stone-700">DNS records</p>
        <p className="mb-3 mt-0.5 text-[12px] text-stone-400">
         Everything else your domain does — email, verifying it with Instagram, pointing a subdomain somewhere else.
         The two records that keep your shop online are locked.
        </p>

        {Object.keys(presets).length > 0 && (
         <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.12em] text-stone-400">Email in one click</span>
          {Object.entries(presets).map(([key, p]) => (
           <button key={key} disabled={dnsBusy} onClick={() => addRecord(key)}
            className="rounded-full border border-stone-200 px-3 py-1 text-[12px] text-stone-600 transition hover:border-stone-400 hover:text-stone-900 disabled:opacity-50">
            {p.label}
           </button>
          ))}
         </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-stone-200">
         <table className="w-full">
          <thead><tr><TH>Type</TH><TH>Name</TH><TH>Value</TH><TH right>&nbsp;</TH></tr></thead>
          <tbody>
           {records.length === 0 && (
            <tr><TD><span className="text-[12px] text-stone-400">No records yet.</span></TD><TD>&nbsp;</TD><TD>&nbsp;</TD><TD>&nbsp;</TD></tr>
           )}
           {records.map((r) => (
            <tr key={r.id}>
             <TD><span className="font-mono text-[12px] uppercase text-stone-500">{r.type}{r.mxPriority != null ? ` ${r.mxPriority}` : ""}</span></TD>
             <TD><span className="font-mono text-[12px]">{r.name || "@"}</span></TD>
             <TD><span className="block max-w-[280px] truncate font-mono text-[12px] text-stone-600">{r.value}</span></TD>
             <TD right>
              {r.locked
               ? <StatusPill tone="neutral">Keeps your shop online</StatusPill>
               : <button disabled={dnsBusy} onClick={() => removeRecord(r.id)} className="text-[12px] text-stone-400 transition hover:text-rose-600 disabled:opacity-50">Remove</button>}
             </TD>
            </tr>
           ))}
          </tbody>
         </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
         <select value={rec.type} onChange={(e) => setRec((x) => ({ ...x, type: e.target.value }))}
          className="rounded-lg border border-stone-200 px-2 py-2 text-[12px] text-stone-600 outline-none focus:border-stone-400">
          {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
         </select>
         <input value={rec.name} onChange={(e) => setRec((x) => ({ ...x, name: e.target.value }))} placeholder="@ or subdomain"
          className="w-[150px] rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400" />
         <input value={rec.value} onChange={(e) => setRec((x) => ({ ...x, value: e.target.value }))} placeholder="Value"
          className="min-w-[180px] flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400" />
         {rec.type === "MX" && (
          <input value={rec.mxPriority} onChange={(e) => setRec((x) => ({ ...x, mxPriority: e.target.value }))} placeholder="Priority"
           className="w-[92px] rounded-lg border border-stone-200 px-3 py-2 text-[13px] tabular-nums outline-none placeholder:text-stone-400 focus:border-stone-400" />
         )}
         <TechButton className="px-3 py-2 text-[12px]" disabled={dnsBusy || !rec.value.trim()} onClick={() => addRecord()}>
          {dnsBusy ? "Saving…" : "Add record"}
         </TechButton>
        </div>
        {dnsErr && <p className="mt-2 text-[12px] text-rose-600">{dnsErr}</p>}
       </TechCard>
      ) : domain ? (
       <TechCard className="p-4">
        <p className="text-[12px] text-stone-600">
         This domain&apos;s DNS lives at the registrar you bought it from, so records are added there rather than here.
        </p>
       </TechCard>
      ) : null}

      {/* Renewal + the right to leave. Only for domains we registered. */}
      {info?.boughtThroughUs && (
       <TechCard className="p-5">
        <p className="text-[13px] font-medium text-stone-700">Renewal &amp; ownership</p>
        <div className="mt-2 space-y-1.5 text-[12.5px] text-stone-600">
         <p>
          {renews ? <>Renews on <span className="font-medium text-stone-800">{renews}</span>.</> : "Renews annually."}{" "}
          {info.autoRenew
           ? "We charge your card on file about a month before, then renew it for you."
           : "Auto-renew is off — the domain expires on that date unless you turn it back on."}
         </p>
         <p className="text-stone-500">It&apos;s your domain. You can move it to another registrar whenever you like.</p>
        </div>

        {authCode ? (
         <div className="mt-3 rounded-xl border border-[var(--accent,#0e9f76)]/30 bg-[var(--accent-soft,#eafaf3)] p-3.5">
          <p className="text-[12.5px] font-medium text-[var(--accent-ink,#0b7a5c)]">Your transfer code</p>
          <p className="mt-1 text-[12px] text-stone-600">Give this to your new registrar. Your shop keeps working until the transfer completes there.</p>
          <div className="mt-2"><CopyField value={authCode} /></div>
         </div>
        ) : transferNote ? (
         <p className="mt-3 rounded-xl bg-stone-50 px-3.5 py-2.5 text-[12px] text-stone-600">{transferNote}</p>
        ) : (
         <button onClick={transferOut} disabled={dnsBusy} className="mt-3 text-[12.5px] text-stone-500 underline underline-offset-2 transition hover:text-stone-800 disabled:opacity-50">
          Move this domain to another registrar
         </button>
        )}
       </TechCard>
      )}
      </>
     ) : (
      <>
       {/* ── Buy one ── */}
       <TechCard className="p-5">
        <p className="text-[13px] font-medium text-stone-700">Find a domain</p>
        <p className="mb-3 mt-0.5 text-[12px] text-stone-400">Type your shop name — we&apos;ll check the .com first, then the rest.</p>
        <div className="flex flex-wrap gap-2">
         <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="vintagestore"
          className="min-w-[200px] flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400"
         />
         <TechButton className="px-4 py-2 text-[13px]" disabled={searching || search.trim().length < 2} onClick={runSearch}>
          {searching ? "Searching…" : "Search"}
         </TechButton>
        </div>

        {options && options.length === 0 && <p className="mt-3 text-[12px] text-stone-400">Nothing came back for that — try another name.</p>}

        {options && options.length > 0 && !picked && (
         <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
          {options.map((o) => (
           <div key={o.domain} className={cn("flex flex-wrap items-center gap-3 px-3.5 py-2.5", !o.available && "opacity-50")}>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-stone-800">{o.domain}</span>
            {o.available ? (
             <>
              <span className="text-[13px] tabular-nums text-stone-600">{o.priceCents != null ? `${money(o.priceCents)}/yr` : "price at checkout"}</span>
              <TechButton className="px-3 py-1.5 text-[12px]" onClick={() => { setPicked(o); setBuyErr(null); setErr(null); }}>Buy</TechButton>
             </>
            ) : (
             <span className="text-[12px] text-stone-400">Taken</span>
            )}
           </div>
          ))}
         </div>
        )}

        {/* Step two: one domain, its price, and only now the details the registrar needs. */}
        {picked && (
         <div className="mt-4 rounded-xl border border-stone-300 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 pb-3">
           <div>
            <p className="text-[15px] font-semibold text-stone-900">{picked.domain}</p>
            <p className="mt-0.5 text-[12px] text-stone-500">
             {picked.priceCents != null ? `${money(picked.priceCents)} for the first year` : "Price shown at checkout"} · renews annually
            </p>
           </div>
           <button onClick={() => { setPicked(null); setBuyErr(null); }} className="text-[12px] text-stone-400 underline underline-offset-2 hover:text-stone-600">
            Pick a different one
           </button>
          </div>

          <p className="mt-3.5 text-[13px] font-medium text-stone-700">Who is registering it?</p>
          <p className="mb-2.5 mt-0.5 text-[12px] text-stone-400">Required by the registrar for every domain. It goes to them, never onto your storefront.</p>
          <div className="flex flex-wrap gap-2">
           {CONTACT_FIELDS.map((f) => (
            <input
             key={f.key}
             value={contact[f.key] ?? ""}
             onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))}
             placeholder={f.hint ? `${f.label} (${f.hint})` : f.label}
             className={cn("rounded-lg border px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400",
              buyErr && !contact[f.key]?.trim() ? "border-rose-300 bg-rose-50/40" : "border-stone-200",
              f.half ? "min-w-[140px] flex-1" : "w-full")}
            />
           ))}
          </div>

          {buyErr && <p className="mt-2.5 text-[12px] text-rose-600">{buyErr}</p>}

          <div className="mt-3.5 flex flex-wrap items-center gap-3">
           <TechButton className="px-4 py-2 text-[13px]" disabled={buying !== null} onClick={() => buy(picked)}>
            {buying ? "Buying…" : `Buy ${picked.domain}${picked.priceCents != null ? ` — ${money(picked.priceCents)}` : ""}`}
           </TechButton>
           <span className="text-[11px] text-stone-400">Charges your card on file. Refunded automatically if registration fails.</span>
          </div>
         </div>
        )}
       </TechCard>

       {/* ── Already own one ── */}
       <TechCard className="p-5">
        <p className="text-[13px] font-medium text-stone-700">Already own a domain?</p>
        <p className="mb-3 mt-0.5 text-[12px] text-stone-400">Connect it here, then add the DNS records we show you at your provider.</p>
        <div className="flex flex-wrap gap-2">
         <input
          value={connectInput}
          onChange={(e) => setConnectInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
          placeholder="shop.yourbrand.com"
          className="min-w-[200px] flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400"
         />
         <TechButton className="px-4 py-2 text-[13px]" disabled={busy || !connectInput.trim()} onClick={connect}>
          {busy ? "Connecting…" : "Connect"}
         </TechButton>
        </div>
       </TechCard>
      </>
     )}
    </div>
   )}
  </AdminPage>
 );
}
