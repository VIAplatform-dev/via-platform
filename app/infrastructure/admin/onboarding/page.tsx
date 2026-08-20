"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Hammer, ArrowRight, ArrowLeft, Check, X, Loader2 } from "lucide-react";
import { SELL_CATEGORIES, tailoredKit } from "@/app/lib/storefront-tailoring";
import { defaultStarterTheme } from "@/app/lib/storefront-default";

// The signup wizard for a self-onboarded store. Four questions that tailor setup, the first
// being the fork the whole thing hangs on: bring an existing site (paste URL → import) vs build
// from scratch. On submit it creates the store, then AUTO-BUILDS the storefront (tailored to what
// they sell, or imported from their URL) and drops them straight into the studio editor — no
// separate build wizard. Renders bare (the workspace layout skips its shell for /admin/onboarding).

const CHANNELS = [
 { id: "shopify", label: "Shopify" },
 { id: "square", label: "Square" },
 { id: "depop", label: "Depop" },
 { id: "instagram", label: "Instagram / TikTok" },
 { id: "in-person", label: "In person / markets" },
 { id: "none", label: "Not selling yet" },
];

const slugify = (s: string) =>
 s.toLowerCase().normalize("NFKD").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

// Import path skips the "name your store" step, so derive a sensible name from the domain
// ("tousvintage.com" → "Tousvintage"). The seller can rename it later in the editor.
const nameFromDomain = (raw: string): string => {
 try {
  const h = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  const base = h.split(".")[0] || "";
  const name = base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return name.length >= 2 ? name : "My store";
 } catch { return "My store"; }
};

const ACCENT = "#0e9f76";

export default function OnboardingWizard() {
 const router = useRouter();
 const [step, setStep] = useState(0);
 const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
 const [websiteUrl, setWebsiteUrl] = useState("");
 const [cats, setCats] = useState<string[]>([]); // what they sell (ordered — first pick leads the look)
 const [customs, setCustoms] = useState<string[]>([]); // free-typed categories
 const [customInput, setCustomInput] = useState("");
 const [channel, setChannel] = useState<string | null>(null);
 const [name, setName] = useState("");
 const [busy, setBusy] = useState(false);
 const [phase, setPhase] = useState<"creating" | "importing" | "building">("creating"); // full-screen build status
 const [error, setError] = useState<string | null>(null);

 const toggleCat = (k: string) => setCats((cs) => (cs.includes(k) ? cs.filter((x) => x !== k) : [...cs, k]));
 const addCustom = (e: React.FormEvent) => { e.preventDefault(); const v = customInput.trim(); if (v && customs.length < 8 && !customs.some((c) => c.toLowerCase() === v.toLowerCase())) setCustoms((cs) => [...cs, v]); setCustomInput(""); };

 const handle = useMemo(() => slugify(name) || "your-store", [name]);
 const TOTAL = 4;

 const canContinue = () => {
  if (step === 0) return hasWebsite === false || (hasWebsite === true && websiteUrl.trim().length > 3);
  if (step === 1) return cats.length > 0 || customs.length > 0;
  if (step === 2) return !!channel;
  if (step === 3) return name.trim().length >= 2;
  return false;
 };

 // Import path forks at step 0: paste a URL → build (import) immediately, skipping the sell/channel/name
 // questions (those only tailor a NEW site). Build-from-scratch keeps the full flow.
 const next = () => { setError(null); if (step === 0 && hasWebsite === true) { submit(); return; } if (step < TOTAL - 1) setStep((s) => s + 1); else submit(); };
 const back = () => { setError(null); setStep((s) => Math.max(0, s - 1)); };

 async function submit() {
  setBusy(true); setError(null); setPhase(hasWebsite === true ? "importing" : "creating");
  try {
   // Import path never reaches the name step → derive the name from the domain.
   const finalName = name.trim() || (hasWebsite === true ? nameFromDomain(websiteUrl) : "");
   const primaryCat = cats[0] || customs[0] || null;
   const res = await fetch("/api/store/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: finalName, hasWebsite, websiteUrl: websiteUrl.trim() || null, sellsCategory: primaryCat, sellsCategories: [...cats, ...customs], sellsChannel: channel }),
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok) { setError(data?.error || "Something went wrong — try again."); setBusy(false); return; }
   // Branch on the SELLER'S choice (local state) — not the API echo, which omits hasWebsite/websiteUrl
   // for an already-existing store (idempotent), silently misrouting an import into the build path.
   const isImport = hasWebsite === true && websiteUrl.trim().length > 3;
   const importUrl = /^https?:\/\//i.test(websiteUrl.trim()) ? websiteUrl.trim() : `https://${websiteUrl.trim()}`;
   if (isImport) {
    // Brought an existing site → import it now, then drop them into the editor showing their store.
    // If the import fails/blocks, route to the Bring-your-site page WITH the reason + URL, not an empty editor.
    setPhase("importing");
    const cap = await fetch("/api/store/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: importUrl, replaceBlocks: true }) }).catch(() => null);
    const capData = cap ? await cap.json().catch(() => null) : null;
    if (!cap || !cap.ok) {
     const msg = capData?.error || "We couldn’t bring that site over — try again or check the URL.";
     router.replace(`/admin/import?from=onboarding&err=${encodeURIComponent(msg)}&url=${encodeURIComponent(importUrl)}`);
     return;
    }
    router.replace("/admin/storefront?welcome=import");
    return;
   }
   // Build from scratch → AUTO-BUILD the storefront tailored to what they sell. NEVER overwrite an
   // existing store's storefront (idempotent onboarding returns existing:true) — just open the editor.
   setPhase("building");
   if (!data?.existing) {
    const kit = tailoredKit(cats, customs);
    const starter = defaultStarterTheme(finalName);
    await fetch("/api/store/storefront/design", {
     method: "POST", headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ template: kit.template, colors: kit.colors, fonts: kit.fonts, blocks: kit.blocks, shopBlocks: [], extraPages: starter.extraPages || [] }),
    }).catch(() => {});
   }
   router.replace(`/admin/storefront${data?.existing ? "" : "?welcome=build"}`);
  } catch {
   setError("Network error — try again."); setBusy(false);
  }
 }

 return (
  <div className="min-h-screen bg-[#f7f6f3] text-stone-900" style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
   <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet" />

   {/* Full-screen build status — covers the flow while we create the store, import, or auto-build. */}
   {busy && (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f7f6f3] px-6 text-center">
     <Loader2 size={30} className="animate-spin" style={{ color: ACCENT }} />
     <h2 className="mt-6 text-[22px] leading-tight text-stone-900" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
      {phase === "importing" ? "Bringing your site over" : phase === "building" ? "Building your storefront" : "Setting up your store"}
     </h2>
     <p className="mt-2 max-w-sm text-[14px] text-stone-500">
      {phase === "importing" ? "Importing your products, photos, and pages — this can take a moment." : phase === "building" ? "Tailoring your storefront to what you sell. Almost there." : "Just a second…"}
     </p>
    </div>
   )}

   <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6 py-10">
    {/* Brand + progress */}
    <div className="flex items-center gap-2.5">
     <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/via-logo-mark.png" alt="VYA" className="h-[18px] w-[18px] object-contain" style={{ filter: "brightness(0) invert(1)" }} />
     </span>
     <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Set up your store</p>
    </div>
    <div className="mt-6 flex gap-1.5">
     {Array.from({ length: TOTAL }).map((_, i) => (
      <div key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: i <= step ? ACCENT : "#e7e5e1" }} />
     ))}
    </div>

    <div className="mt-10 flex-1">
     {step === 0 && (
      <Section title="Do you already have a website?" sub="We’ll either bring your existing site over, or build you a new one.">
       <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChoiceCard icon={<Globe size={20} />} label="Yes, I have one" desc="Paste the URL — we’ll import it" active={hasWebsite === true} onClick={() => setHasWebsite(true)} />
        <ChoiceCard icon={<Hammer size={20} />} label="No, from scratch" desc="Build a storefront with VYA" active={hasWebsite === false} onClick={() => { setHasWebsite(false); setWebsiteUrl(""); }} />
       </div>
       {hasWebsite === true && (
        <div className="mt-5">
         <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Your website URL</label>
         <input
          autoFocus value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canContinue()) next(); }}
          placeholder="yourstore.com"
          className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[color:var(--a)]"
          style={{ ["--a" as string]: ACCENT }}
         />
        </div>
       )}
      </Section>
     )}

     {step === 1 && (
      <Section title="What do you sell?" sub="Pick any that fit — we’ll tailor your storefront’s look and starting content to match. Your first pick leads the style.">
       <div className="flex flex-wrap gap-2.5">
        {SELL_CATEGORIES.map((c) => {
         const on = cats.includes(c.key);
         const lead = on && cats[0] === c.key;
         return (
          <button
           key={c.key} type="button" onClick={() => toggleCat(c.key)}
           className="rounded-full border px-4 py-2.5 text-[14px] font-medium transition"
           style={{ borderColor: on ? ACCENT : "#e7e5e1", background: on ? ACCENT : "#fff", color: on ? "#fff" : "#44403c" }}
          >
           {c.label}{lead && <span className="ml-1.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">Leads</span>}
          </button>
         );
        })}
       </div>
       {customs.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2.5">
         {customs.map((c) => (
          <span key={c} className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] text-stone-700" style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}0f` }}>
           {c}<button type="button" onClick={() => setCustoms((cs) => cs.filter((x) => x !== c))} className="text-stone-400 hover:text-stone-700"><X size={14} /></button>
          </span>
         ))}
        </div>
       )}
       <form onSubmit={addCustom} className="mt-3.5">
        <input value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Add your own — e.g. Bags, Band tees, Ceramics…" className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[14px] outline-none focus:border-[color:var(--a)]" style={{ ["--a" as string]: ACCENT }} />
       </form>
      </Section>
     )}

     {step === 2 && (
      <Section title="Where do you sell now?" sub="So we can sync your products and orders.">
       <ChipGrid options={CHANNELS} value={channel} onPick={setChannel} />
      </Section>
     )}

     {step === 3 && (
      <Section title="Name your store" sub="This becomes your storefront address and email name.">
       <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && canContinue()) next(); }}
        placeholder="e.g. Aurora Vintage"
        className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[color:var(--a)]"
        style={{ ["--a" as string]: ACCENT }}
       />
       <p className="mt-2.5 text-[13px] text-stone-400">Your storefront: <span className="font-medium text-stone-600">{handle}.getvya.ai</span></p>
      </Section>
     )}
    </div>

    {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

    <div className="flex items-center justify-between border-t border-stone-200/70 pt-5">
     <button onClick={back} disabled={step === 0 || busy} className="flex items-center gap-1.5 text-[14px] text-stone-500 transition hover:text-stone-800 disabled:opacity-0">
      <ArrowLeft size={15} /> Back
     </button>
     <button
      onClick={next} disabled={!canContinue() || busy}
      className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: ACCENT }}
     >
      {busy ? "Building…" : step === 0 && hasWebsite === true ? "Bring my site over" : step === TOTAL - 1 ? "Create my store" : "Continue"}
      {!busy && (step === TOTAL - 1 ? <Check size={16} /> : <ArrowRight size={16} />)}
     </button>
    </div>
   </div>
  </div>
 );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
 return (
  <div>
   <h1 className="text-[26px] leading-tight text-stone-900" style={{ fontFamily: "'Newsreader', Georgia, serif", textWrap: "balance" }}>{title}</h1>
   <p className="mt-2 text-[14.5px] text-stone-500">{sub}</p>
   <div className="mt-7">{children}</div>
  </div>
 );
}

function ChoiceCard({ icon, label, desc, active, onClick }: { icon: React.ReactNode; label: string; desc: string; active: boolean; onClick: () => void }) {
 return (
  <button
   onClick={onClick}
   className="flex flex-col items-start gap-2 rounded-2xl border bg-white p-4 text-left transition"
   style={{ borderColor: active ? ACCENT : "#e7e5e1", boxShadow: active ? `0 0 0 1px ${ACCENT}` : "none" }}
  >
   <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: active ? ACCENT : "#f0efec", color: active ? "#fff" : "#57534e" }}>{icon}</span>
   <span className="text-[15px] font-semibold text-stone-900">{label}</span>
   <span className="text-[13px] text-stone-500">{desc}</span>
  </button>
 );
}

function ChipGrid({ options, value, onPick }: { options: { id: string; label: string }[]; value: string | null; onPick: (id: string) => void }) {
 return (
  <div className="flex flex-wrap gap-2.5">
   {options.map((o) => {
    const active = value === o.id;
    return (
     <button
      key={o.id} onClick={() => onPick(o.id)}
      className="rounded-full border px-4 py-2.5 text-[14px] font-medium transition"
      style={{ borderColor: active ? ACCENT : "#e7e5e1", background: active ? ACCENT : "#fff", color: active ? "#fff" : "#44403c" }}
     >
      {o.label}
     </button>
    );
   })}
  </div>
 );
}
