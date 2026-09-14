"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { AdminHeader, TechCard, StatusPill, Toggle, cn } from "../../ui";
import { withStore } from "@/app/infrastructure/admin/market/ui";

// Saved pieces — whether a shopper can keep a list on this store's own storefront.
//
// A SWITCH AND NOT A DEFAULT. A heart says "come back for this", and on one-of-one vintage the shop
// cannot always keep that promise: the piece a shopper saved on Tuesday may be somebody else's by
// Friday. Some sellers want exactly that pull and some would rather not make the offer at all, so
// it is theirs to decide rather than ours to assume.
//
// Off does not delete anything. What shoppers have already saved stays where it is, so a seller who
// turns it off for a season and back on again has not thrown away her customers' lists.

export default function SavedPiecesSettingsPage() {
 const [on, setOn] = useState<boolean | null>(null);
 const [handle, setHandle] = useState<string>("");
 const [live, setLive] = useState(false);
 const [saved, setSaved] = useState(false);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
  fetch(withStore("/api/store/storefront"))
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => {
    if (!d?.settings) { setOn(false); return; }
    setOn(Boolean(d.settings.wishlistEnabled));
    setHandle(String(d.settings.handle || ""));
    setLive(Boolean(d.settings.enabled));
   })
   .catch(() => setOn(false));
 }, []);

 // Posted on change: one switch is not a form, and a Save button beside a single toggle is a step
 // that exists only to be forgotten. `wishlistEnabled` is the only key sent, so this cannot disturb
 // the handle, the accent colour or anything else the storefront editor owns.
 async function set(next: boolean) {
  const was = on;
  setOn(next);
  setError(null);
  const r = await fetch(withStore("/api/store/storefront"), {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ handle, wishlistEnabled: next }),
  }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (r?.settings) {
   setOn(Boolean(r.settings.wishlistEnabled));
   setSaved(true);
   setTimeout(() => setSaved(false), 1500);
  } else {
   setOn(was ?? false);
   setError("Couldn't save that. Try again.");
  }
 }

 if (on === null) {
  return (
   <>
    <AdminHeader eyebrow="Settings" title="Saved pieces" subtitle="Whether shoppers can keep a list on your storefront." />
    <p className="text-[13px] text-stone-400">Loading…</p>
   </>
  );
 }

 return (
  <>
   <AdminHeader
    eyebrow="Settings"
    title="Saved pieces"
    subtitle="Let people save pieces on your storefront and come back to them."
    actions={saved ? <StatusPill tone="live" dot>Saved</StatusPill> : undefined}
   />

   <div className="flex flex-col gap-4">
    <TechCard className={cn("flex items-start gap-3.5 p-5", on && "border-stone-200")}>
     <Heart size={20} className={cn("mt-0.5 shrink-0", on ? "fill-stone-700 text-stone-700" : "text-stone-400")} />
     <div className="min-w-0">
      <p className="text-[14px] font-medium text-stone-900">
       {on ? "Shoppers can save pieces" : "Saving is off"}
      </p>
      <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-stone-500">
       {on
        ? "A heart appears on every piece on your storefront. Tapping it asks the shopper to sign in to your shop, and their list is then theirs on any device."
        : "Turn this on to put a heart on every piece. Nothing is shown to shoppers until you do."}
      </p>
     </div>
    </TechCard>

    <TechCard className="p-5">
     <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">On your storefront</p>
     <div className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2.5">
       <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-stone-900">Let shoppers save pieces</p>
        <p className="mt-0.5 max-w-[46ch] text-[12.5px] leading-relaxed text-stone-500">
         Adds a heart to every piece, and a saved list they can open from your header.
        </p>
       </div>
       <div className="shrink-0">
        <Toggle on={on} onClick={() => void set(!on)} />
       </div>
      </div>
     </div>
     {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}
    </TechCard>

    <TechCard className="p-5">
     <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">What your shoppers get</p>
     <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed text-stone-600">
      <li>• They sign in to your shop to save — no password, just a link you email them.</li>
      <li>• Browsing stays anonymous. Only saving asks who they are.</li>
      <li>• Their list is on every device they sign in on, not stuck in one browser.</li>
      <li>• A piece that sells stays on their list, marked sold, rather than quietly disappearing.</li>
      <li>• They become your customer, not the marketplace's — the sign-in is to your shop alone.</li>
     </ul>
     <p className="mt-4 max-w-[62ch] text-[12.5px] leading-relaxed text-stone-500">
      You can see how many people have saved a piece on the piece itself, next to its views — and
      because they are signed in, those people are in your customer list.
     </p>
    </TechCard>

    {/* Saving happens on the storefront, so a store with none has nowhere for this to appear. Said
        plainly rather than left for her to discover after turning the switch on. */}
    {!live && (
     <TechCard className="border-amber-200 bg-amber-50 p-5">
      <p className="text-[13.5px] font-medium text-stone-900">Your storefront isn’t live yet</p>
      <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-stone-600">
       This switch is saved either way, and takes effect the moment your storefront goes live.
      </p>
     </TechCard>
    )}
   </div>
  </>
 );
}
