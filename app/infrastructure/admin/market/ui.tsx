"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/app/infrastructure/admin/ui";
import OfflinePill from "./OfflineSync";

// Market Mode primitives: a phone-first POS look inside the workspace shell. Big targets (≥56px),
// one primary action per screen, money always in cents → formatted here.

export const B = "/admin/market";

export function money(cents: number, currency = "USD"): string {
 return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** Admin preview (?store=slug) must reach every API call, or a preview would act on YOUR store. */
export function withStore(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

/** Keep ?store= on in-app links too. */
export function href(path: string): string {
 if (typeof window === "undefined") return path;
 const s = new URLSearchParams(window.location.search).get("store");
 return s ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(s)}` : path;
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
 const r = await fetch(withStore(path), { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
 const data = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
 return { ok: r.ok, status: r.status, data };
}

/** Poll a JSON endpoint while `active`; the Checkout screen lives on this. */
export function usePoll<T>(path: string | null, ms: number, keepGoing: boolean | ((data: T) => boolean)): { data: T | null; error: string | null; reload: () => void } {
 const [data, setData] = useState<T | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [tick, setTick] = useState(0);
 const reload = useCallback(() => setTick((t) => t + 1), []);
 useEffect(() => {
 if (!path) return;
 let alive = true;
 let timer: ReturnType<typeof setTimeout> | null = null;
 const run = async () => {
 try {
 const r = await api<T>(path);
 if (!alive) return;
 let more = typeof keepGoing === "function" ? true : keepGoing;
 if (r.ok) { setData(r.data as T); setError(null); if (typeof keepGoing === "function") more = keepGoing(r.data as T); }
 else setError(r.status === 401 ? "You've been signed out — sign in again. Your checkout is safe on the server and will still complete." : r.data.error || `Error ${r.status}`);
 if (alive && more) timer = setTimeout(run, ms);
 return;
 } catch { if (alive) setError("Offline — retrying…"); }
 if (alive) timer = setTimeout(run, ms);
 };
 run();
 const onVis = () => { if (document.visibilityState === "visible") run(); };
 document.addEventListener("visibilitychange", onVis);
 return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
 }, [path, ms, keepGoing, tick]);
 return { data, error, reload };
}

export type MarketItem = {
 id: string; title: string; priceCents: number; currency: string; image: string | null;
 brand: string | null; size: string | null; category: string | null; status: string; soldAt: string | null; onBringList: boolean;
 images?: string[]; description?: string | null; era?: string | null; material?: string | null; condition?: string | null;
 costCents?: number | null; source?: string; soldForCents?: number | null;
};

export function MarketPage({ title, back, children, className }: { title?: string; back?: string; children: React.ReactNode; className?: string }) {
 return (
 <div className={cn("mx-auto w-full min-w-0 max-w-lg px-4 pb-24 pt-4 sm:px-6 sm:pt-8 md:pb-10", className)}>
 {(title || back) && (
 <div className="mb-4 flex items-center gap-3">
 {back && <Link href={href(back)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-stone-600 shadow-sm ring-1 ring-stone-200" aria-label="Back">←</Link>}
 {title && <h1 className="text-[22px] font-semibold tracking-tight text-stone-900">{title}</h1>}
 </div>
 )}
 <OfflinePill />
 {children}
 </div>
 );
}

type BigVariant = "primary" | "secondary" | "danger" | "ghost";
const BIG: Record<BigVariant, string> = {
 primary: "bg-stone-900 text-white hover:bg-stone-800 disabled:bg-stone-300",
 secondary: "bg-white text-stone-900 ring-1 ring-stone-200 hover:bg-stone-50 disabled:text-stone-400",
 danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
 ghost: "bg-transparent text-stone-500 hover:bg-stone-100",
};
export function BigButton({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BigVariant }) {
 return <button className={cn("flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-[16px] font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed", BIG[variant], className)} {...props} />;
}
export function BigLink({ variant = "primary", className, ...props }: React.ComponentProps<typeof Link> & { variant?: BigVariant }) {
 return <Link className={cn("flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-[16px] font-semibold transition active:scale-[0.99]", BIG[variant], className)} {...props} />;
}

/** Sticky action bar at the bottom of a phone screen (above the tab bar). Renders an in-flow spacer
 *  exactly its own height, so the page can always scroll the last field out from under the buttons. */
export function ActionBar({ children }: { children: React.ReactNode }) {
 const ref = useRef<HTMLDivElement>(null);
 const [h, setH] = useState(160);
 useEffect(() => {
 const el = ref.current;
 if (!el) return;
 const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
 ro.observe(el);
 return () => ro.disconnect();
 }, []);
 // Fixed to the viewport, so on desktop it must start after the 228px sidebar to center under the page.
 return (
 <>
 <div aria-hidden style={{ height: h + 12 }} />
 <div ref={ref} className="fixed bottom-[64px] left-0 right-0 z-30 bg-[#f7f6f3]/95 backdrop-blur md:bottom-0 md:left-[228px]">
 <div className="mx-auto w-full max-w-lg space-y-2 px-4 pb-3 pt-2 sm:px-6">{children}</div>
 </div>
 </>
 );
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
 active: { text: "Available", cls: "bg-emerald-50 text-emerald-700" },
 draft: { text: "Quick-listed", cls: "bg-sky-50 text-sky-700" },
 reserved: { text: "In checkout", cls: "bg-[#5D0F17]/10 text-[#5D0F17]" },
 sold: { text: "Sold", cls: "bg-stone-200 text-stone-600" },
 removed: { text: "Removed", cls: "bg-stone-200 text-stone-600" },
};
export function StatusChip({ status }: { status: string }) {
 const s = STATUS_LABEL[status] ?? { text: status, cls: "bg-stone-100 text-stone-600" };
 return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>{s.text}</span>;
}

/** Wrap every occurrence of the query's words in a wine-tinted mark, so a search result shows WHY it matched. */
export function Highlight({ text, query }: { text: string; query?: string }) {
 const words = (query || "").trim().split(/\s+/).filter((w) => w.length > 1);
 if (!words.length) return <>{text}</>;
 const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
 return <>{text.split(re).map((part, i) => (re.test(part) && (re.lastIndex = 0, true) ? <mark key={i} className="rounded-[3px] bg-[#5D0F17]/10 px-0.5 text-[#5D0F17]">{part}</mark> : <span key={i}>{part}</span>))}</>;
}

export function ItemCard({ item, to, right, dim, highlight }: { item: MarketItem; to?: string; right?: React.ReactNode; dim?: boolean; highlight?: string }) {
 const body = (
 <div className={cn("flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 transition", to && "hover:border-stone-300 active:bg-stone-50", dim && "opacity-60")}>
 <Thumb src={item.image} alt={item.title} size={64} />
 <div className="min-w-0 flex-1">
 <p className="line-clamp-2 text-[15px] font-medium leading-snug text-stone-900"><Highlight text={item.title} query={highlight} /></p>
 <p className="mt-0.5 truncate text-[12.5px] text-stone-500"><Highlight text={[item.brand, item.size && `Size ${item.size}`, item.category].filter(Boolean).join(" · ") || "—"} query={highlight} /></p>
 <div className="mt-1.5 flex items-center gap-2"><StatusChip status={item.status} />{!item.onBringList && <span className="text-[11px] text-stone-400">not on bring list</span>}</div>
 </div>
 <div className="shrink-0 text-right">{right ?? <p className="text-[17px] font-semibold text-stone-900">{money(item.priceCents, item.currency)}</p>}</div>
 </div>
 );
 return to ? <Link href={href(to)} className="block">{body}</Link> : body;
}

export function Thumb({ src, alt, size = 64, className, fill }: { src: string | null; alt: string; size?: number; className?: string; fill?: boolean }) {
 const style = fill ? { width: "100%", maxHeight: 380 } : { width: size, height: size };
 return src
 // eslint-disable-next-line @next/next/no-img-element
 ? <img src={src} alt={alt} className={cn("shrink-0 object-cover", fill ? "object-contain" : "rounded-xl", className)} style={style} />
 : <div className={cn("grid shrink-0 place-items-center rounded-xl bg-stone-100 text-[10px] text-stone-400", className)} style={fill ? { width: "100%", height: 140 } : style}>no photo</div>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
 return (
 <div className="rounded-2xl border border-stone-200 bg-white p-4">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</p>
 <p className="mt-1 text-[26px] font-semibold tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)" }}>{value}</p>
 {sub && <p className="text-[12px] text-stone-500">{sub}</p>}
 </div>
 );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "success"; children: React.ReactNode }) {
 const cls = { info: "border-sky-200 bg-sky-50 text-sky-900", warn: "border-amber-200 bg-amber-50 text-amber-900", danger: "border-red-200 bg-red-50 text-red-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
 return <div className={cn("rounded-2xl border px-4 py-3 text-[13.5px]", cls)}>{children}</div>;
}

/** The Market Mode switch look, reusable for every on/off in this area. Pass `onClick` for a real
 *  control; omit it for a read-only state indicator. */
export function Switch({ on, onClick, disabled, label, className }: { on: boolean; onClick?: () => void; disabled?: boolean; label?: string; className?: string }) {
 const Tag = onClick ? "button" : "span";
 return (
 <Tag type={onClick ? "button" : undefined} onClick={onClick} disabled={onClick ? disabled : undefined} aria-pressed={onClick ? on : undefined} aria-label={label}
 className={cn("relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition", on ? "bg-[#5D0F17]" : "bg-stone-300", disabled && "opacity-50", className)}>
 <span className={cn("inline-block h-[20px] w-[20px] rounded-full bg-white shadow transition", on ? "translate-x-[23px]" : "translate-x-[3px]")} />
 </Tag>
 );
}

/** SOLD feedback the seller feels without looking: a short buzz and a two-note chime. Best-effort. */
export function celebrateSold(): void {
 try { navigator.vibrate?.([40, 60, 80]); } catch { /* unsupported */ }
 try {
 const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
 if (!Ctx) return;
 const ctx = new Ctx();
 const note = (f: number, t0: number, d: number) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + d); };
 note(880, ctx.currentTime, 0.18); note(1320, ctx.currentTime + 0.16, 0.28);
 setTimeout(() => ctx.close().catch(() => {}), 800);
 } catch { /* no audio */ }
}

/** A stable per-device key so a double-tap or a retried request can't open two checkouts. */
export function newClientKey(): string {
 return `ck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
