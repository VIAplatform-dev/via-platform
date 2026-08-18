"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Hammer, ArrowRight, ArrowLeft, Check } from "lucide-react";

// The signup wizard for a self-onboarded store. Four questions that tailor setup, the first
// being the fork the whole thing hangs on: bring an existing site (paste URL → import) vs build
// from scratch. On submit it creates the store (identity + owner login) and lands on home.
// Renders bare (the workspace layout skips its shell for /admin/onboarding).

const CATEGORIES = [
 { id: "vintage", label: "Vintage" },
 { id: "designer", label: "Designer / luxury" },
 { id: "streetwear", label: "Streetwear" },
 { id: "y2k", label: "Y2K" },
 { id: "denim", label: "Denim" },
 { id: "mixed", label: "A mix" },
];
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

const ACCENT = "#0e9f76";

export default function OnboardingWizard() {
 const router = useRouter();
 const [step, setStep] = useState(0);
 const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
 const [websiteUrl, setWebsiteUrl] = useState("");
 const [category, setCategory] = useState<string | null>(null);
 const [channel, setChannel] = useState<string | null>(null);
 const [name, setName] = useState("");
 const [busy, setBusy] = useState(false);
 const [importing, setImporting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const handle = useMemo(() => slugify(name) || "your-store", [name]);
 const TOTAL = 4;

 const canContinue = () => {
  if (step === 0) return hasWebsite === false || (hasWebsite === true && websiteUrl.trim().length > 3);
  if (step === 1) return !!category;
  if (step === 2) return !!channel;
  if (step === 3) return name.trim().length >= 2;
  return false;
 };

 const next = () => { setError(null); if (step < TOTAL - 1) setStep((s) => s + 1); else submit(); };
 const back = () => { setError(null); setStep((s) => Math.max(0, s - 1)); };

 async function submit() {
  setBusy(true); setError(null);
  try {
   const res = await fetch("/api/store/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), hasWebsite, websiteUrl: websiteUrl.trim() || null, sellsCategory: category, sellsChannel: channel }),
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok) { setError(data?.error || "Something went wrong — try again."); setBusy(false); return; }
   // Brought an existing site → kick off the import now so their products + pages are waiting
   // when they land. If it fails, don't strand them on an empty home — route to the
   // Bring-your-site page, which has the full import + retry UI.
   if (data?.hasWebsite && data?.websiteUrl) {
    setImporting(true);
    const cap = await fetch("/api/store/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.websiteUrl }) }).catch(() => null);
    if (!cap || !cap.ok) { router.replace("/admin/import?from=onboarding"); return; }
    router.replace("/admin/home");
    return;
   }
   // Build from scratch → the guided design wizard (vibe → template → pages → colours → fonts).
   router.replace("/admin/onboarding/build");
  } catch {
   setError("Network error — try again."); setBusy(false); setImporting(false);
  }
 }

 return (
  <div className="min-h-screen bg-[#f7f6f3] text-stone-900" style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
   <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet" />

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
      <Section title="What do you mostly sell?" sub="Tunes your pricing tool and category defaults.">
       <ChipGrid options={CATEGORIES} value={category} onPick={setCategory} />
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
       <p className="mt-2.5 text-[13px] text-stone-400">Your storefront: <span className="font-medium text-stone-600">getvya.ai/s/{handle}</span></p>
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
      {busy ? (importing ? "Bringing your site over…" : "Creating…") : step === TOTAL - 1 ? "Create store" : "Continue"}
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
