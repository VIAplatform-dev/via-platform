"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Activity } from "lucide-react";
import { Store, Sparkles, CreditCard, Truck, Receipt, Globe, Share2, Handshake, Users, Building2, MapPin, ScrollText, CalendarRange, CalendarClock, MessageCircle, ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { SETTINGS_GROUPS, sectionFor } from "./sections";
import { cn } from "../ui";

// Settings gets its own left rail, the way Shopify's does.
//
// Before this, a store's settings were scattered: payments and plan sat loose in the main sidebar,
// its domain hid under Storefront, its marketplaces under Cross-listing, and only tax and shipping
// were actually under Settings. Nothing was wrong individually; collectively there was no answer to
// "where do I change that?".
//
// The rail is always visible inside Settings, so a seller can see every section she has without
// going back out to look for it — which is the entire point of the pattern.

const INDEX_HREF: string = "/admin/settings";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
 Mail, Activity,
 Store, Sparkles, CreditCard, Truck, Receipt, Globe, Share2, Handshake, Users, Building2, MapPin, ScrollText, CalendarRange, CalendarClock, MessageCircle,
};


/**
 * VYA's own sections are hidden from sellers.
 *
 * "Who can open a store" is our list, not a shop's. A seller seeing it would be reading our front
 * door policy from inside their own settings.
 */
function useSettingsGroups() {
 const [isVyaOwner, setIsVyaOwner] = useState(false);
 useEffect(() => {
  fetch("/api/infrastructure/whoami")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => setIsVyaOwner(d?.admin === true))
   .catch(() => {});
 }, []);
 return SETTINGS_GROUPS
  .map((g) => ({ ...g, items: g.items.filter((i) => isVyaOwner || !i.vyaOnly) }))
  .filter((g) => g.items.length > 0);
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
 const groups = useSettingsGroups();
 const pathname = usePathname() || "";
 const current = sectionFor(pathname);
 const onIndex = !current;

 return (
  <div className="mx-auto flex w-full max-w-[1120px] gap-0 px-6 py-9 max-lg:flex-col max-lg:gap-4 max-lg:px-5 sm:px-8">
   {/* The rail. On small screens it collapses to a back link rather than eating the screen. */}
   <nav className="w-[188px] shrink-0 border-r border-stone-200/70 pr-6 max-lg:w-full max-lg:border-r-0 max-lg:pr-0" aria-label="Settings">
    <div className="max-lg:hidden">
     {groups.map((g) => (
      <div key={g.label} className="mb-5">
       <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-stone-400">{g.label}</p>
       {g.items.map((s) => {
        const Icon = ICONS[s.icon] ?? Store;
        const on = current?.href === s.href;
        return (
         <Link
          key={s.href}
          href={s.href}
          className={cn(
           "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
           on ? "bg-stone-900/[0.06] font-medium text-stone-900" : "text-stone-600 hover:bg-stone-900/[0.035] hover:text-stone-900",
          )}
          aria-current={on ? "page" : undefined}
         >
          <Icon size={14} className={on ? "text-stone-700" : "text-stone-400"} />
          {s.label}
         </Link>
        );
       })}
      </div>
     ))}
    </div>

    {/* Small screens: one way back to the index, which is where the full list lives. */}
    {!onIndex && (
     <Link href={INDEX_HREF} className="hidden items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900 max-lg:inline-flex">
      <ChevronLeft size={15} /> All settings
     </Link>
    )}
   </nav>

   <div className="min-w-0 flex-1 pl-8 max-lg:pl-0">{children}</div>
  </div>
 );
}
