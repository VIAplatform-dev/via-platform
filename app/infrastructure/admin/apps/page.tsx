import { AdminPage, AdminHeader, TechCard, StatusPill } from "../ui";
import { Mail, Megaphone, ShoppingBag, Instagram } from "lucide-react";

// Apps and integrations, paused.
//
// WHY THIS PAGE STILL EXISTS. The connections are on hold, so nothing here connects to anything and
// the forms are gone. The page stays because links to it do: the command bar, old bookmarks, an
// email a seller was sent in March. A dead link is worse than a page that says "not yet".
//
// THE WORK IS NOT DELETED. The Mailchimp OAuth, the Klaviyo key handling and the sync itself are
// all still in the tree behind /admin/apps/email and app/lib/esp-*. Only the way in is closed, so
// switching this back on is deleting this file rather than rebuilding a feature.
//
// NOTHING HERE IS CLICKABLE, deliberately. A greyed card that still navigates is a card a seller
// taps twice and then emails support about.

const SOON: { name: string; category: string; blurb: string; icon: typeof Mail }[] = [
 { name: "Mailchimp", category: "Email marketing", blurb: "Keep your Mailchimp list in step with your customers and what they bought." },
 { name: "Klaviyo", category: "Email marketing", blurb: "Keep your Klaviyo list in step with your customers and what they bought." },
 { name: "Instagram Shopping", category: "Social", blurb: "Put your pieces in Instagram and Facebook Shops." },
 { name: "Google Shopping", category: "Ads", blurb: "List your pieces in Google Shopping results." },
].map((a, i) => ({ ...a, icon: [Mail, Mail, Instagram, ShoppingBag][i] ?? Megaphone }));

export default function AppsPage() {
 return (
  <AdminPage className="max-w-3xl">
   <AdminHeader
    eyebrow="Settings · Apps & integrations"
    title="Apps & integrations"
    subtitle="Connecting outside tools is coming. Everything in VYA works without them."
   />

   <div className="mb-5 rounded-xl border border-stone-200/70 bg-stone-50/70 px-4 py-3 text-[12.5px] leading-relaxed text-stone-500">
    Your storefront, checkout, email campaigns and automations all run inside VYA. Nothing on this
    page is needed to sell.
   </div>

   <div className="grid gap-3 sm:grid-cols-2">
    {SOON.map((a) => (
     <TechCard key={a.name} className="relative flex flex-col overflow-hidden p-4">
      {/* The card is drawn normally and dimmed as one piece, so it reads as a real thing that is
          not ready rather than as a broken one. The pill stays sharp: it is the answer. */}
      <div className="pointer-events-none select-none opacity-40 blur-[0.4px]">
       <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-800 text-white">
         <a.icon size={18} />
        </span>
        <div>
         <p className="text-[14px] font-semibold text-stone-900">{a.name}</p>
         <p className="text-[11px] uppercase tracking-[0.08em] text-stone-400">{a.category}</p>
        </div>
       </div>
       <p className="mt-3 text-[12.5px] leading-relaxed text-stone-500">{a.blurb}</p>
      </div>
      <StatusPill tone="pending" className="absolute right-3 top-3">Coming soon</StatusPill>
     </TechCard>
    ))}
   </div>

   <p className="mt-5 text-[12px] leading-relaxed text-stone-400">
    We will tell you when these open up. Nothing you have set up changes in the meantime.
   </p>
  </AdminPage>
 );
}
