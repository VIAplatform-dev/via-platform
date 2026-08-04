"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, Menu, X, ShoppingCart, User } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCart } from "./CartProvider";
import { useFriends } from "./FriendsProvider";

import { stores } from "@/app/lib/stores";
import { resizeImage } from "@/app/lib/imageUtils";
import { COLLECTIONS } from "@/app/lib/collections-config";
import { navCategoryGroups } from "@/app/lib/categoryMap";

type SearchResult =
 | { type: "designer"; name: string; href: string }
 | { type: "category"; name: string; href: string }
 | { type: "store"; name: string; href: string; meta?: string }
 | { type: "product"; name: string; href: string; meta: string; image?: string };

const FONT: React.CSSProperties = { fontFamily: "'Hanken Grotesk', system-ui, sans-serif" };
const RECENT_KEY = "vya:recent-searches";
const RECENT_MAX = 8;
const HEADER_H = 56;
const MENU_TOP = HEADER_H;

const NAV_ITEM = "text-[14px] tracking-[0.02em] text-[#5D0F17] hover:text-[#5D0F17]/50 transition-colors duration-200 whitespace-nowrap";
const DROP_PANEL = "bg-white border border-gray-200 shadow-md";
const DROP_LINK = "block px-4 py-1.5 text-[14px] text-[#5D0F17] normal-case tracking-normal hover:bg-gray-50 transition-colors";
const DROP_FOOT = "border-t border-gray-100 px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#5D0F17]/50 hover:text-[#5D0F17] hover:bg-gray-50 transition-colors block";

export default function HeaderClient({
 categories,
 activeCollectionSlugs,
 topDesigners = [],
}: {
 categories: { slug: string; label: string }[];
 activeCollectionSlugs: Set<string>;
 topDesigners?: { slug: string; label: string }[];
}) {

 // ── UI state ─────────────────────────────────────────────────
 const [activeDrawer, setActiveDrawer] = useState<"search" | "cart" | "account" | null>(null);
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 const pathname = usePathname();
 const isHome = pathname === "/";
 const [scrolled, setScrolled] = useState(false);
 const [query, setQuery] = useState("");
 const [activeIndex, setActiveIndex] = useState(-1);
 const searchInputRef = useRef<HTMLInputElement>(null);
 const [activeNavDrawer, setActiveNavDrawer] = useState<"stores" | "categories" | "designers" | "collections" | null>(null);
 const [lastNav, setLastNav] = useState<"stores" | "categories" | "designers" | "collections">("stores");
 const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const [mobileStores, setMobileStores] = useState(false);
 const [mobileCats, setMobileCats] = useState(false);
 const [mobileDesigners, setMobileDesigners] = useState(false);
 const [mobileCols, setMobileCols] = useState(false);
 const router = useRouter();
 const { data: session } = useSession();
 const { items: cartItems, itemCount, removeItem } = useCart();
 const { pendingCount } = useFriends();


 useEffect(() => {
 const h = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false); };
 window.addEventListener("resize", h);
 return () => window.removeEventListener("resize", h);
 }, []);

 // Transparent-over-hero header only on the homepage; solidify on scroll.
 useEffect(() => {
 if (!isHome) { setScrolled(true); return; }
 const onScroll = () => setScrolled(window.scrollY > 40);
 onScroll();
 window.addEventListener("scroll", onScroll, { passive: true });
 return () => window.removeEventListener("scroll", onScroll);
 }, [isHome]);
 // Transparent (white text) only over the hero. When a nav drawer is open, the white drawer
 // slides over the header — so drop to the solid state (maroon text) or the white nav labels
 // would sit on the white panel and vanish.
 const transparent = isHome && !scrolled && activeNavDrawer === null;
 const navItemClass = `text-[14px] tracking-[0.02em] transition-colors duration-200 whitespace-nowrap ${transparent ? "text-[#FFFDF8] hover:text-[#FFFDF8]/60" : "text-[#5D0F17] hover:text-[#5D0F17]/50"}`;
 const icon = transparent ? "text-[#FFFDF8]" : "text-[#5D0F17]";

 useEffect(() => {
 document.body.style.overflow = (mobileMenuOpen || activeDrawer !== null) ? "hidden" : "";
 return () => { document.body.style.overflow = ""; };
 }, [mobileMenuOpen, activeDrawer]);

 // ── Search ───────────────────────────────────────────────────
 const [results, setResults] = useState<SearchResult[]>([]);
 const [searchLoading, setSearchLoading] = useState(false);
 const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const [recentSearches, setRecentSearches] = useState<string[]>([]);

 useEffect(() => {
 try {
 const raw = localStorage.getItem(RECENT_KEY);
 if (raw) setRecentSearches(JSON.parse(raw));
 } catch { /* ignore */ }
 }, []);

 const recordSearch = (term: string) => {
 const t = term.trim();
 if (!t) return;
 setRecentSearches((prev) => {
 const next = [t, ...prev.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
 try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
 return next;
 });
 };

 const removeRecentSearch = (term: string) => {
 setRecentSearches((prev) => {
 const next = prev.filter((s) => s !== term);
 try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
 return next;
 });
 };

 const clearRecentSearches = () => {
 setRecentSearches([]);
 try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
 };

 const runSearch = (term: string) => {
 recordSearch(term);
 closeSearch(`/search?q=${encodeURIComponent(term.trim())}`);
 };

 useEffect(() => {
 setActiveIndex(-1);
 if (!query.trim()) { setResults([]); return; }
 if (searchTimer.current) clearTimeout(searchTimer.current);
 searchTimer.current = setTimeout(async () => {
 setSearchLoading(true);
 try {
 const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
 if (res.ok) {
 const data = await res.json();
 setResults([
 ...(data.designers || []).map((d: { slug: string; label: string }) => ({ type: "designer" as const, name: d.label, href: `/brands/${d.slug}` })),
 ...(data.categories || []).map((c: { slug: string; label: string }) => ({ type: "category" as const, name: c.label, href: `/categories/${c.slug}` })),
 ...(data.stores || []).map((s: { slug: string; name: string; location: string }) => ({ type: "store" as const, name: s.name, href: `/stores/${s.slug}`, meta: s.location })),
 ...(data.products || []).slice(0, 8).map((p: { name: string; storeSlug: string; id: number; storeName: string; price: string; image?: string }) => ({ type: "product" as const, name: p.name, href: `/products/${p.storeSlug}-${p.id}`, meta: `${p.storeName} · ${p.price}`, image: p.image })),
 ]);
 } else setResults([]);
 } catch { setResults([]); }
 finally { setSearchLoading(false); }
 }, 250);
 return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
 }, [query]);

 useEffect(() => {
 if (activeDrawer !== "search") return;
 const onKey = (e: KeyboardEvent) => {
 if (e.key === "Escape") setActiveDrawer(null);
 if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
 if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
 if (e.key === "Enter" && query.trim()) {
 e.preventDefault();
 setActiveDrawer(null);
 if (activeIndex >= 0 && results[activeIndex]) {
 router.push(results[activeIndex].href);
 } else {
 const q = query.trim().toLowerCase();
 const match = stores.find((s) => s.name.toLowerCase() === q || s.slug === q);
 recordSearch(query.trim());
 router.push(match ? `/stores/${match.slug}` : `/search?q=${encodeURIComponent(query.trim())}`);
 }
 }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [activeDrawer, results, activeIndex, router, query]);

 useEffect(() => { if (activeDrawer !== "search") { setQuery(""); setActiveIndex(-1); } }, [activeDrawer]);

 const closeSearch = (href?: string) => {
 searchInputRef.current?.blur();
 setActiveDrawer(null);
 setQuery("");
 if (href) router.push(href);
 };

 const closeNavDrawer = () => setActiveNavDrawer(null);

 // Desktop hover dropdown: open on hover, small close delay so the cursor can
 // travel from the nav label down into the panel without it collapsing.
 const openNav = (key: "stores" | "categories" | "designers" | "collections") => {
 if (navTimer.current) clearTimeout(navTimer.current);
 setLastNav(key);
 setActiveNavDrawer(key);
 };
 const keepNav = () => { if (navTimer.current) clearTimeout(navTimer.current); };
 const scheduleCloseNav = () => {
 if (navTimer.current) clearTimeout(navTimer.current);
 navTimer.current = setTimeout(() => setActiveNavDrawer(null), 140);
 };
 const navOpen = activeNavDrawer !== null;

 return (
 <>
 {/* ── Header ───────────────────────────────────────────── */}
 <div
 className={`fixed top-0 z-[60] w-full transition-colors duration-300 ${transparent ? "bg-gradient-to-b from-black/25 to-transparent border-b border-transparent" : "bg-[#FFFDF8] border-b border-[#5D0F17]/10"}`}
 style={{ height: HEADER_H }}
 >
 <div className="max-w-7xl mx-auto px-6 h-full flex items-center gap-6 relative">

 {/* Logo — always left on all screen sizes */}
 <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex-shrink-0 flex items-start gap-1.5">
 <svg
 viewBox="0 0 228 132"
 aria-label="VYA"
 role="img"
 className="h-7 sm:h-8 w-auto transition-colors duration-300"
 style={{ color: transparent ? "#FFFDF8" : "#5D0F17" }}
 >
 <path
 pathLength={1}
 className="vya-logo-path"
 d="M 139.960938 130.339844 L 139.960938 131.914062 L 118.601562 131.914062 C 118.375 131.089844 118.417969 130.566406 119.261719 129.894531 C 120.171875 129.167969 120.859375 127.957031 121.285156 126.820312 C 122.492188 123.597656 122.667969 120.175781 122.679688 116.765625 C 122.710938 107.546875 122.699219 98.328125 122.679688 89.109375 C 122.679688 88.632812 122.53125 88.113281 122.3125 87.695312 C 112.851562 69.824219 103.375 51.964844 93.902344 34.105469 C 92.738281 31.90625 91.578125 29.703125 90.410156 27.503906 C 90.292969 27.273438 90.144531 27.0625 89.921875 26.699219 C 89.28125 28.585938 88.683594 30.335938 88.09375 32.09375 C 79.054688 58.910156 70.019531 85.726562 60.980469 112.542969 C 60.085938 115.1875 59.160156 117.824219 58.324219 120.488281 C 58.140625 121.070312 58.132812 121.808594 58.3125 122.386719 C 59.191406 125.210938 60.167969 128.007812 61.105469 130.8125 C 61.214844 131.148438 61.304688 131.492188 61.425781 131.921875 C 61.03125 131.945312 60.75 131.980469 60.464844 131.980469 C 56.5 131.980469 52.539062 131.96875 48.574219 132 C 47.917969 132.003906 47.617188 131.835938 47.394531 131.164062 C 36.519531 98.753906 25.65625 66.347656 14.695312 33.96875 C 12 26.003906 9.046875 18.128906 6.054688 10.273438 C 5.1875 7.992188 3.847656 5.890625 2.585938 3.792969 C 2.132812 3.039062 1.207031 2.597656 0.632812 1.902344 C 0.304688 1.503906 0.234375 0.871094 0 0.207031 L 22.0625 0.207031 C 21.804688 0.992188 21.457031 1.648438 21.394531 2.335938 C 21.246094 3.882812 21.070312 5.460938 21.203125 6.996094 C 21.742188 13.183594 23.554688 19.0625 25.546875 24.910156 C 30.375 39.109375 35.136719 53.328125 39.917969 67.542969 C 45.507812 84.148438 51.101562 100.757812 56.695312 117.363281 C 56.84375 117.800781 57.007812 118.222656 57.261719 118.898438 C 57.566406 118.054688 57.804688 117.429688 58.015625 116.792969 C 65.953125 93.078125 73.882812 69.363281 81.816406 45.652344 C 84.019531 39.0625 86.222656 32.472656 88.457031 25.890625 C 88.730469 25.085938 88.664062 24.484375 88.167969 23.78125 C 84.308594 18.308594 80.519531 12.78125 76.648438 7.320312 C 75.773438 6.085938 74.675781 5 73.609375 3.921875 C 72.484375 2.792969 71.210938 1.851562 69.535156 1.589844 L 69.535156 0.03125 L 96.867188 0.03125 C 96.9375 0.765625 96.742188 1.351562 96.5 2.058594 C 96.121094 3.15625 96.125 4.488281 96.285156 5.675781 C 96.820312 9.679688 98.171875 13.457031 99.984375 17.011719 C 103.726562 24.34375 107.609375 31.605469 111.457031 38.882812 C 118.542969 52.296875 125.632812 65.714844 132.726562 79.125 C 133.40625 80.40625 134.089844 81.683594 134.855469 83.121094 C 135.921875 80.921875 136.917969 78.875 137.90625 76.816406 C 142.4375 67.386719 146.972656 57.960938 151.488281 48.519531 C 156.332031 38.394531 161.199219 28.277344 165.972656 18.113281 C 167.570312 14.710938 168.859375 11.160156 169.164062 7.347656 C 169.25 6.246094 169.117188 5.074219 168.835938 4.003906 C 168.5 2.71875 167.511719 1.976562 166.207031 1.742188 C 165.339844 1.589844 165.003906 1.007812 165.199219 0 L 180.65625 0 C 181.789062 3.390625 182.894531 6.722656 184.015625 10.054688 C 189.449219 26.222656 194.882812 42.386719 200.324219 58.550781 C 206.011719 75.445312 211.683594 92.339844 217.429688 109.214844 C 219.378906 114.941406 221.4375 120.644531 224.300781 125.980469 C 225.054688 127.390625 225.996094 128.804688 227.171875 129.84375 C 227.933594 130.515625 228.105469 131.007812 227.945312 131.914062 L 206.273438 131.914062 C 206.492188 131.171875 206.703125 130.550781 206.84375 129.917969 C 207 129.207031 207.191406 128.484375 207.195312 127.765625 C 207.210938 123.355469 206.417969 119.050781 205.113281 114.882812 C 202.472656 106.4375 199.757812 98.019531 196.855469 89.667969 C 195.132812 84.710938 191.988281 80.898438 186.761719 79.414062 C 183.160156 78.390625 179.550781 78.753906 175.996094 79.710938 C 169.429688 81.484375 164.039062 85.273438 159.253906 90.054688 C 158.691406 90.617188 158.257812 91.402344 157.988281 92.164062 C 157.746094 92.824219 157.464844 93.019531 156.789062 92.816406 L 156.789062 77.492188 C 157.40625 77.230469 157.746094 77.320312 157.878906 78.136719 C 158.21875 80.148438 159.441406 81.277344 161.460938 81.53125 C 163.890625 81.835938 166.203125 81.253906 168.507812 80.5625 C 171.792969 79.570312 175.035156 78.347656 178.382812 77.671875 C 183.292969 76.679688 188.046875 77.257812 192.210938 80.449219 C 192.902344 80.980469 193.527344 81.59375 194.421875 82.375 C 186.511719 59.066406 178.699219 36.039062 170.886719 13.015625 C 170.792969 13 170.707031 12.988281 170.613281 12.972656 C 168.660156 16.855469 166.660156 20.710938 164.765625 24.621094 C 159.792969 34.90625 154.867188 45.21875 149.917969 55.515625 C 145.316406 65.097656 140.707031 74.675781 136.128906 84.265625 C 135.894531 84.753906 135.78125 85.351562 135.78125 85.894531 C 135.765625 96.015625 135.746094 106.136719 135.78125 116.253906 C 135.792969 119.757812 135.953125 123.273438 137.085938 126.632812 C 137.605469 128.179688 138.214844 129.730469 139.980469 130.328125 Z M 139.960938 130.339844 "
 />
 </svg>
 <span className={`text-[10px] tracking-[0.08em] font-sans -mt-0.5 transition-colors duration-300 ${transparent ? "text-[#FFFDF8]/70" : "text-[#5D0F17]/50"}`}>pilot</span>
 </Link>

 {/* Desktop Nav */}
 <nav className="hidden md:flex items-center gap-7 flex-1" style={FONT} onMouseLeave={scheduleCloseNav}>
 {(["stores", "categories", "designers", "collections"] as const).map((key) => (
 <button
 key={key}
 onMouseEnter={() => openNav(key)}
 onClick={() => setActiveNavDrawer(activeNavDrawer === key ? null : key)}
 className={`${navItemClass} ${activeNavDrawer === key ? "opacity-50" : ""}`}
 >
 {key.charAt(0).toUpperCase() + key.slice(1)}
 </button>
 ))}
 </nav>


 {/* Right actions */}
 <div className="flex items-center gap-2 ml-auto">

 {/* Inline search — desktop */}
 <button
 aria-label="Search"
 onClick={() => setActiveDrawer("search")}
 className={`hidden md:flex items-center gap-2 px-2 py-1 text-[13px] tracking-[0.02em] transition-colors duration-200 group ${transparent ? "text-[#FFFDF8]/70 hover:text-[#FFFDF8]" : "text-[#5D0F17]/50 hover:text-[#5D0F17]"}`}
 style={FONT}
 >
 <Search size={13} strokeWidth={1.5} />
 <span className={`border-b border-transparent transition-colors duration-200 ${transparent ? "group-hover:border-[#FFFDF8]/40" : "group-hover:border-[#5D0F17]/40"}`}>Search</span>
 </button>

 {/* Search icon — mobile */}
 <button
 aria-label="Search"
 onClick={() => setActiveDrawer("search")}
 className={`md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-300 ${icon}`}
 >
 <Search size={20} />
 </button>

 {/* Cart */}
 <button
 aria-label="Cart"
 onClick={() => setActiveDrawer("cart")}
 className={`relative p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-300 ${transparent ? "text-[#FFFDF8] hover:text-[#FFFDF8]/70" : "text-[#5D0F17] hover:text-[#5D0F17]/60"}`}
 >
 <ShoppingCart size={18} strokeWidth={1.5} />
 {itemCount > 0 && (
 <span className="absolute -top-0.5 -right-0.5 bg-[#5D0F17] text-white text-[10px] font-medium min-w-[17px] min-h-[17px] flex items-center justify-center rounded-full leading-none px-0.5">
 {itemCount}
 </span>
 )}
 </button>

 {/* Sign In / Account — desktop */}
 <button
 aria-label={session ? "Account" : "Sign in"}
 onClick={() => setActiveDrawer("account")}
 className={`hidden md:flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors duration-300 ${transparent ? "text-[#FFFDF8] hover:text-[#FFFDF8]/70" : "text-[#5D0F17] hover:text-[#5D0F17]/50"}`}
 style={FONT}
 >
 {session?.user?.image
 ? <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" />
 : <User size={17} strokeWidth={1.5} />
 }
 {pendingCount > 0 && <span className="w-1.5 h-1.5 bg-[#5D0F17] rounded-full flex-shrink-0" />}
 </button>

 {/* Account icon — mobile */}
 <Link
 href={session ? "/account" : "/login"}
 className={`md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-300 ${icon}`}
 >
 {session?.user?.image
 ? <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" />
 : <User size={20} strokeWidth={1.5} />
 }
 </Link>

 {/* Mobile menu toggle */}
 <button
 aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
 onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
 className={`md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-300 ${icon}`}
 >
 {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
 </button>
 </div>
 </div>
 </div>

 {/* ── Mobile Menu ───────────────────────────────────────── */}
 <div className="md:hidden">
 {/* Backdrop */}
 <div
 className={`fixed inset-0 z-[64] bg-black/20 transition-opacity duration-300 ${mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
 onClick={() => setMobileMenuOpen(false)}
 />
 {/* Left-side panel */}
 <nav
 className={`fixed left-0 top-0 bottom-0 z-[65] w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
 style={FONT}
 >
 {/* Panel header */}
 <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
 <span className="text-[11px] uppercase tracking-[0.15em] text-[#5D0F17]">Menu</span>
 <button onClick={() => setMobileMenuOpen(false)} className="text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors">
 <X size={16} strokeWidth={1.5} />
 </button>
 </div>

 <div className="overflow-y-auto flex-1">
 <div className="px-6 py-4">
 <ul className="space-y-1">

 <li className="border-b border-gray-100">
 <button onClick={() => setMobileStores(!mobileStores)} className="w-full flex items-center justify-between py-4 text-[13px] text-[#5D0F17] uppercase tracking-[0.08em]">
 Stores <span className={`text-[#5D0F17]/40 text-xs transition-transform duration-200 ${mobileStores ? "rotate-180" : ""}`}>▾</span>
 </button>
 <div className={`overflow-hidden transition-all duration-300 ease-out ${mobileStores ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}>
 <div className="pb-4 pl-4 space-y-1">
 {stores.map((s) => (
 <Link key={s.slug} href={`/stores/${s.slug}`} onClick={() => setMobileMenuOpen(false)} className="block py-2 text-[13px] text-[#5D0F17]/70 hover:text-[#5D0F17] transition-colors">{s.name}</Link>
 ))}
 <Link href="/stores" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-[11px] uppercase tracking-[0.08em] text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors">View All Stores</Link>
 </div>
 </div>
 </li>

 <li className="border-b border-gray-100">
 <button onClick={() => setMobileCats(!mobileCats)} className="w-full flex items-center justify-between py-4 text-[13px] text-[#5D0F17] uppercase tracking-[0.08em]">
 Categories <span className={`text-[#5D0F17]/40 text-xs transition-transform duration-200 ${mobileCats ? "rotate-180" : ""}`}>▾</span>
 </button>
 <div className={`overflow-hidden transition-all duration-300 ease-out ${mobileCats ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}>
 <div className="pb-4 pl-4 space-y-3">
 {navCategoryGroups.map((group) => (
 <div key={group.slug}>
 <Link
 href={`/categories/${group.slug}`}
 onClick={() => setMobileMenuOpen(false)}
 className="block py-1.5 text-[13px] font-semibold text-[#5D0F17] uppercase tracking-[0.06em]"
 >
 {group.label}
 </Link>
 {group.subs.map((sub) => (
 <Link
 key={sub.slug}
 href={`/categories/${sub.slug}`}
 onClick={() => setMobileMenuOpen(false)}
 className="block py-1 pl-3 text-[12px] text-[#5D0F17]/65 normal-case hover:text-[#5D0F17] transition-colors"
 >
 {sub.label}
 </Link>
 ))}
 </div>
 ))}
 <Link href="/categories" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-[11px] uppercase tracking-[0.08em] text-[#5D0F17]/40">All Categories</Link>
 </div>
 </div>
 </li>

 <li className="border-b border-gray-100">
 <button onClick={() => setMobileDesigners(!mobileDesigners)} className="w-full flex items-center justify-between py-4 text-[13px] text-[#5D0F17] uppercase tracking-[0.08em]">
 Designers <span className={`text-[#5D0F17]/40 text-xs transition-transform duration-200 ${mobileDesigners ? "rotate-180" : ""}`}>▾</span>
 </button>
 <div className={`overflow-hidden transition-all duration-300 ease-out ${mobileDesigners ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}>
 <div className="pb-4 pl-4 space-y-1">
 {topDesigners.map((d) => (
 <Link key={d.slug} href={`/brands/${d.slug}`} onClick={() => setMobileMenuOpen(false)} className="block py-2 text-[13px] text-[#5D0F17]/70 hover:text-[#5D0F17] transition-colors">{d.label}</Link>
 ))}
 <Link href="/brands" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-[11px] uppercase tracking-[0.08em] text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors">All Designers</Link>
 </div>
 </div>
 </li>

 <li className="border-b border-gray-100">
 <button onClick={() => setMobileCols(!mobileCols)} className="w-full flex items-center justify-between py-4 text-[13px] text-[#5D0F17] uppercase tracking-[0.08em]">
 Collections <span className={`text-[#5D0F17]/40 text-xs transition-transform duration-200 ${mobileCols ? "rotate-180" : ""}`}>▾</span>
 </button>
 <div className={`overflow-hidden transition-all duration-300 ease-out ${mobileCols ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}>
 <div className="pb-2 pl-4">
 {COLLECTIONS.filter((col, i) => activeCollectionSlugs.has(col.slug) || i === COLLECTIONS.length - 1).map((col) => (
 <Link key={col.slug} href={col.href ?? `/collections/${col.slug}`} onClick={() => setMobileMenuOpen(false)} className="block py-2.5 text-[13px] text-[#5D0F17]/70">{col.name}</Link>
 ))}
 <Link href="/collections" onClick={() => setMobileMenuOpen(false)} className="block py-2.5 text-[11px] uppercase tracking-[0.08em] text-[#5D0F17]/40">View All</Link>
 </div>
 </div>
 </li>

 </ul>

 <div className="mt-8 pt-8 border-t border-gray-100">
 <Link href={session ? "/account" : "/login"} onClick={() => setMobileMenuOpen(false)} className="block py-3 text-[13px] uppercase tracking-[0.08em] text-[#5D0F17]/70 hover:text-[#5D0F17]">
 {session ? "My Account" : "Sign In"}
 </Link>
 </div>
 </div>
 </div>
 </nav>
 </div>

 {/* ── Desktop hover Nav Drawer — slides in from the left, full-height takeover ── */}
 {/* Dim scrim (sits below the header so the right-side nav labels stay crisp) */}
 <div
 className={`hidden md:block fixed inset-0 z-[55] bg-black/25 transition-opacity duration-300 ${navOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
 onMouseEnter={scheduleCloseNav}
 onClick={closeNavDrawer}
 />
 <div
 className={`hidden md:flex fixed left-0 top-0 bottom-0 z-[70] w-full ${lastNav === "stores" ? "max-w-2xl" : "max-w-sm"} bg-white flex-col transition-transform duration-300 ease-out ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-[102%] shadow-none"}`}
 style={{ ...FONT }}
 onMouseEnter={keepNav}
 onMouseLeave={scheduleCloseNav}
 >
 <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
 <span className="text-[11px] uppercase tracking-[0.15em] text-[#5D0F17]">
 {lastNav.charAt(0).toUpperCase() + lastNav.slice(1)}
 </span>
 <button onClick={closeNavDrawer} aria-label="Close" className="text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors">
 <X size={16} strokeWidth={1.5} />
 </button>
 </div>
 <div className="overflow-y-auto flex-1">
 {lastNav === "stores" && (
 <div className="py-2">
 <div className="grid grid-cols-2 gap-x-2">
 {stores.map((s) => (
 <Link key={s.slug} href={`/stores/${s.slug}`} onClick={closeNavDrawer} className={DROP_LINK}>
 <span className="font-medium">{s.name}</span>
 <span className="block text-[12px] text-[#5D0F17]/40 mt-0.5">{s.location}</span>
 </Link>
 ))}
 </div>
 <Link href="/stores" onClick={closeNavDrawer} className={DROP_FOOT}>View All Stores</Link>
 </div>
 )}
 {lastNav === "categories" && (
 <div className="py-4">
 {navCategoryGroups.map((group) => (
 <div key={group.slug} className="px-6 mb-5">
 <Link href={`/categories/${group.slug}`} onClick={closeNavDrawer} className="block text-[13px] uppercase tracking-[0.12em] font-semibold text-[#5D0F17] mb-2 hover:text-[#5D0F17]/60 transition-colors">
 {group.label}
 </Link>
 <div className="space-y-0.5">
 {group.subs.map((sub) => (
 <Link key={sub.slug} href={`/categories/${sub.slug}`} onClick={closeNavDrawer} className="block py-1 text-[14px] text-[#5D0F17]/70 normal-case tracking-normal hover:text-[#5D0F17] transition-colors">
 {sub.label}
 </Link>
 ))}
 </div>
 </div>
 ))}
 <Link href="/categories" onClick={closeNavDrawer} className={DROP_FOOT}>All Categories</Link>
 </div>
 )}
 {lastNav === "designers" && (
 <div className="py-2">
 {topDesigners.map((d) => (
 <Link key={d.slug} href={`/brands/${d.slug}`} onClick={closeNavDrawer} className={DROP_LINK}>
 {d.label}
 </Link>
 ))}
 <Link href="/brands" onClick={closeNavDrawer} className={DROP_FOOT}>All Designers</Link>
 </div>
 )}
 {lastNav === "collections" && (
 <div className="py-2">
 {COLLECTIONS.filter((col, i) => activeCollectionSlugs.has(col.slug) || i === COLLECTIONS.length - 1).map((col) => (
 <Link key={col.slug} href={col.href ?? `/collections/${col.slug}`} onClick={closeNavDrawer} className={DROP_LINK}>
 {col.name}
 {col.curatedBy && <span className="block text-[11px] text-[#5D0F17]/40 mt-0.5">by {col.curatedBy}</span>}
 </Link>
 ))}
 <Link href="/collections" onClick={closeNavDrawer} className={DROP_FOOT}>View All Collections</Link>
 </div>
 )}
 </div>
 </div>

 {/* ── Right-side Drawer (Search / Cart / Account) ───────── */}
 {activeDrawer && (
 <>
  {/* Backdrop */}
  <div
  className="fixed inset-0 z-[65] bg-black/20"
  onClick={() => { setActiveDrawer(null); setQuery(""); }}
  />
  {/* Panel */}
  <div className="fixed right-0 top-0 bottom-0 z-[70] w-full max-w-sm bg-white shadow-2xl flex flex-col" style={FONT}>
  {/* Drawer header */}
  <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
   <span className="text-[11px] uppercase tracking-[0.15em] text-[#5D0F17]">
   {activeDrawer === "search" ? "Search" : activeDrawer === "cart" ? `Cart (${itemCount})` : session?.user?.name ?? "Account"}
   </span>
   <button onClick={() => { setActiveDrawer(null); setQuery(""); }} className="text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors">
   <X size={16} strokeWidth={1.5} />
   </button>
  </div>

  {/* ── Search panel ── */}
  {activeDrawer === "search" && (
   <div className="flex flex-col flex-1 min-h-0">
   <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
    <Search size={13} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
    <input
    ref={searchInputRef}
    autoFocus
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Search items or stores..."
    className="flex-1 text-[14px] outline-none bg-transparent text-[#5D0F17] placeholder:text-gray-400"
    />
   </div>
   <div className="overflow-y-auto flex-1 pb-4">
    {!query.trim() && (
    recentSearches.length > 0 ? (
    <div>
     <div className="px-6 pt-4 pb-2 flex items-center justify-between">
     <p className="text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium">Recent Searches</p>
     <button onClick={clearRecentSearches} className="text-[9px] uppercase tracking-[0.12em] text-gray-400 hover:text-[#5D0F17] transition-colors">Clear</button>
     </div>
     {recentSearches.map((term) => (
     <div key={term} className="group w-full px-6 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
      <button onClick={() => runSearch(term)} className="flex items-center gap-3 flex-1 min-w-0 text-left text-[#5D0F17]">
      <Search size={12} strokeWidth={1.5} className="text-gray-300 flex-shrink-0" />
      <span className="truncate text-[13px]">{term}</span>
      </button>
      <button onClick={() => removeRecentSearch(term)} aria-label={`Remove ${term}`} className="text-gray-300 hover:text-[#5D0F17] transition-colors flex-shrink-0">
      <X size={13} strokeWidth={1.5} />
      </button>
     </div>
     ))}
    </div>
    ) : (
    <div>
     <p className="px-6 pt-4 pb-2 text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium">Browse by Category</p>
     <div className="px-6 pb-4 grid grid-cols-2 gap-2">
     {[{ slug: "clothing", label: "Clothing" }, { slug: "bags", label: "Bags" }, { slug: "shoes", label: "Shoes" }, { slug: "accessories", label: "Accessories" }].map((c) => (
      <button key={c.slug} onClick={() => closeSearch(`/categories/${c.slug}`)} className="border border-gray-200 py-2 text-[11px] uppercase tracking-[0.1em] text-center text-gray-600 hover:bg-[#5D0F17] hover:text-white hover:border-[#5D0F17] transition-colors">{c.label}</button>
     ))}
     </div>
     <p className="px-6 py-2 text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium border-t border-gray-100">Our Stores</p>
     {stores.map((s) => (
     <button key={s.slug} onClick={() => closeSearch(`/stores/${s.slug}`)} className="w-full text-left px-6 py-2.5 hover:bg-gray-50 flex items-center justify-between text-[#5D0F17] transition-colors">
      <span className="text-[13px]">{s.name}</span>
      <span className="text-[11px] text-gray-400">{s.location}</span>
     </button>
     ))}
    </div>
    ))}
    {searchLoading && results.length === 0 && <p className="text-[13px] text-gray-400 px-6 py-4">Searching...</p>}
    {!searchLoading && query.trim().length >= 2 && results.length === 0 && <p className="text-[13px] text-gray-400 px-6 py-4">No results found</p>}
    {(() => {
    const designers = results.filter((r) => r.type === "designer");
    const cats = results.filter((r) => r.type === "category");
    const storeResults = results.filter((r) => r.type === "store");
    const products = results.filter((r) => r.type === "product");
    let flat = -1;
    const renderItem = (r: SearchResult) => {
     flat++;
     const idx = flat;
     return (
     <button key={`${r.type}-${idx}`} onClick={() => closeSearch(r.href)} className={`w-full text-left px-6 py-2.5 flex items-center gap-3 text-[#5D0F17] transition-colors ${idx === activeIndex ? "bg-[#5D0F17] text-white" : "hover:bg-gray-50"}`}>
      {r.type === "product" && r.image && <img src={resizeImage(r.image, 120)} alt="" className="w-9 h-12 object-cover flex-shrink-0" loading="lazy" decoding="async" />}
      <div className="flex-1 flex justify-between items-center min-w-0">
      <span className="truncate text-[13px]">{r.name}</span>
      {"meta" in r && r.meta && <span className="text-[11px] opacity-40 flex-shrink-0 ml-2">{r.meta}</span>}
      </div>
     </button>
     );
    };
    return (
     <>
     {designers.length > 0 && <div className="mb-1"><p className="px-6 pt-3 pb-1 text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium">Designers</p>{designers.map(renderItem)}</div>}
     {cats.length > 0 && <div className="mb-1"><p className="px-6 pt-3 pb-1 text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium">Categories</p>{cats.map(renderItem)}</div>}
     {storeResults.length > 0 && <div className="mb-1"><p className="px-6 pt-3 pb-1 text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium">Stores</p>{storeResults.map(renderItem)}</div>}
     {products.length > 0 && <div className="mb-1"><p className="px-6 pt-3 pb-1 text-[9px] uppercase tracking-[0.18em] text-gray-400 font-medium">Products</p>{products.map(renderItem)}</div>}
     {results.length > 0 && query.trim() && (
      <button onClick={() => runSearch(query.trim())} className="w-full text-left px-6 py-3 mt-2 border-t border-gray-100 text-[12px] text-gray-500 hover:text-[#5D0F17] transition-colors">
      See all results for &ldquo;{query.trim()}&rdquo;
      </button>
     )}
     </>
    );
    })()}
   </div>
   </div>
  )}

  {/* ── Cart panel ── */}
  {activeDrawer === "cart" && (
   <div className="flex flex-col flex-1 min-h-0">
   {cartItems.length === 0 ? (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
    <ShoppingCart size={32} strokeWidth={1} className="text-[#5D0F17]/20" />
    <p className="text-[13px] text-[#5D0F17]/50">Your shopping cart is empty</p>
    <Link href="/categories/clothing" onClick={() => setActiveDrawer(null)} className="border border-[#5D0F17] px-6 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[#5D0F17] hover:bg-[#5D0F17] hover:text-white transition-colors">
     Explore Products
    </Link>
    </div>
   ) : (
    <>
    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
     {cartItems.map((item) => (
     <div key={item.compositeId} className="flex gap-3 px-6 py-4">
      {item.image && <img src={resizeImage(item.image, 160)} alt={item.title} className="w-16 h-20 object-cover flex-shrink-0" />}
      <div className="flex-1 min-w-0">
      <p className="text-[12px] text-[#5D0F17] leading-snug line-clamp-2">{item.title}</p>
      <p className="text-[11px] text-[#5D0F17]/50 mt-0.5">{item.storeName}</p>
      <p className="text-[12px] text-[#5D0F17] mt-1">${item.price}</p>
      </div>
      <button onClick={() => removeItem(item.compositeId)} className="text-[#5D0F17]/30 hover:text-[#5D0F17] transition-colors flex-shrink-0 self-start mt-0.5">
      <X size={14} />
      </button>
     </div>
     ))}
    </div>
    <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0">
     <Link href="/cart" onClick={() => setActiveDrawer(null)} className="block w-full text-center bg-[#5D0F17] text-white py-3 text-[11px] uppercase tracking-[0.12em] hover:bg-[#5D0F17]/90 transition-colors">
     View Full Cart
     </Link>
    </div>
    </>
   )}
   </div>
  )}

  {/* ── Account panel ── */}
  {activeDrawer === "account" && (
   <div className="flex flex-col flex-1 min-h-0 px-6 py-6">
   {session ? (
    <>
    {session.user?.name && (
     <p className="text-[15px] text-[#5D0F17] font-sans mb-5">{session.user.name}</p>
    )}
    <div className="divide-y divide-gray-100 flex-1">
     <Link href="/account" onClick={() => setActiveDrawer(null)} className="block py-3.5 text-[12px] text-[#5D0F17] hover:text-[#5D0F17]/50 transition-colors uppercase tracking-[0.1em]">Account</Link>
     <Link href="/account/favorites" onClick={() => setActiveDrawer(null)} className="block py-3.5 text-[12px] text-[#5D0F17] hover:text-[#5D0F17]/50 transition-colors uppercase tracking-[0.1em]">Favorites</Link>
     <Link href="/you-might-like" onClick={() => setActiveDrawer(null)} className="block py-3.5 text-[12px] text-[#5D0F17] hover:text-[#5D0F17]/50 transition-colors uppercase tracking-[0.1em]">You Might Like</Link>
    </div>
    <Link href="/api/auth/signout" className="block w-full text-center border border-gray-200 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[#5D0F17]/50 hover:border-[#5D0F17] hover:text-[#5D0F17] transition-colors mt-4">
     Log Out
    </Link>
    </>
   ) : (
    <div className="flex flex-col gap-3">
    <Link href="/login" onClick={() => setActiveDrawer(null)} className="block w-full text-center bg-[#5D0F17] text-white py-3 text-[11px] uppercase tracking-[0.12em] hover:bg-[#5D0F17]/90 transition-colors">
     Sign In
    </Link>
    </div>
   )}
   </div>
  )}
  </div>
 </>
 )}
 </>
 );
}
