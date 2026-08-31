"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import StoreMessages from "./StoreMessages";
import HostedStoreReview from "./HostedStoreReview";
import HostedStoreEntry from "./HostedStoreEntry";
import {
 LayoutDashboard,
 BarChart3,
 Heart,
 LogOut,
 ShoppingBag,
 Search,
 MessageSquareText,
 Sparkles,
 ClipboardCheck,
 Globe,
} from "lucide-react";

// "3h ago" style relative time for the activity feed.
function timeAgo(iso: string): string {
 const diff = Date.now() - new Date(iso).getTime();
 const m = Math.floor(diff / 60000);
 if (m < 1) return "just now";
 if (m < 60) return `${m}m ago`;
 const h = Math.floor(m / 60);
 if (h < 24) return `${h}h ago`;
 const d = Math.floor(h / 24);
 return `${d}d ago`;
}

type StoreInfo = {
 storeSlug: string;
 storeName: string;
 location: string;
 currency: string;
 website: string;
 logo: string;
 logoBg: string;
 commissionType: "shopify-collabs" | "squarespace-manual" | "square-manual" | "custom-webhook";
 commissionRates?: { upTo?: number; rate: number }[];
 totalInventoryValue: number;
 viaCommissionPotential: number;
 storeFollowers: number;
 topFavoritedProducts: { title: string; price: number; favoriteCount: number }[];
 pendingOnboarding?: boolean;
};

type Analytics = {
 totalClicks: number;
 totalViews?: number;
 totalConversions: number;
 totalRevenue: number;
 aov?: number;
 commissionEarned?: number;
 commissionSource?: string;
 cartItems?: { productId: number; title: string; image: string | null; price: number; currency: string; inCarts: number }[];
 cartCount?: number;
 cartValue?: number;
 topProducts: { name: string; count: number }[];
 topSearches?: { query: string; count: number }[];
 sales?: {
 conversionId: string;
 timestamp: string;
 orderId: string;
 items: { name: string; quantity: number }[];
 customerEmail: string | null;
 orderTotal: number;
 currency: string;
 commission: number;
 }[];
 range: string;
};

type QualityProduct = { id: number; title: string; url: string; noSizing: boolean; noDescription: boolean; noImage: boolean };
type ListingQuality = { total: number; flagged: number; noSizing: number; noDescription: number; noImage: number; products: QualityProduct[] };
type ActivityItem = { type: "favorite" | "cart" | "sale"; title: string; at: string };
type Extras = { listing: ListingQuality | null; activity: ActivityItem[] };

type RangeOption = "7d" | "30d" | "all";
type Tab = "overview" | "performance" | "audience" | "listing" | "messages" | "hosted";

const DEFAULT_RATES: { upTo?: number; rate: number }[] = [
 { upTo: 1000, rate: 0.07 },
 { upTo: 5000, rate: 0.05 },
 { rate: 0.03 },
];

function commissionTiersLabel(rates?: { upTo?: number; rate: number }[]): string {
 return (rates ?? DEFAULT_RATES)
 .map((t, i, arr) => {
 const pct = `${Math.round(t.rate * 100)}%`;
 if (i === 0 && t.upTo) return `${pct} under $${(t.upTo / 1000).toFixed(0)}k`;
 if (t.upTo) return `${pct} $${(arr[i - 1]?.upTo ?? 0) / 1000}k–$${t.upTo / 1000}k`;
 return `${pct} above`;
 })
 .join(" · ");
}

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
 { id: "overview", label: "Overview", icon: LayoutDashboard },
 { id: "performance", label: "Performance", icon: BarChart3 },
 { id: "audience", label: "Audience", icon: Heart },
 { id: "listing", label: "Listing Health", icon: ClipboardCheck },
 { id: "messages", label: "Messages", icon: MessageSquareText },
 { id: "hosted", label: "Hosted Store", icon: Globe },
];

const TAB_META: Record<Tab, { title: string; subtitle: string }> = {
 overview: { title: "Overview", subtitle: "A snapshot of your store on VYA." },
 performance: { title: "Performance", subtitle: "How shoppers are engaging with your pieces." },
 audience: { title: "Audience", subtitle: "The community following and saving your work." },
 listing: { title: "Listing Health", subtitle: "Listings missing details that help pieces sell." },
 messages: { title: "Messages", subtitle: "Questions from shoppers about your pieces." },
 hosted: { title: "Hosted Store", subtitle: "Your VYA-hosted copy — open it, edit any page, and check it against your own site." },
};

const FEEDBACK_URL = "https://form.typeform.com/to/L13186Wp";

// ── Small presentational pieces ─────────────────────────────────────────────

function VerifiedMark() {
 return (
 <Link href="/trust" className="group/badge mt-0.5 inline-flex items-center gap-1">
 <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#5D0F17]">
 <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="#FFFDF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="2,5.2 4.2,7.5 8,3" />
 </svg>
 </span>
 <span className="text-[10px] uppercase tracking-[0.14em] text-[#5D0F17]/45 transition-colors group-hover/badge:text-[#5D0F17]">
 Verified Seller
 </span>
 </Link>
 );
}

function StoreAvatar({ store, size = 40 }: { store: StoreInfo; size?: number }) {
 return (
 <div
 className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#5D0F17]/10"
 style={{ width: size, height: size, background: store.logoBg || "#FFFDF8" }}
 >
 {store.logo ? (
 <Image src={store.logo} alt={store.storeName} width={size} height={size} className="object-contain" style={{ width: size, height: size }} />
 ) : (
 <span className="font-serif text-[#5D0F17]">{store.storeName.charAt(0)}</span>
 )}
 </div>
 );
}

function StatCard({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
 return (
 <div className="rounded-2xl border border-[#5D0F17]/10 bg-white p-6">
 <p className="font-serif text-[28px] leading-none text-[#5D0F17]">{value}</p>
 <p className="mt-2.5 text-[11px] uppercase tracking-[0.12em] text-[#5D0F17]/50">{label}</p>
 {hint && <p className="mt-1 text-[11px] leading-snug text-[#5D0F17]/40">{hint}</p>}
 </div>
 );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
 return (
 <div className="overflow-hidden rounded-2xl border border-[#5D0F17]/10 bg-white">
 <div className="border-b border-[#5D0F17]/[0.07] px-6 py-4">
 <h3 className="font-serif text-lg text-[#5D0F17]">{title}</h3>
 </div>
 {children}
 </div>
 );
}

function RangeToggle({ range, onChange }: { range: RangeOption; onChange: (r: RangeOption) => void }) {
 return (
 <div className="flex gap-1 rounded-full border border-[#5D0F17]/10 bg-white p-1">
 {(["7d", "30d", "all"] as RangeOption[]).map((r) => (
 <button
 key={r}
 onClick={() => onChange(r)}
 className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.08em] transition-colors ${
 range === r ? "bg-[#5D0F17] text-[#FFFDF8]" : "text-[#5D0F17]/55 hover:text-[#5D0F17]"
 }`}
 >
 {r === "all" ? "All time" : r}
 </button>
 ))}
 </div>
 );
}

function StoreDashboardInner() {
 const router = useRouter();
 const searchParams = useSearchParams();
 // Admin preview: /store/dashboard?store=<slug> shows that store's portal exactly
 // as the seller sees it (the API gates this on admin auth). Thread the param
 // through every fetch so all panels reflect the same store.
 const previewStore = searchParams.get("store");
 const withStore = useCallback(
 (path: string) => (previewStore ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(previewStore)}` : path),
 [previewStore],
 );
 const [store, setStore] = useState<StoreInfo | null>(null);
 const [analytics, setAnalytics] = useState<Analytics | null>(null);
 const [extras, setExtras] = useState<Extras | null>(null);
 const [range, setRange] = useState<RangeOption>("all");
 const [loadingInitial, setLoadingInitial] = useState(true);
 const [tab, setTab] = useState<Tab>("overview");

 const fetchAnalytics = useCallback(async (r: RangeOption) => {
 const res = await fetch(withStore(`/api/store/analytics?range=${r}`));
 if (res.ok) setAnalytics(await res.json());
 }, [withStore]);

 useEffect(() => {
 async function init() {
 const [meRes, analyticsRes, extrasRes] = await Promise.all([
 fetch(withStore("/api/store/me")),
 fetch(withStore(`/api/store/analytics?range=${range}`)),
 fetch(withStore("/api/store/extras")),
 ]);
 if (!meRes.ok) {
 // In admin preview, a failed load means missing/invalid admin auth, not a
 // logged-out seller — don't bounce to the store login.
 if (!previewStore) router.replace("/store/login");
 setLoadingInitial(false);
 return;
 }
 const [storeData, analyticsData, extrasData] = await Promise.all([
 meRes.json(),
 analyticsRes.ok ? analyticsRes.json() : null,
 extrasRes.ok ? extrasRes.json() : null,
 ]);
 setStore({ storeFollowers: 0, topFavoritedProducts: [], ...storeData });
 setAnalytics(analyticsData);
 setExtras(extrasData);
 setLoadingInitial(false);
 }
 init();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 async function handleRangeChange(newRange: RangeOption) {
 setRange(newRange);
 await fetchAnalytics(newRange);
 }

 if (loadingInitial) {
 return (
 <div className="flex min-h-screen items-center justify-center bg-[#FBF8F1]">
 <p className="text-sm text-[#5D0F17]/50">Loading…</p>
 </div>
 );
 }
 if (!store) return null;

 const totalLikes = store.topFavoritedProducts.reduce((sum, p) => sum + p.favoriteCount, 0);
 const mostLiked = store.topFavoritedProducts[0];

 // ── Sidebar ──
 const sidebar = (
 <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-[#5D0F17]/10 bg-[#FFFDF8] px-3 py-6 md:flex">
 <div className="px-3 pb-6">
 <p className="font-logo text-2xl leading-none tracking-wide text-[#5D0F17]">VYA</p>
 <p className="mt-1.5 text-[10px] uppercase tracking-[0.22em] text-[#5D0F17]/40">Partner Portal</p>
 </div>

 <div className="flex items-center gap-3 rounded-2xl border border-[#5D0F17]/10 bg-white px-3 py-3">
 <StoreAvatar store={store} size={38} />
 <div className="min-w-0">
 <p className="truncate font-serif text-[15px] leading-tight text-[#5D0F17]">{store.storeName}</p>
 <VerifiedMark />
 </div>
 </div>

 <nav className="mt-6 space-y-1">
 {!store.pendingOnboarding &&
 NAV.map((item) => {
 const Icon = item.icon;
 const active = tab === item.id;
 return (
 <button
 key={item.id}
 onClick={() => setTab(item.id)}
 className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
 active ? "bg-[#5D0F17]/[0.07] font-medium text-[#5D0F17]" : "text-[#5D0F17]/55 hover:bg-[#5D0F17]/[0.04] hover:text-[#5D0F17]"
 }`}
 >
 <Icon size={17} strokeWidth={1.8} />
 <span>{item.label}</span>
 </button>
 );
 })}
 </nav>

 <div className="mt-auto space-y-3 px-1 pt-6">
 <a
 href={FEEDBACK_URL}
 target="_blank"
 rel="noopener noreferrer"
 className="block rounded-xl border border-[#5D0F17]/10 bg-white p-3.5 transition-colors hover:border-[#5D0F17]/25"
 >
 <div className="flex items-center gap-2 text-[#5D0F17]">
 <MessageSquareText size={15} strokeWidth={1.8} />
 <span className="text-xs font-medium">Share feedback</span>
 </div>
 <p className="mt-1 text-[11px] leading-snug text-[#5D0F17]/45">Help us improve VYA. Always anonymous.</p>
 </a>
 <button
 onClick={() => signOut({ callbackUrl: "/store/login" })}
 className="flex items-center gap-2 px-2 text-[11px] uppercase tracking-[0.1em] text-[#5D0F17]/50 transition-colors hover:text-[#5D0F17]"
 >
 <LogOut size={14} strokeWidth={1.8} /> Sign out
 </button>
 </div>
 </aside>
 );

 // ── Mobile header (sidebar is hidden < md) ──
 const mobileHeader = (
 <div className="flex items-center justify-between border-b border-[#5D0F17]/10 px-5 py-4 md:hidden">
 <div className="flex items-center gap-2.5">
 <StoreAvatar store={store} size={32} />
 <div>
 <p className="font-serif text-sm leading-tight text-[#5D0F17]">{store.storeName}</p>
 <VerifiedMark />
 </div>
 </div>
 <button
 onClick={() => signOut({ callbackUrl: "/store/login" })}
 className="text-[11px] uppercase tracking-[0.1em] text-[#5D0F17]/50"
 >
 Sign out
 </button>
 </div>
 );

 // ── Admin preview banner ── shown when an admin is viewing a store's portal.
 const previewBanner = previewStore && (
 <div className="flex flex-wrap items-center justify-between gap-2 bg-[#5D0F17] px-5 py-2.5 text-[#FFFDF8] md:px-9">
 <p className="text-[12px] tracking-[0.02em]">
 <span className="uppercase tracking-[0.14em] opacity-70">Admin preview</span>
 <span className="mx-2 opacity-40">·</span>
 Viewing <strong className="font-medium">{store.storeName}</strong>’s dashboard exactly as the store sees it
 </p>
 <Link href="/admin/stores" className="text-[11px] uppercase tracking-[0.1em] underline decoration-[#FFFDF8]/40 underline-offset-2 hover:decoration-[#FFFDF8]">
 Back to admin
 </Link>
 </div>
 );

 const mobileTabs = !store.pendingOnboarding && (
 <div className="flex gap-2 overflow-x-auto border-b border-[#5D0F17]/10 px-5 py-3 md:hidden">
 {NAV.map((item) => (
 <button
 key={item.id}
 onClick={() => setTab(item.id)}
 className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition-colors ${
 tab === item.id ? "bg-[#5D0F17] text-[#FFFDF8]" : "border border-[#5D0F17]/15 text-[#5D0F17]/60"
 }`}
 >
 {item.label}
 </button>
 ))}
 </div>
 );

 // ── Pending onboarding — clean welcome, no sourcing ──
 if (store.pendingOnboarding) {
 return (
 <div className="min-h-screen bg-[#FBF8F1] text-[#5D0F17]">
 <div className="mx-auto flex min-h-screen max-w-[1240px]">
 {sidebar}
 <main className="min-w-0 flex-1">
 {previewBanner}
 {mobileHeader}
 <div className="mx-auto max-w-2xl px-6 py-20 text-center">
 <p className="font-serif text-3xl text-[#5D0F17]">Welcome to VYA</p>
 <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#5D0F17]/55">
 Your store is being set up. Once your catalog is live, your dashboard will fill with
 audience and performance insights — views, saves, conversions, and commission.
 </p>
 <a
 href={FEEDBACK_URL}
 target="_blank"
 rel="noopener noreferrer"
 className="mt-8 inline-block rounded-full bg-[#5D0F17] px-7 py-3 text-xs uppercase tracking-[0.1em] text-[#FFFDF8] transition-opacity hover:opacity-90"
 >
 Share feedback
 </a>
 </div>
 </main>
 </div>
 </div>
 );
 }

 const meta = TAB_META[tab];
 const rangeLabel = range === "all" ? "all time" : `last ${range}`;

 return (
 <div className="min-h-screen bg-[#FBF8F1] text-[#5D0F17]">
 <div className="mx-auto flex min-h-screen max-w-[1240px]">
 {sidebar}

 <main className="min-w-0 flex-1">
 {previewBanner}
 {mobileHeader}
 {mobileTabs}

 {/* Top bar */}
 <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-6 md:px-9 md:py-7">
 <div>
 <h1 className="font-serif text-[26px] leading-tight text-[#5D0F17] md:text-[28px]">{meta.title}</h1>
 <p className="mt-1 text-sm text-[#5D0F17]/50">{meta.subtitle}</p>
 </div>
 <div className="flex items-center gap-4">
 {tab === "performance" && <RangeToggle range={range} onChange={handleRangeChange} />}
 <div className="hidden items-center gap-2.5 lg:flex">
 <StoreAvatar store={store} size={34} />
 <span className="text-sm text-[#5D0F17]/70">{store.location}</span>
 </div>
 </div>
 </div>

 <div className="px-6 pb-16 md:px-9">
 {/* ── MESSAGES ── */}
 {tab === "messages" && <StoreMessages previewStore={previewStore} />}
 {tab === "hosted" && (
 <div className="space-y-10">
 {/* The way in to the editor comes FIRST: "here is your hosted store and how to change it",
     before the side-by-side check of whether it came over correctly. */}
 <HostedStoreEntry previewStore={previewStore} />
 <div id="hosted-review">
 <HostedStoreReview previewStore={previewStore} />
 </div>
 </div>
 )}

 {/* ── OVERVIEW ── */}
 {tab === "overview" && (
 <div className="space-y-8">
 <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
 <StatCard value={`$${(analytics?.totalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} label={`Revenue · ${rangeLabel}`} />
 <StatCard value={(analytics?.totalConversions ?? 0).toLocaleString()} label={`Conversions · ${rangeLabel}`} />
 <StatCard value={store.storeFollowers.toLocaleString()} label="Store followers" />
 <StatCard value={totalLikes.toLocaleString()} label="Product likes" />
 </div>

 <section>
 <h2 className="mb-4 font-serif text-xl text-[#5D0F17]">Revenue potential</h2>
 {store.totalInventoryValue > 0 ? (
 <>
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
 <StatCard value={`$${store.totalInventoryValue.toLocaleString()}`} label="Total listed inventory" />
 <StatCard value={`$${store.viaCommissionPotential.toLocaleString()}`} label="VYA commission if sold" />
 <StatCard
 value={store.commissionType === "shopify-collabs" ? "Automatic" : "Manual"}
 label="Payout method"
 hint={
 store.commissionType === "shopify-collabs"
 ? "Via Shopify Collabs"
 : store.commissionType === "squarespace-manual"
 ? "Via Squarespace invoice"
 : "Via invoice"
 }
 />
 </div>
 <p className="mt-3 text-[11px] text-[#5D0F17]/40">Commission rates: {commissionTiersLabel(store.commissionRates)}</p>
 </>
 ) : (
 <div className="rounded-2xl border border-[#5D0F17]/10 bg-white p-8 text-center text-sm text-[#5D0F17]/50">
 Once your catalog is synced, your inventory value and commission potential will appear here.
 </div>
 )}
 </section>

 {/* Recent activity */}
 {extras?.activity && extras.activity.length > 0 && (
 <Panel title="Recent activity">
 <div className="divide-y divide-[#5D0F17]/[0.06]">
  {extras.activity.map((a, i) => {
  const verb = a.type === "favorite" ? "favorited" : a.type === "cart" ? "added to a cart" : "sold";
  return (
   <div key={i} className="flex items-center justify-between gap-4 px-6 py-3">
   <span className="flex min-w-0 items-center gap-3 text-sm text-[#5D0F17]">
    {a.type === "favorite" ? <Heart size={15} strokeWidth={1.7} className="shrink-0 fill-[#5D0F17]/15 text-[#5D0F17]/55" />
    : a.type === "cart" ? <ShoppingBag size={15} strokeWidth={1.7} className="shrink-0 text-[#5D0F17]/45" />
    : <Sparkles size={15} strokeWidth={1.7} className="shrink-0 text-[#b8860b]" />}
    <span className="truncate">{a.title} <span className="text-[#5D0F17]/50">{verb}</span></span>
   </span>
   <span className="shrink-0 text-[12px] text-[#5D0F17]/45">{timeAgo(a.at)}</span>
   </div>
  );
  })}
 </div>
 </Panel>
 )}
 </div>
 )}

 {/* ── LISTING HEALTH ── */}
 {tab === "listing" && (
 <div className="space-y-8">
 {extras?.listing && extras.listing.total > 0 ? (() => {
 const l = extras.listing;
 const Flag = ({ on, label }: { on: boolean; label: string }) =>
 on ? <span className="rounded bg-[#5D0F17]/[0.08] px-2 py-0.5 text-[11px] text-[#5D0F17]">{label}</span> : null;
 return (
 <Panel title="Listing health">
  {l.flagged === 0 ? (
  <p className="px-6 py-5 text-sm text-[#5D0F17]/65">All {l.total} of your listings have a size, measurements, a description, and an image. 🎉</p>
  ) : (
  <>
   <div className="border-b border-[#5D0F17]/[0.07] px-6 py-3 text-[13px] text-[#5D0F17]/60">
   <strong className="text-[#5D0F17]">{l.flagged}</strong> of {l.total} listings need attention
   </div>
   <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[#5D0F17]/[0.07] px-6 py-3 text-[13px] text-[#5D0F17]/65">
   {l.noDescription > 0 && <span><strong className="text-[#5D0F17]">{l.noDescription}</strong> missing a description</span>}
   {l.noSizing > 0 && <span><strong className="text-[#5D0F17]">{l.noSizing}</strong> missing a size or measurements</span>}
   {l.noImage > 0 && <span><strong className="text-[#5D0F17]">{l.noImage}</strong> missing an image</span>}
   </div>
   <div className="max-h-[620px] divide-y divide-[#5D0F17]/[0.05] overflow-y-auto">
   {l.products.map((p) => (
    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-[#5D0F17]/[0.03]">
    <span className="truncate text-sm text-[#5D0F17]">{p.title}</span>
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
     <Flag on={p.noDescription} label="description" />
     <Flag on={p.noSizing} label="size / measurements" />
     <Flag on={p.noImage} label="image" />
    </span>
    </a>
   ))}
   </div>
   {l.products.length < l.flagged && (
   <p className="border-t border-[#5D0F17]/[0.07] px-6 py-2.5 text-[12px] text-[#5D0F17]/45">
    Showing {l.products.length.toLocaleString()} of {l.flagged.toLocaleString()} flagged listings.
   </p>
   )}
  </>
  )}
  <p className="border-t border-[#5D0F17]/[0.07] px-6 py-3 text-[12px] text-[#5D0F17]/45">
  Complete listings get more views and sell faster. Fix these on your store and they&apos;ll sync to VYA.
  </p>
 </Panel>
 );
 })() : (
 <div className="rounded-2xl border border-[#5D0F17]/10 bg-white p-10 text-center text-sm text-[#5D0F17]/50">
 Once your catalog is synced, we&apos;ll flag any listings missing a size, measurements, a description, or an image here.
 </div>
 )}
 </div>
 )}

 {/* ── PERFORMANCE ── */}
 {tab === "performance" && (
 <div className="space-y-8">
 {analytics ? (
 <>
 <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
 <StatCard value={(analytics.totalViews ?? 0).toLocaleString()} label="Views on VYA" hint={`${analytics.totalClicks.toLocaleString()} clicked to store`} />
 <StatCard value={analytics.totalConversions.toLocaleString()} label="Conversions" />
 <StatCard value={`$${analytics.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} label="Revenue" />
 <StatCard value={`$${Math.round(analytics.aov ?? 0).toLocaleString()}`} label="Avg order value" hint="Across all VYA orders" />
 <StatCard
 value={`$${Math.round(analytics.commissionEarned ?? 0).toLocaleString()}`}
 label="VYA commission"
 hint={analytics.commissionSource === "shopify-collabs" ? "From Shopify Collabs" : `${(store.commissionRates ?? DEFAULT_RATES).map((t) => `${Math.round(t.rate * 100)}%`).join(" · ")} tiered, per order`}
 />
 </div>

 {/* Your conversion funnel */}
 <Panel title="Your conversion funnel">
 {(() => {
 const v = analytics.totalViews ?? 0;
 const c = analytics.totalClicks ?? 0;
 const o = analytics.totalConversions ?? 0;
 const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
 const Arrow = ({ rate }: { rate: number }) => (
 <div className="flex flex-col items-center justify-center px-1 text-[#5D0F17]/40">
  <span className="text-lg leading-none">→</span>
  <span className="mt-1 text-[11px]">{rate}%</span>
 </div>
 );
 const Stage = ({ n, label }: { n: number; label: string }) => (
 <div className="flex-1">
  <p className="font-serif text-3xl text-[#5D0F17]">{n.toLocaleString()}</p>
  <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#5D0F17]/50">{label}</p>
 </div>
 );
 return (
 <>
  <div className="flex items-center gap-1 px-6 py-6 text-center">
  <Stage n={v} label="Views" />
  <Arrow rate={pct(c, v)} />
  <Stage n={c} label="Clicked to store" />
  <Arrow rate={pct(o, c)} />
  <Stage n={o} label="Orders" />
  </div>
  <p className="border-t border-[#5D0F17]/[0.07] px-6 py-3 text-[12px] text-[#5D0F17]/55">
  <strong className="text-[#5D0F17]">{pct(o, v)}%</strong> of people who view your pieces end up ordering.
  </p>
 </>
 );
 })()}
 </Panel>

 {/* Recent sales — each conversion with item, buyer, total, commission */}
 <Panel title="Recent sales">
 {(analytics.sales?.length ?? 0) > 0 ? (
 <div className="divide-y divide-[#5D0F17]/[0.06]">
 {analytics.sales!.map((s) => (
 <div key={s.conversionId} className="flex items-start justify-between gap-4 px-6 py-3">
 <span className="flex min-w-0 flex-col text-sm text-[#5D0F17]">
 <span className="truncate">
 {s.items.map((it) => (it.quantity > 1 ? `${it.name} ×${it.quantity}` : it.name)).join(", ") || "Order"}
 </span>
 <span className="truncate text-[12px] text-[#5D0F17]/50">
 {s.customerEmail ?? "—"} · {new Date(s.timestamp).toLocaleDateString()}
 </span>
 </span>
 <span className="shrink-0 text-right text-sm">
 <span className="block text-[#5D0F17]">${Math.round(s.orderTotal).toLocaleString()}</span>
 <span className="block text-[12px] text-[#3a7d5d]">
 +${s.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} commission
 </span>
 </span>
 </div>
 ))}
 </div>
 ) : (
 <p className="px-6 py-8 text-center text-sm text-[#5D0F17]/45">
 No sales yet in this range. Each order will appear here with the item, buyer email, total, and your VYA commission.
 </p>
 )}
 </Panel>

 {/* In shoppers' carts now */}
 <Panel title="In shoppers' carts now">
 {(analytics.cartItems?.length ?? 0) > 0 ? (
 <>
 <div className="border-b border-[#5D0F17]/[0.07] px-6 py-3 text-[13px] text-[#5D0F17]/60">
 <strong className="text-[#5D0F17]">{analytics.cartCount}</strong> item{analytics.cartCount !== 1 ? "s" : ""} sitting in carts · worth <strong className="text-[#5D0F17]">${Math.round(analytics.cartValue ?? 0).toLocaleString()}</strong>
 </div>
 <div className="divide-y divide-[#5D0F17]/[0.06]">
 {analytics.cartItems!.map((c) => (
 <div key={c.productId} className="flex items-center justify-between gap-4 px-6 py-3">
 <span className="flex min-w-0 items-center gap-3 text-sm text-[#5D0F17]">
 {c.image
 // eslint-disable-next-line @next/next/no-img-element
 ? <img src={c.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
 : <ShoppingBag size={16} strokeWidth={1.6} className="shrink-0 text-[#5D0F17]/35" />}
 <span className="truncate">{c.title}</span>
 </span>
 <span className="shrink-0 text-sm text-[#5D0F17]/55">
 {c.inCarts} cart{c.inCarts !== 1 ? "s" : ""} · ${Math.round(c.price).toLocaleString()}
 </span>
 </div>
 ))}
 </div>
 </>
 ) : (
 <p className="px-6 py-8 text-center text-sm text-[#5D0F17]/45">Nothing in shoppers&apos; carts right now.</p>
 )}
 </Panel>

 <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
 <Panel title="Top products">
 {analytics.topProducts.length > 0 ? (
 <div className="divide-y divide-[#5D0F17]/[0.06]">
 {analytics.topProducts.map((p, i) => (
 <div key={i} className="flex items-center justify-between gap-4 px-6 py-3.5">
 <span className="flex items-center gap-3 text-sm text-[#5D0F17]">
 <ShoppingBag size={15} strokeWidth={1.7} className="text-[#5D0F17]/35" />
 <span className="truncate">{p.name}</span>
 </span>
 <span className="shrink-0 text-sm text-[#5D0F17]/50">{p.count} click{p.count !== 1 ? "s" : ""}</span>
 </div>
 ))}
 </div>
 ) : (
 <p className="px-6 py-8 text-center text-sm text-[#5D0F17]/45">No product clicks yet.</p>
 )}
 </Panel>

 <Panel title="Top searches on VYA">
 {analytics.topSearches && analytics.topSearches.length > 0 ? (
 <div className="divide-y divide-[#5D0F17]/[0.06]">
 {analytics.topSearches.map((s, i) => (
 <div key={i} className="flex items-center justify-between gap-4 px-6 py-3.5">
 <span className="flex items-center gap-3 text-sm text-[#5D0F17]">
 <Search size={15} strokeWidth={1.7} className="text-[#5D0F17]/35" />
 <span className="truncate">{s.query}</span>
 </span>
 <span className="shrink-0 text-sm text-[#5D0F17]/50">{s.count}</span>
 </div>
 ))}
 </div>
 ) : (
 <p className="px-6 py-8 text-center text-sm text-[#5D0F17]/45">No search data yet.</p>
 )}
 </Panel>
 </div>
 </>
 ) : (
 <div className="rounded-2xl border border-[#5D0F17]/10 bg-white p-8 text-center text-sm text-[#5D0F17]/50">No analytics data available yet.</div>
 )}
 </div>
 )}

 {/* ── AUDIENCE ── */}
 {tab === "audience" && (
 <div className="space-y-8">
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
 <StatCard value={store.storeFollowers.toLocaleString()} label="Store followers" hint="Shoppers who saved your store" />
 <StatCard value={totalLikes.toLocaleString()} label="Total product likes" hint="Across all listed products" />
 <StatCard value={mostLiked ? mostLiked.favoriteCount : 0} label="Most liked product" hint={mostLiked?.title} />
 </div>

 <Panel title="Most liked products">
 {store.topFavoritedProducts.length > 0 ? (
 <div className="divide-y divide-[#5D0F17]/[0.06]">
 {store.topFavoritedProducts.map((p, i) => (
 <div key={i} className="flex items-center justify-between gap-4 px-6 py-3.5">
 <span className="truncate text-sm text-[#5D0F17]">{p.title}</span>
 <span className="flex shrink-0 items-center gap-4 text-sm text-[#5D0F17]/50">
 <span>${p.price}</span>
 <span className="inline-flex items-center gap-1">
 <Heart size={13} strokeWidth={1.7} className="fill-[#5D0F17]/15 text-[#5D0F17]/45" />
 {p.favoriteCount}
 </span>
 </span>
 </div>
 ))}
 </div>
 ) : (
 <p className="px-6 py-8 text-center text-sm text-[#5D0F17]/45">No saved products yet.</p>
 )}
 </Panel>
 </div>
 )}

 </div>
 </main>
 </div>
 </div>
 );
}

export default function StoreDashboardPage() {
 return (
 <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#FBF8F1]"><p className="text-sm text-[#5D0F17]/50">Loading…</p></div>}>
 <StoreDashboardInner />
 </Suspense>
 );
}
