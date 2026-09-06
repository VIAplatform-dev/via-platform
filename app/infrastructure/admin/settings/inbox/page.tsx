"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Check } from "lucide-react";
import { AdminHeader, TechCard, StatusPill, Toggle, cn } from "../../ui";

// Messages & offers — the two ways a shopper can start a conversation.
//
// These switches used to live ONLY inside the Inbox page, which was fine until the Inbox itself
// started disappearing from the sidebar when both were off: a store could turn them off and have
// no way back on. Settings is where every other switch lives, so they live here too. The panel
// inside the Inbox still works; both write the same row.

type Settings = {
 messagingEnabled: boolean; offersEnabled: boolean; offersBinding: boolean;
 minOfferPct: number; notifyPhone: string | null; notifySms: boolean; smsAvailable?: boolean;
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
 return (
  <div className="flex items-start justify-between gap-6 border-t border-stone-100 py-3.5 first:border-t-0 first:pt-0">
   <div className="min-w-0">
    <p className="text-[13.5px] font-medium text-stone-900">{label}</p>
    {hint && <p className="mt-0.5 max-w-[46ch] text-[12.5px] leading-relaxed text-stone-500">{hint}</p>}
   </div>
   <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
 );
}

function Card({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
 return (
  <TechCard className="p-5">
   <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{title}</p>
   {blurb && <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-stone-500">{blurb}</p>}
   <div className="mt-4">{children}</div>
  </TechCard>
 );
}

export default function InboxSettingsPage() {
 const [s, setS] = useState<Settings | null>(null);
 const [saved, setSaved] = useState(false);

 useEffect(() => {
  fetch("/api/store/inbox-settings")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => { if (d?.settings) setS(d.settings); })
   .catch(() => {});
 }, []);

 // Saved on change, like the panel in the Inbox — these are single switches, not a form.
 async function set(patch: Partial<Settings>) {
  if (!s) return;
  setS({ ...s, ...patch });
  const r = await fetch("/api/store/inbox-settings", {
   method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (r?.settings) { setS({ ...r.settings, smsAvailable: s.smsAvailable }); setSaved(true); setTimeout(() => setSaved(false), 1500); }
 }

 if (!s) {
  return (
   <>
    <AdminHeader eyebrow="Settings" title="Messages & offers" subtitle="How shoppers reach you about a piece." />
    <p className="text-[13px] text-stone-400">Loading…</p>
   </>
  );
 }

 const bothOff = !s.messagingEnabled && !s.offersEnabled;

 return (
  <>
   <AdminHeader
    eyebrow="Settings"
    title="Messages & offers"
    subtitle="How people contact you about a piece, and whether they can make an offer."
    actions={saved ? <StatusPill tone="live" dot>Saved</StatusPill> : undefined}
   />

   <div className="flex flex-col gap-4">
    <TechCard className={cn("flex items-start gap-3.5 p-5", bothOff && "border-amber-200 bg-amber-50")}>
     <MessageCircle size={20} className={cn("mt-0.5 shrink-0", bothOff ? "text-amber-500" : "text-stone-400")} />
     <div className="min-w-0">
      <p className="text-[14px] font-medium text-stone-900">{bothOff ? "Your inbox is closed" : "Your inbox is open"}</p>
      <p className="mt-0.5 max-w-[58ch] text-[12.5px] leading-relaxed text-stone-500">
       {bothOff
        ? "With both off, shoppers can't message you or make an offer, and the Inbox is hidden from your sidebar. Turn either back on and it returns."
        : "Conversations and offers land in your Inbox. Anything already sent stays there even if you switch these off."}
      </p>
     </div>
    </TechCard>

    <Card title="Messages" blurb="Questions about a piece: measurements, condition, whether it still fits.">
     <Row label="Let shoppers message me" hint="Adds a message button to every product page.">
      <Toggle on={s.messagingEnabled} onClick={() => set({ messagingEnabled: !s.messagingEnabled })} />
     </Row>
     <Row
      label="Text me new messages"
      hint={s.smsAvailable === false
       ? "Not switched on yet — we'll start texting once it goes live. Your preference is saved."
       : "A text the moment a shopper writes, so you can answer fast."}
     >
      <Toggle on={s.notifySms} onClick={() => set({ notifySms: !s.notifySms })} />
     </Row>
     {s.notifySms && (
      <Row label="Text this number">
       <input
        defaultValue={s.notifyPhone || ""}
        onBlur={(e) => set({ notifyPhone: e.target.value.trim() || null })}
        placeholder="(555) 123-4567"
        inputMode="tel"
        className="w-44 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-stone-400"
       />
      </Row>
     )}
    </Card>

    <Card title="Offers" blurb="Let people name their price. You accept, counter, or pass.">
     <Row label="Take offers" hint="Adds an offer button next to Buy on every piece.">
      <Toggle on={s.offersEnabled} onClick={() => set({ offersEnabled: !s.offersEnabled })} />
     </Row>
     {s.offersEnabled && (
      <>
       <Row
        label="Accepting an offer is final"
        hint={s.offersBinding
         ? "Accepting reserves the piece and they check out at the agreed price."
         : "Accepting is a soft yes — the piece stays on sale until they pay."}
       >
        <Toggle on={s.offersBinding} onClick={() => set({ offersBinding: !s.offersBinding })} />
       </Row>
       <Row label="Don’t show me offers below" hint="As a percentage of the asking price. 0 means you see every offer.">
        <span className="flex items-center gap-1.5">
         <input
          inputMode="decimal"
          value={String(s.minOfferPct)}
          onChange={(e) => {
           const n = Number(e.target.value);
           set({ minOfferPct: Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 100) : 0 });
          }}
          className="w-16 rounded-lg border border-stone-200 px-2.5 py-1.5 text-right text-[13.5px] tabular-nums outline-none focus:border-stone-400"
         />
         <span className="text-[12.5px] text-stone-500">% of asking</span>
        </span>
       </Row>
      </>
     )}
    </Card>

    <p className="flex items-center gap-1.5 px-1 pb-2 text-[12px] text-stone-400">
     <Check size={13} /> Changes save as you make them.
    </p>
   </div>
  </>
 );
}
