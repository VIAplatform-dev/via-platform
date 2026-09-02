"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, Hammer, ArrowRight, Loader2 } from "lucide-react";
import { BuildWizardInner } from "./build/page";

// The signup wizard for a self-onboarded store.
//
// ONE question, then the real builder. It used to ask four — website, what you sell, where you
// sell now, store name — and only then hand off to a SEPARATE build wizard by navigating to
// /admin/onboarding/build. That was two wizards bolted together, and the first one asked a seller
// to describe their inventory before they had seen a single thing.
//
// Now the only question is the fork the whole thing hangs on: bring an existing site, or build
// one. Building drops straight into the Squarespace-style builder, rendered INLINE — the same
// component /admin/onboarding/build serves, so there is one builder, not two. The store NAME is
// asked there, on the Look step, next to the logo and the template.
//
// WHY THE STORE IS CREATED AT THE END, NOT HERE: the slug is derived from the name
// (generateUniqueSlug) and creation is idempotent, so a store created up front with a placeholder
// name would lock in a wrong permanent address that renaming can't fix. The builder calls back
// through onBeforeFinish with the real name at the moment it needs a store to write to.
//
// Renders bare (the workspace layout skips its shell for /admin/onboarding).


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
 const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
 const [websiteUrl, setWebsiteUrl] = useState("");
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);
 // Check she's signed in BEFORE she does any work. The wizard used to let her choose a template,
 // pick pages, colours and fonts — and only then fail on the final button, which is where
 // "sign in first" came from on a page that never offered a sign-in. If there's no session she
 // goes to /login now and comes straight back here afterwards.
 const [checking, setChecking] = useState(true);
 useEffect(() => {
  let active = true;
  (async () => {
   const me = await fetch("/api/infrastructure/whoami").then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (!active) return;
   // Nobody signed in at all → the seller sign-in.
   if (!me || (!me.needsOnboarding && !me.slug && me.admin !== true)) {
    window.location.href = "/store/login?next=%2Fadmin%2Fonboarding";
    return;
   }
   // The OWNER is not signed out — she is signed in as VYA, and already has a workspace. Sending
   // her to the seller sign-in was an infinite loop: this page bounced her to /store/login, which
   // asked whoami, got a perfectly valid identity back, honoured ?next and returned her here.
   // Onboarding builds a SELLER's store; the owner's destination is her workspace.
   if (me.admin === true || me.slug) { window.location.href = "/admin/home"; return; }
   setChecking(false);
  })();
  return () => { active = false; };
 }, []);
 // Once they choose "build me one" the builder takes over the screen. State, not a route, so
 // there is no navigation between the question and seeing their store.
 const [building, setBuilding] = useState(false);
 // Brief "on its way out" state so the question can slide off before the builder replaces it.
 // Swapping them in the same frame reads as a glitch; 240ms of movement reads as a handoff.
 const [leaving, setLeaving] = useState(false);

 const canContinue = hasWebsite === false || (hasWebsite === true && websiteUrl.trim().length > 3);

 /** Build-from-scratch: no store yet, nothing to save — straight into the builder. */
 const startBuilding = () => {
  setError(null);
  setLeaving(true);
  // Matches .vya-step-out-left (260ms). Reduced-motion users get the same delay with no
  // movement, which is a beat of nothing rather than a jarring swap.
  window.setTimeout(() => setBuilding(true), 240);
 };

 /**
  * Create the store. Called by the builder through onBeforeFinish with the name typed on its
  * Look step, so the slug matches the name the seller actually chose.
  */

 /**
  * Wait until the workspace gate can actually SEE the new store before leaving this page.
  *
  * This is the bounce. Creating the store writes store_users, then the wizard navigated straight
  * into /admin — where the layout asks whoami, doesn't find the row yet, and sends her back here.
  * The import path papered over it with a sessionStorage breadcrumb and one 1.2s retry; the build
  * path had nothing at all, so it bounced every time.
  *
  * Waiting HERE is the honest fix: this is the only place that knows a store was just created, so
  * it's the only place that can wait for it rather than guess. ~8s is far longer than the write
  * needs and still finite, so a genuine failure surfaces instead of hanging.
  */
 async function waitForStore(): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
   const me = await fetch("/api/infrastructure/whoami", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
   if (me?.slug) return true;
   await new Promise((r) => setTimeout(r, 300 + i * 120));
  }
  return false;
 }

 async function createStore(name: string): Promise<boolean> {
  const res = await fetch("/api/store/onboarding", {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ name, hasWebsite: false, websiteUrl: null }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) {
   // Failures that used to look identical and read as "you're not logged in" to someone who
   // plainly was. Each now has a way forward instead of a dead end.
   if (data?.needsSignIn) { window.location.href = "/store/login?next=%2Fadmin%2Fonboarding"; return false; }
   setError(data?.error || "We couldn’t create your store — try again.");
   return false;
  }
  // Breadcrumb for the layout's own retry, and then WAIT here until the gate sees the store.
  try { sessionStorage.setItem("vya:just-onboarded", String(data?.slug || "1")); } catch { /* storage off */ }
  if (!(await waitForStore())) {
   setError("Your store was created, but it’s taking a moment to appear. Refresh in a few seconds.");
   return false;
  }
  return true;
 }

 /** Bring an existing site over: create the store from the domain, then import it. */
 async function importSite() {
  setBusy(true); setError(null);
  try {
   const finalName = nameFromDomain(websiteUrl);
   const res = await fetch("/api/store/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: finalName, hasWebsite: true, websiteUrl: websiteUrl.trim() }),
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok) {
    // Same two failures as the build path — an owner with no seller session, or no session at all.
    setBusy(false);
    if (data?.needsSignIn) { window.location.href = "/store/login?next=%2Fadmin%2Fonboarding"; return; }
    setError(data?.error || "Something went wrong — try again.");
    return;
   }
   // The workspace gate (whoami) reads store_users; the row was written a moment ago. Leave a
   // breadcrumb so the gate retries instead of bouncing a brand-new seller back into this wizard.
   try { sessionStorage.setItem("vya:just-onboarded", String(data?.slug || "1")); } catch { /* storage off */ }
   // Same wait as the build path — the import screen lives inside the workspace, so the gate has
   // to see the store before we go there or she lands back on this wizard.
   await waitForStore();
   const importUrl = /^https?:\/\//i.test(websiteUrl.trim()) ? websiteUrl.trim() : `https://${websiteUrl.trim()}`;
   // If the import fails/blocks, route to the Bring-your-site page WITH the reason + URL, not an empty editor.
   const cap = await fetch("/api/store/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: importUrl, replaceBlocks: true }) }).catch(() => null);
   const capData = cap ? await cap.json().catch(() => null) : null;
   if (!cap || !cap.ok) {
    const msg = capData?.error || "We couldn’t bring that site over — try again or check the URL.";
    router.replace(`/admin/import?from=onboarding&err=${encodeURIComponent(msg)}&url=${encodeURIComponent(importUrl)}`);
    return;
   }
   router.replace("/admin/storefront?welcome=import");
  } catch {
   setError("Network error — try again."); setBusy(false);
  }
 }

 // The builder owns the screen from here — same component /admin/onboarding/build renders, so
 // there is one builder and one set of steps, not a second copy that drifts.

 if (checking) {
  return <div className="grid min-h-screen place-items-center bg-[#f7f6f3] text-[13px] text-stone-400">One moment…</div>;
 }

 if (building) {
  return (
   <Suspense fallback={<div className="min-h-screen bg-[#f7f6f3]" />}>
    <div className="vya-panel-in fixed inset-0 z-[60]">
    <BuildWizardInner onBeforeFinish={createStore} />
    {/* createStore sets `error` and returns false, which stops the builder finishing — but this
        branch renders ONLY the builder, so that message had nowhere to appear. Pressing "Create my
        store" simply did nothing, with no way for the seller to find out why. Sits above the
        builder (z-[70]) because the builder is itself fixed and full-screen. */}
    {error && (
     <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4" role="alert" aria-live="assertive">
      <div className="flex max-w-md items-start gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 shadow-lg">
       <p className="text-[13px] leading-snug text-rose-700">{error}</p>
       <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 text-[12px] font-medium text-stone-400 hover:text-stone-700">Dismiss</button>
      </div>
     </div>
    )}
   </div>
   </Suspense>
  );
 }

 return (
  <div className="min-h-screen bg-[#f7f6f3] text-stone-900" style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
   <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet" />

   {/* Only the import path has anything to wait for — building goes straight to the builder. */}
   {busy && (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f7f6f3] px-6 text-center">
     <Loader2 size={30} className="animate-spin" style={{ color: ACCENT }} />
     <h2 className="mt-6 text-[22px] leading-tight text-stone-900" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>Bringing your site over</h2>
     <p className="mt-2 max-w-sm text-[14px] text-stone-500">Importing your products, photos, and pages — this can take a moment.</p>
    </div>
   )}

   <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6 py-10">
    <div className="flex items-center gap-2.5">
     <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/via-logo-mark.png" alt="VYA" className="h-[18px] w-[18px] object-contain" style={{ filter: "brightness(0) invert(1)" }} />
     </span>
     <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Set up your store</p>
    </div>

    <div className={`mt-12 flex-1 ${leaving ? "vya-step-out-left" : "vya-step-in-up"}`}>
     <Section title="Do you already have a website?" sub="We’ll either bring your existing site over, or build you a new one.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
       <ChoiceCard icon={<Globe size={20} />} label="Yes, I have one" desc="Paste the URL — we’ll import it" active={hasWebsite === true} onClick={() => setHasWebsite(true)} />
       <ChoiceCard icon={<Hammer size={20} />} label="No, let’s start from scratch" desc="Choose your design" active={hasWebsite === false} onClick={() => { setHasWebsite(false); setWebsiteUrl(""); }} />
      </div>
      {hasWebsite === true && (
       <div className="mt-5">
        <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Your website URL</label>
        <input
         autoFocus value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
         onKeyDown={(e) => { if (e.key === "Enter" && canContinue) importSite(); }}
         placeholder="yourstore.com"
         className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[color:var(--a)]"
         style={{ ["--a" as string]: ACCENT }}
        />
       </div>
      )}
     </Section>
    </div>

    {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

    <div className={`flex items-center justify-end border-t border-stone-200/70 pt-5 ${leaving ? "vya-step-out-left" : ""}`}>
     <button
      onClick={() => (hasWebsite === true ? importSite() : startBuilding())}
      disabled={!canContinue || busy || leaving}
      className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: ACCENT }}
     >
      {busy ? "Setting up…" : hasWebsite === true ? "Bring my site over" : "Next"}
      {!busy && <ArrowRight size={16} />}
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
