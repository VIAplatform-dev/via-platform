"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Package, ShoppingBag, MessageCircle, Store, Plug, Users, Megaphone, Tag, CreditCard, BarChart3, Settings, Target, TrendingUp, Share2, Handshake, LayoutGrid, LogOut, Menu, X, Search, type LucideIcon } from "lucide-react";
import Sidekick from "@/app/store/Sidekick";
import CommandBar from "./CommandBar";

type Sub = { href: string; label: string };
type NavItem = { href: string; label: string; icon: LucideIcon; children?: Sub[]; match?: string[] };
const B = "/admin";
const GROUPS: { label?: string; items: NavItem[] }[] = [
 { items: [{ href: `${B}/home`, label: "Home", icon: Home }] },
 {
 label: "Sell",
 items: [
 {
 href: `${B}/inventory`, label: "Inventory", icon: Package,
 match: [`${B}/add-listing`], // keep Inventory active/expanded while adding a listing
 children: [
 { href: `${B}/add-listing`, label: "Add listing" },
 { href: `${B}/inventory/drafts`, label: "Drafts" },
 { href: `${B}/inventory/sold`, label: "Sold" },
 ],
 },
 { href: `${B}/cross-listing`, label: "Cross-listing", icon: Share2, children: [{ href: `${B}/cross-listing/settings`, label: "Marketplaces" }] },
 { href: `${B}/consignment`, label: "Consignment", icon: Handshake, children: [{ href: `${B}/consignment/consignors`, label: "Consignors" }, { href: `${B}/consignment/payouts`, label: "Payouts" }, { href: `${B}/consignment/settings`, label: "Settings" }] },
 { href: `${B}/orders`, label: "Orders", icon: ShoppingBag },
 { href: `${B}/inbox`, label: "Inbox", icon: MessageCircle },
 ],
 },
 {
 label: "Store",
 items: [
 { href: `${B}/storefront`, label: "Storefront", icon: Store },
 { href: `${B}/import`, label: "Bring your site", icon: Plug },
 {
 href: `${B}/customers`, label: "Customers", icon: Users,
 children: [{ href: `${B}/customers/buyers`, label: "Buyers" }],
 },
 {
 href: `${B}/marketing`, label: "Marketing", icon: Megaphone,
 children: [
 { href: `${B}/marketing/campaigns`, label: "Campaigns" },
 { href: `${B}/marketing/design`, label: "Email design" },
 { href: `${B}/marketing/share-links`, label: "Share links" },
 { href: `${B}/instagram`, label: "Instagram" },
 { href: `${B}/marketing/automations`, label: "Automations" },
 ],
 },
 { href: `${B}/discounts`, label: "Discounts", icon: Tag },
 ],
 },
 { label: "Apps", items: [{ href: `${B}/apps`, label: "Apps & integrations", icon: LayoutGrid }] },
 {
 label: "Business",
 items: [
 { href: `${B}/payments`, label: "Payments", icon: CreditCard },
 { href: `${B}/dashboard`, label: "Analytics", icon: BarChart3 },
 { href: `${B}/settings`, label: "Settings", icon: Settings },
 ],
 },
 { label: "Platform", items: [
 { href: `${B}/trends`, label: "Trends", icon: TrendingUp },
 { href: `${B}/ai`, label: "AI accuracy", icon: Target },
 ] },
];

export default function InfrastructureLayout({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 const router = useRouter();
 const [ok, setOk] = useState<boolean | null>(null);
 const [navOpen, setNavOpen] = useState(false); // mobile drawer

 useEffect(() => {
 fetch("/api/infrastructure/whoami").then((r) => setOk(r.ok)).catch(() => setOk(false));
 }, []);


 useEffect(() => {
 if (ok === false) router.replace("/admin/login?redirect=/admin");
 }, [ok, router]);

 if (ok !== true) {
 return <div className="flex min-h-screen items-center justify-center text-sm text-stone-400">{ok === false ? "Redirecting…" : "Loading…"}</div>;
 }

 const within = (href: string) => pathname === href || pathname.startsWith(href + "/");

 return (
 <>
 {/* Brand type — Hanken Grotesk for UI, Newsreader for editorial display numbers/headings. */}
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
 <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet" />
 <div
 className="infra flex min-h-screen bg-[#f7f6f3] text-stone-900"
 style={{
 fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
 // Green accent theme, scoped to the admin — the shared @/app/store/ui components pick these up
 // via var(--accent,…); the seller /store portal has no override, so it keeps its wine accent.
 ["--accent" as string]: "#0e9f76",
 ["--accent-hover" as string]: "#0b8a66",
 ["--accent-bright" as string]: "#2fd39b",
 ["--accent-soft" as string]: "#eafaf3",
 ["--accent-ink" as string]: "#0b7a5c",
 ["--font-display" as string]: "'Newsreader', Georgia, 'Times New Roman', serif",
 } as React.CSSProperties}
 >
 {/* Mobile top bar — hamburger opens the drawer */}
 <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
 <button onClick={() => setNavOpen(true)} aria-label="Open menu" className="text-stone-600"><Menu size={20} /></button>
 <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Infrastructure</span>
 </div>
 {/* Backdrop when the mobile drawer is open */}
 {navOpen && <div onClick={() => setNavOpen(false)} className="fixed inset-0 z-40 bg-black/30 md:hidden" aria-hidden="true" />}
 <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[228px] flex-col overflow-y-auto border-r border-stone-200/70 bg-white px-3 py-5 transition-transform duration-200 md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
 <button onClick={() => setNavOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 text-stone-400 hover:text-stone-600 md:hidden"><X size={18} /></button>
 <div className="flex items-center gap-2.5 px-3 pb-5">
 <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900">
 {/* VYA mark — the maroon asset flipped to white for the dark badge. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/via-logo-mark.png" alt="VYA" className="h-[18px] w-[18px] object-contain" style={{ filter: "brightness(0) invert(1)" }} />
 </span>
 <div className="leading-tight">
 <p className="text-[13px] font-semibold tracking-tight text-stone-900">Infrastructure</p>
 <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone-400">
 <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-bright)]" /> Owner workspace
 </p>
 </div>
 </div>
 {/* Global search trigger — opens the ⌘K command bar */}
 <button
 onClick={() => window.dispatchEvent(new Event("vya:search"))}
 className="mx-3 mb-4 flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[12.5px] text-stone-400 transition hover:border-stone-300 hover:text-stone-600"
 >
 <Search size={14} /> <span className="flex-1 text-left">Search…</span>
 <kbd className="rounded border border-stone-200 px-1 font-mono text-[9.5px] leading-4">⌘K</kbd>
 </button>
 <nav className="flex-1" onClick={() => setNavOpen(false)}>
 {GROUPS.map((g, gi) => (
 <div key={gi} className={gi === 0 ? "" : "mt-5"}>
 {g.label && <p className="px-3 pb-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.15em] text-stone-400">{g.label}</p>}
 <div className="space-y-0.5">
 {g.items.map((n) => {
 const active = within(n.href) || (n.match?.some((m) => within(m)) ?? false);
 const Icon = n.icon;
 return (
 <div key={n.href}>
 <Link
 href={n.href}
 className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${active ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-ink)]" : "text-stone-600 hover:bg-stone-100/70"}`}
 >
 {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />}
 <Icon size={16} strokeWidth={1.9} className={active ? "text-[var(--accent)]" : "text-stone-400 group-hover:text-stone-500"} />
 {n.label}
 </Link>
 {/* Sub-tabs: revealed when the section is active. */}
 {n.children && active && (
 <div className="mb-1 ml-[30px] mt-0.5 space-y-0.5 border-l border-stone-200 pl-2">
 {n.children.map((c) => {
 const on = pathname === c.href;
 return (
 <Link key={c.href} href={c.href} className={`block rounded-md px-2.5 py-1.5 text-[12.5px] transition ${on ? "font-medium text-[var(--accent-ink)]" : "text-stone-500 hover:text-stone-900"}`}>
 {c.label}
 </Link>
 );
 })}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </nav>
 <div className="mt-3 border-t border-stone-100 pt-3">
 <Link href="/admin" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-stone-400 hover:bg-stone-100 hover:text-stone-600">
 <LogOut size={15} strokeWidth={1.75} /> Marketplace admin
 </Link>
 </div>
 </aside>
 <main className="ml-0 flex-1 pt-14 md:ml-[228px] md:pt-0">{children}</main>
 <Sidekick />
 <CommandBar />
 </div>
 </>
 );
}
