"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { AdminHeader, TechCard, TechButton } from "../../ui";

// Who this store is as a business.
//
// None of this was collected anywhere, and two systems already need it: a customs declaration wants
// a real legal name, and Stripe asks for a support contact. Both were falling back to whatever the
// shop's display name happened to be, which is a trading name and often not the legal entity at all.

type Profile = {
 displayName: string; legalName: string | null; location: string | null;
 supportEmail: string | null; supportPhone: string | null;
 companyNumber: string | null; vatNumber: string | null;
};

const FIELDS: { key: keyof Profile; label: string; hint?: string; half?: boolean }[] = [
 { key: "displayName", label: "Store name", hint: "What buyers see." },
 { key: "legalName", label: "Legal business name", hint: "The name on your bank account and customs paperwork — often not your shop name." },
 { key: "supportEmail", label: "Support email", hint: "Where buyers reach you. Shown on receipts.", half: true },
 { key: "supportPhone", label: "Support phone", hint: "Couriers require one for international parcels.", half: true },
 { key: "companyNumber", label: "Company number", hint: "Companies House, EIN, ABN — whatever your country calls it.", half: true },
 { key: "vatNumber", label: "VAT / GST number", hint: "For your invoices. Separate from where you collect tax.", half: true },
 { key: "location", label: "Location", hint: "Shown on your storefront — “London, UK”." },
];

export default function StoreDetailsPage() {
 const [p, setP] = useState<Profile | null>(null);
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
  let active = true;
  (async () => {
   const d = await fetch("/api/store/profile").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (active && d?.profile) setP(d.profile);
  })();
  return () => { active = false; };
 }, []);

 async function save() {
  if (!p) return;
  setBusy(true); setErr(null); setMsg(null);
  const r = await fetch("/api/store/profile", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    displayName: p.displayName ?? "", legalName: p.legalName ?? "", location: p.location ?? "",
    supportEmail: p.supportEmail ?? "", supportPhone: p.supportPhone ?? "",
    companyNumber: p.companyNumber ?? "", vatNumber: p.vatNumber ?? "",
   }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setBusy(false);
  if (!r || !r.ok) { setErr(r?.d?.error || "Couldn’t save that."); return; }
  if (r.d.profile) setP(r.d.profile);
  setMsg("Saved.");
 }

 return (
  <>
   <AdminHeader eyebrow="Settings" title="Store details" subtitle="Your business name and address. Used on receipts, invoices and customs forms." />
   {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">{err}</div>}
   {msg && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{msg}</div>}

   {!p ? (
    <TechCard className="px-5 py-8 text-center text-[13px] text-stone-400">Loading…</TechCard>
   ) : (
    <TechCard className="overflow-hidden">
     <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
      <Building2 size={15} className="text-stone-400" />
      <h2 className="text-[13px] font-semibold text-stone-800">Business</h2>
     </div>
     <div className="grid grid-cols-2 gap-4 px-5 py-5 max-sm:grid-cols-1">
      {FIELDS.map((f) => (
       <label key={f.key} className={f.half ? "" : "col-span-2 max-sm:col-span-1"}>
        <span className="mb-1 block text-[12px] font-medium text-stone-700">{f.label}</span>
        <input
         value={(p[f.key] as string) ?? ""}
         onChange={(e) => setP({ ...p, [f.key]: e.target.value })}
         className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-[13px] outline-none focus:border-stone-500"
        />
        {f.hint && <span className="mt-1 block text-[11.5px] leading-relaxed text-stone-400">{f.hint}</span>}
       </label>
      ))}
     </div>
     <div className="border-t border-stone-100 px-5 py-3.5">
      <TechButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</TechButton>
     </div>
    </TechCard>
   )}
  </>
 );
}
