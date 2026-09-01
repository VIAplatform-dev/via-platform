"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Package, ShoppingBag, MessageCircle, Store, Plug, Users, Megaphone, Tag, CreditCard, BarChart3, Settings, Target, TrendingUp, Share2, Handshake, LayoutGrid, LogOut, Menu, X, Search, Sparkles, Gem, Camera, Plus, Receipt, Boxes, ClipboardList, SlidersHorizontal, type LucideIcon } from "lucide-react";
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
 match: [`${B}/add-listing`, `${B}/bulk-upload`], // keep Inventory active/expanded while adding listings
 children: [
 { href: `${B}/add-listing`, label: "Add listing" },
 { href: `${B}/bulk-upload`, label: "Bulk upload" },
 { href: `${B}/inventory/collections`, label: "Collections" },
 { href: `${B}/inventory/drafts`, label: "Drafts" },
 { href: `${B}/inventory/sold`, label: "Sold" },
 ],
 },
 { href: `${B}/cross-listing`, label: "Cross-listing", icon: Share2, match: [`${B}/cross-listing/analytics`], children: [{ href: `${B}/cross-listing`, label: "Listings" }, { href: `${B}/cross-listing/analytics`, label: "Analytics" }, { href: `${B}/cross-listing/settings`, label: "Marketplaces" }] },
 { href: `${B}/consignment`, label: "Consignment", icon: Handshake, children: [{ href: `${B}/consignment/consignors`, label: "Consignors" }, { href: `${B}/consignment/payouts`, label: "Payouts" }, { href: `${B}/consignment/settings`, label: "Settings" }] },
 { href: `${B}/orders`, label: "Orders", icon: ShoppingBag },
 { href: `${B}/inbox`, label: "Inbox", icon: MessageCircle },
 ],
 },
 {
 label: "Store",
 items: [
 {
 href: `${B}/storefront`, label: "Storefront", icon: Store,
 children: [{ href: `${B}/storefront/versions`, label: "Drafts" }, { href: `${B}/settings/domain`, label: "Your domain" }],
 },
 { href: `${B}/import`, label: "Bring your site", icon: Plug },
 {
 href: `${B}/customers`, label: "Customers", icon: Users,
 children: [{ href: `${B}/customers/buyers`, label: "Buyers" }, { href: `${B}/recovery`, label: "Cart recovery" }],
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
 { href: `${B}/dashboard`, label: "Analytics", icon: BarChart3 },
 {
 href: `${B}/settings`, label: "Settings", icon: Settings,
 children: [
   { href: `${B}/settings/general`, label: "General" },
   { href: `${B}/settings/plan`, label: "Plan & billing" },
   { href: `${B}/settings/payments`, label: "Payments" },
   { href: `${B}/settings/shipping`, label: "Shipping & duties" },
   { href: `${B}/settings/tax`, label: "Sales tax" },
  ],
 },
 ],
 },
 { label: "Platform", items: [
 { href: `${B}/trends`, label: "Trends", icon: TrendingUp },
 { href: `${B}/ai`, label: "AI accuracy", icon: Target },
 { href: `${B}/golden-review`, label: "Golden set", icon: Gem },
 ] },
];

// ── Market Mode ──────────────────────────────────────────────────────────────────────────────
// A temporary operating mode for selling in person. When ON (per store, server-persisted so every
// device agrees), the nav collapses to just what a market needs and a phone gets a bottom tab bar.
// Turning it off is instant and never touches a checkout in flight — those live on the server.
const M = `${B}/market`;
const MARKET_GROUPS: { label?: string; items: NavItem[] }[] = [
 { items: [{ href: M, label: "Market home", icon: Home }] },
 { label: "Sell", items: [
 { href: `${M}/find`, label: "Find item", icon: Camera },
 { href: `${M}/quick`, label: "Quick list", icon: Plus },
 { href: `${M}/sales`, label: "Sales today", icon: Receipt },
 ] },
 { label: "Inventory", items: [{ href: `${M}/inventory`, label: "At this market", icon: Boxes }, { href: `${M}/bring`, label: "Bring list", icon: ClipboardList }] },
 { label: "Market", items: [{ href: `${M}/setup`, label: "Setup", icon: SlidersHorizontal }, { href: `${B}/payments`, label: "Payments", icon: CreditCard }] },
];
const MARKET_TABS = [
 { href: M, label: "Home", icon: Home },
 { href: `${M}/find`, label: "Find", icon: Camera },
 { href: `${M}/quick`, label: "Quick list", icon: Plus },
 { href: `${M}/sales`, label: "Sales", icon: Receipt },
 { href: `${M}/inventory`, label: "Items", icon: Boxes },
 { href: `${M}/bring`, label: "Bring", icon: ClipboardList },
];

function withPreview(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

export default function InfrastructureLayout({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 const router = useRouter();
 const [ok, setOk] = useState<boolean | null>(null);
 const [navOpen, setNavOpen] = useState(false); // mobile drawer
 // "Bring your site" (import/connect) is a ONE-TIME setup step for a store — they do it at
 // onboarding and shouldn't be nagged to reconnect. So we hide it once a store is set up, but
 // keep it for the owner/internal admin (who re-syncs any store). isOwner = the workspace owner
 // (ADMIN_PASSWORD, i.e. via-admin), NOT a signed-in store partner.
 const [isOwner, setIsOwner] = useState(false);
 const [storeSetUp, setStoreSetUp] = useState(false);
 const [marketMode, setMarketMode] = useState<boolean | null>(null); // null = not loaded yet
 const [marketBusy, setMarketBusy] = useState(false);

 // The onboarding wizard lives at /admin/onboarding but is self-contained — it renders
 // WITHOUT the workspace shell and does its own auth, so we skip the gate below for it
 // (otherwise a store with no store-record yet would be stuck on the loading screen).
 const isOnboarding = pathname.endsWith("/admin/onboarding") || pathname.includes("/admin/onboarding/");

 useEffect(() => {
 if (isOnboarding) { setOk(true); return; }
 fetch("/api/infrastructure/whoami")
 .then(async (r) => {
 if (!r.ok) { setOk(false); return; }
 const data = await r.json().catch(() => ({}));
 // Signed in but not attached to a store yet → send them through the signup wizard. Unless they
 // JUST finished it: the store row is seconds old, so retry once before bouncing them backwards.
 if (data?.needsOnboarding) {
 let justOnboarded: string | null = null;
 try { justOnboarded = sessionStorage.getItem("vya:just-onboarded"); } catch { /* storage off */ }
 if (justOnboarded) {
 await new Promise((res) => setTimeout(res, 1200));
 const retry = await fetch("/api/infrastructure/whoami").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 try { sessionStorage.removeItem("vya:just-onboarded"); } catch { /* */ }
 if (retry && !retry.needsOnboarding) { setIsOwner(retry.admin === true); setOk(true); return; }
 }
 router.replace("/admin/onboarding"); return;
 }
 try { sessionStorage.removeItem("vya:just-onboarded"); } catch { /* */ }
 setIsOwner(data?.admin === true);
 setOk(true);
 fetch(withPreview("/api/store/market/mode")).then((m) => (m.ok ? m.json() : null)).then((m) => setMarketMode(Boolean(m?.enabled))).catch(() => setMarketMode(false));
 // For a store partner, check whether they've already set up (storefront live or listings)
 // so we can retire the one-time "Bring your site" step from their nav.
 if (data?.admin !== true) {
 fetch("/api/store/onboarding-status")
 .then((s) => (s.ok ? s.json() : null))
 .then((st) => setStoreSetUp(Boolean(st?.onboarded)))
 .catch(() => {});
 }
 })
 .catch(() => setOk(false));
 }, [isOnboarding, router]);

 // Hide the one-time import step for a set-up store; the owner always keeps it.
 const hideImport = !isOwner && storeSetUp;
 const normalGroups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => !(hideImport && n.href === `${B}/import`)) })).filter((g) => g.items.length > 0);
 const visibleGroups = marketMode ? MARKET_GROUPS : normalGroups;
 const inMarketArea = pathname === M || pathname.startsWith(M + "/");

 async function toggleMarketMode() {
 if (marketBusy || marketMode === null) return;
 const next = !marketMode;
 setMarketBusy(true);
 setMarketMode(next); // the nav swaps instantly; the server call makes every other device agree
 try {
 const r = await fetch(withPreview("/api/store/market/mode"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
 if (!r.ok) throw new Error();
 router.push(withPreview(next ? M : `${B}/home`));
 } catch {
 setMarketMode(!next);
 } finally { setMarketBusy(false); }
 }


 useEffect(() => {
 if (ok === false) router.replace("/admin/login?redirect=/admin");
 }, [ok, router]);

 // Render the wizard bare (no nav shell) when on the onboarding route.
 if (isOnboarding) return <>{children}</>;

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
 className="infra flex min-h-screen overflow-x-clip bg-[#f7f6f3] text-stone-900"
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
 <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{marketMode ? "Market Mode" : "Infrastructure"}</span>
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
 <p className="text-[13px] font-semibold tracking-tight text-stone-900">{marketMode ? "Market Mode" : "Infrastructure"}</p>
 <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone-400">
 <span className={`h-1.5 w-1.5 rounded-full ${marketMode ? "bg-[#5D0F17]" : "bg-[var(--accent-bright)]"}`} /> {marketMode ? "Selling in person" : "Owner workspace"}
 </p>
 </div>
 </div>
 {/* The Market Mode switch — the one control that changes what this whole shell is for. */}
 <button
 type="button"
 onClick={toggleMarketMode}
 disabled={marketMode === null || marketBusy}
 className={`mx-3 mb-3 flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${marketMode ? "border-[#5D0F17]/30 bg-[#5D0F17]/5" : "border-stone-200 bg-white hover:border-stone-300"}`}
 >
 <span>
 <span className="block text-[12.5px] font-semibold text-stone-900">Market Mode</span>
 <span className="block text-[10.5px] text-stone-500">{marketMode ? "On — tap to exit" : "Sell in person at a market"}</span>
 </span>
 <span aria-hidden className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition ${marketMode ? "bg-[#5D0F17]" : "bg-stone-200"}`}>
 <span className={`inline-block h-[17px] w-[17px] rounded-full bg-white shadow transition ${marketMode ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
 </span>
 </button>
 {/* Global search trigger — opens the ⌘K command bar */}
 <button
 onClick={() => window.dispatchEvent(new Event("vya:search"))}
 className="mx-3 mb-4 flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[12.5px] text-stone-400 transition hover:border-stone-300 hover:text-stone-600"
 >
 <Search size={14} /> <span className="flex-1 text-left">Search…</span>
 <kbd className="rounded border border-stone-200 px-1 font-mono text-[9.5px] leading-4">⌘K</kbd>
 </button>
 <nav className="flex-1" onClick={() => setNavOpen(false)}>
 {visibleGroups.map((g, gi) => (
 <div key={gi} className={gi === 0 ? "" : "mt-5"}>
 {g.label && <p className="px-3 pb-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.15em] text-stone-400">{g.label}</p>}
 <div className="space-y-0.5">
 {g.items.map((n) => {
 // Market home is the parent of every market route, so it only lights up on an exact hit.
 const active = (n.href === M ? pathname === M : within(n.href)) || (n.match?.some((m) => within(m)) ?? false);
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
 {/* min-w-0: a flex child's min-width defaults to its content's, which let a long unbreakable row push
 the whole page wider than a phone; clipping the root stops any stray overflow from adding a sideways scroll. */}
 <main className={`ml-0 min-w-0 flex-1 pt-14 md:ml-[228px] md:pt-0 ${marketMode && inMarketArea ? "pb-16 md:pb-0" : ""}`}>{children}</main>
 {/* Phone bottom tab bar — Market Mode is used one-handed at a table, so the core loop is thumb-reachable. */}
 {marketMode && inMarketArea && (
 <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
 {MARKET_TABS.map((t) => {
 const on = t.href === M ? pathname === M : within(t.href);
 const Icon = t.icon;
 return (
 <Link key={t.href} href={withPreview(t.href)} className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${on ? "text-stone-900" : "text-stone-400"}`}>
 <Icon size={22} strokeWidth={on ? 2.2 : 1.8} />{t.label}
 </Link>
 );
 })}
 </nav>
 )}
 {!marketMode && <Sidekick />}
 <CommandBar />
 </div>
 </>
 );
}
