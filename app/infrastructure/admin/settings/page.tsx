"use client";

import Link from "next/link";
import { Store, Sparkles, CreditCard, Truck, Receipt, Globe, Share2, Handshake, Users, Building2, MapPin, ScrollText, ChevronRight } from "lucide-react";
import { SETTINGS_GROUPS } from "./sections";
import { AdminHeader, TechCard } from "../ui";

// The Settings landing page: every section a store has, in one list.
//
// It repeats the rail on purpose. The rail is for moving between sections once you're already in
// here; this is for the seller who doesn't yet know which section her question belongs to, which is
// most of them. That's why each row carries a line about what it's FOR rather than what it contains.

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
 Store, Sparkles, CreditCard, Truck, Receipt, Globe, Share2, Handshake, Users, Building2, MapPin, ScrollText,
};

export default function SettingsIndex() {
 return (
  <>
   <AdminHeader eyebrow="Your store" title="Settings" subtitle="Everything about how your store runs, in one place." />
   {SETTINGS_GROUPS.map((g) => (
    <div key={g.label} className="mb-6">
     <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-400">{g.label}</p>
     <TechCard className="overflow-hidden">
      <div className="divide-y divide-stone-100">
       {g.items.map((s) => {
        const Icon = ICONS[s.icon] ?? Store;
        return (
         <Link key={s.href} href={s.href} className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-stone-50/70">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100">
           <Icon size={16} className="text-stone-500" />
          </span>
          <span className="min-w-0 flex-1">
           <span className="block text-[14px] font-medium text-stone-800">{s.label}</span>
           <span className="block text-[12.5px] leading-relaxed text-stone-500">{s.blurb}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-stone-300" />
         </Link>
        );
       })}
      </div>
     </TechCard>
    </div>
   ))}
  </>
 );
}
