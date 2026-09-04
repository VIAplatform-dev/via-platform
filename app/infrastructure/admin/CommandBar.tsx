"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "./ui";

const B = "/admin";
type Hit = { id: string; label: string; sub?: string; href: string };
type Group = { group: string; hits: Hit[] };

// Static quick-nav + actions, filtered locally alongside the live entity search.
const PAGES: Hit[] = [
 { id: "p-home", label: "Home", href: `${B}/home` },
 { id: "p-inv", label: "Inventory", href: `${B}/inventory` },
 { id: "p-cross", label: "Cross-listing", href: `${B}/cross-listing` },
 { id: "p-consign", label: "Consignment", href: `${B}/consignment` },
 { id: "p-orders", label: "Orders", href: `${B}/orders` },
 { id: "p-inbox", label: "Inbox", href: `${B}/inbox` },
 { id: "p-store", label: "Storefront", href: `${B}/storefront` },
 { id: "p-cust", label: "Customers", href: `${B}/customers` },
 { id: "p-mkt", label: "Marketing", href: `${B}/marketing` },
 { id: "p-disc", label: "Discounts", href: `${B}/discounts` },
 { id: "p-apps", label: "Apps & integrations", href: `${B}/apps` },
 { id: "p-pay", label: "Payments", href: `${B}/payments` },
 { id: "p-an", label: "Analytics", href: `${B}/dashboard` },
 { id: "p-trends", label: "Trends", href: `${B}/trends` },
 { id: "p-set", label: "Settings", href: `${B}/settings` },
];
const ACTIONS: Hit[] = [
 { id: "a-new", label: "New listing", sub: "Add an item", href: `${B}/add-listing` },
 { id: "a-cons", label: "Add consignor", href: `${B}/consignment/consignors` },
 { id: "a-disc", label: "New discount", href: `${B}/discounts` },
];

/** `hidden` = page ids the workspace has switched off (a closed inbox, say). The palette should
 *  never offer a door the sidebar has taken away. */
export default function CommandBar({ hidden }: { hidden?: string[] } = {}) {
 const router = useRouter();
 const [open, setOpen] = useState(false);
 const [q, setQ] = useState("");
 const [remote, setRemote] = useState<Group[]>([]);
 const [active, setActive] = useState(0);
 const [loading, setLoading] = useState(false);
 const inputRef = useRef<HTMLInputElement>(null);

 // ⌘K / Ctrl+K toggles; a sidebar button can also open it via the custom event.
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
 else if (e.key === "Escape") setOpen(false);
 };
 const onOpen = () => setOpen(true);
 window.addEventListener("keydown", onKey);
 window.addEventListener("vya:search", onOpen);
 return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("vya:search", onOpen); };
 }, []);

 // Reset + focus on open (deferred so state isn't set synchronously inside the effect).
 useEffect(() => {
 if (!open) return;
 const t = setTimeout(() => { setQ(""); setRemote([]); setActive(0); inputRef.current?.focus(); }, 20);
 return () => clearTimeout(t);
 }, [open]);

 // Debounced live search across orders / inventory / customers / consignors.
 useEffect(() => {
 if (!open) return;
 const term = q.trim();
 let live = true;
 const t = setTimeout(async () => {
 if (!term) { if (live) { setRemote([]); setLoading(false); } return; }
 setLoading(true);
 const r = await fetch(`/api/store/search?q=${encodeURIComponent(term)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 if (live) { setRemote(r?.groups || []); setLoading(false); }
 }, 180);
 return () => { live = false; clearTimeout(t); };
 }, [q, open]);

 const ql = q.trim().toLowerCase();
 const filt = (arr: Hit[]) => (ql ? arr.filter((h) => `${h.label} ${h.sub || ""}`.toLowerCase().includes(ql)) : arr);
 const localGroups: Group[] = [
 { group: "Actions", hits: filt(ACTIONS) },
 { group: "Go to", hits: filt(PAGES.filter((h) => !hidden?.includes(h.id))).slice(0, ql ? 6 : 15) },
 ].filter((g) => g.hits.length > 0);

 const groups: Group[] = [...remote, ...localGroups];
 const flat = groups.flatMap((g) => g.hits);
 const activeIdx = Math.min(active, Math.max(0, flat.length - 1));

 const go = useCallback((h: Hit) => { setOpen(false); router.push(h.href); }, [router]);
 const onKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
 else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
 else if (e.key === "Enter") { e.preventDefault(); const h = flat[activeIdx]; if (h) go(h); }
 };

 if (!open) return null;
 return (
 <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onClick={() => setOpen(false)}>
 <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center gap-2.5 border-b border-stone-100 px-4">
 <Search size={16} className="shrink-0 text-stone-400" />
 <input
 ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
 placeholder="Search orders, items, customers, consignors…"
 className="h-12 flex-1 bg-transparent text-[14px] text-stone-800 outline-none placeholder:text-stone-400"
 />
 <kbd className="shrink-0 rounded border border-stone-200 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">ESC</kbd>
 </div>
 <div className="max-h-[60vh] overflow-y-auto py-2">
 {flat.length === 0 ? (
 <p className="px-4 py-8 text-center text-[13px] text-stone-400">{loading ? "Searching…" : ql ? "No matches." : "Type to search anything…"}</p>
 ) : (
 groups.map((g) => (
 <div key={g.group} className="mb-1">
 <p className="px-4 pb-1 pt-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-stone-400">{g.group}</p>
 {g.hits.map((h) => {
 const i = flat.indexOf(h);
 const on = i === activeIdx;
 return (
 <button
 key={h.id} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
 className={cn("flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition", on ? "bg-[var(--accent-soft,#eafaf3)]" : "hover:bg-stone-50")}
 >
 <span className="min-w-0">
 <span className="block truncate text-[13.5px] font-medium text-stone-800">{h.label}</span>
 {h.sub && <span className="block truncate text-[12px] text-stone-400">{h.sub}</span>}
 </span>
 {on && <CornerDownLeft size={13} className="shrink-0 text-[var(--accent,#0e9f76)]" />}
 </button>
 );
 })}
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 );
}
