// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure admin design system — the "techie white" look from the pitch deck.
// Mint-green as the primary accent, uppercase mono micro-labels, metric cards with
// sparklines, status pills, and hairline data tables. Scoped to /infrastructure/admin
// only (the accent is set as --accent on the admin shell; the seller /store portal
// keeps its wine accent via the maroon fallback in @/app/store/ui).
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Green scale (deck mint). --accent drives the shared components inside the admin.
export const GREEN = {
 ink: "#0b7a5c", // deep mint — text/links on white
 accent: "#0e9f76", // primary
 bright: "#2fd39b", // sparklines, live dots, fills
 soft: "#eafaf3", // tints (pills, hover)
} as const;

// ── Section label — uppercase tracked mono chip (deck's "DISTRIBUTION" / "OPERATE") ──
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
 return (
 <span className={cn("inline-flex items-center rounded-md border border-stone-200 bg-white px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500", className)}>
 {children}
 </span>
 );
}

// ── Card — hairline border, soft shadow, white ──
export function TechCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
 return <div className={cn("rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.12)]", className)} {...props}>{children}</div>;
}

// ── Sparkline — tiny SVG line + area from a series ──
export function Sparkline({ data, up = true, w = 132, h = 40, className }: { data?: number[]; up?: boolean; w?: number; h?: number; className?: string }) {
 const series = data && data.length > 1 ? data : [4, 6, 5, 7, 6, 8, 7, 9, 8, 11, 10, 13];
 const min = Math.min(...series), max = Math.max(...series);
 const span = max - min || 1;
 const stepX = w / (series.length - 1);
 const pts = series.map((v, i) => [i * stepX, h - 4 - ((v - min) / span) * (h - 8)] as const);
 const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
 const area = `${line} L${w},${h} L0,${h} Z`;
 const color = up ? "var(--accent-bright,#2fd39b)" : "#f0788a";
 const gid = `spk${Math.round(w)}${up ? "u" : "d"}${series.length}`;
 return (
 <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} preserveAspectRatio="none" aria-hidden="true">
 <defs>
 <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={color} stopOpacity="0.22" />
 <stop offset="100%" stopColor={color} stopOpacity="0" />
 </linearGradient>
 </defs>
 <path d={area} fill={`url(#${gid})`} />
 <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
 <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
 </svg>
 );
}

// ── Area chart — larger, editorial hero chart with faint baseline + gradient ──
export function AreaChart({ data, up = true, h = 168, className }: { data?: number[]; up?: boolean; h?: number; className?: string }) {
 const series = data && data.length > 1 ? data : [5, 6, 5.5, 7, 6.5, 8, 7.5, 9, 8, 10, 9.5, 12, 11, 13];
 const w = 640;
 const min = Math.min(...series), max = Math.max(...series);
 const span = max - min || 1;
 const stepX = w / (series.length - 1);
 const pad = 10;
 const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
 const pts = series.map((v, i) => [i * stepX, y(v)] as const);
 const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
 const area = `${line} L${w},${h} L0,${h} Z`;
 const color = up ? "var(--accent,#0e9f76)" : "#f0788a";
 return (
 <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)} style={{ height: h }} preserveAspectRatio="none" aria-hidden="true">
 <defs>
 <linearGradient id="areaHero" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={color} stopOpacity="0.16" />
 <stop offset="100%" stopColor={color} stopOpacity="0" />
 </linearGradient>
 </defs>
 {[0.25, 0.5, 0.75].map((f) => (
 <line key={f} x1="0" x2={w} y1={pad + f * (h - pad * 2)} y2={pad + f * (h - pad * 2)} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
 ))}
 <path d={area} fill="url(#areaHero)" />
 <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
 <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.2" fill="#fff" stroke={color} strokeWidth="2.2" />
 </svg>
 );
}

// ── Metric card — uppercase label + big number + sparkline + delta pill (deck) ──
export function MetricCard({ label, value, delta, sub, data, up = true, className }: {
 label: string; value: React.ReactNode; delta?: string; sub?: string; data?: number[]; up?: boolean; className?: string;
}) {
 return (
 <TechCard className={cn("relative overflow-hidden p-4", className)}>
 <div className="flex items-start justify-between gap-2">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-400">{label}</p>
 {delta && (
 <span className={cn("rounded-full px-1.5 py-[1px] text-[10px] font-semibold tabular-nums", up ? "bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]" : "bg-rose-50 text-rose-500")}>
 {up ? "↑" : "↓"} {delta}
 </span>
 )}
 </div>
 <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-stone-900 tabular-nums">{value}</p>
 {sub && <p className="mt-1 text-[11px] text-stone-400">{sub}</p>}
 {data !== undefined && (
 <div className="pointer-events-none mt-3 -mb-1 w-full">
 <Sparkline data={data} up={up} w={240} h={38} className="w-full" />
 </div>
 )}
 </TechCard>
 );
}

// ── Status pill — live/paid (green), pending/draft (amber), sold (neutral), down (rose) ──
type PillTone = "live" | "pending" | "neutral" | "down" | "info";
const PILL: Record<PillTone, string> = {
 live: "bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]",
 pending: "bg-amber-50 text-amber-600",
 neutral: "bg-stone-100 text-stone-500",
 down: "bg-rose-50 text-rose-500",
 info: "bg-sky-50 text-sky-600",
};
export function StatusPill({ tone = "neutral", dot, children, className }: { tone?: PillTone; dot?: boolean; children: React.ReactNode; className?: string }) {
 return (
 <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", PILL[tone], className)}>
 {dot && <span className={cn("h-1.5 w-1.5 rounded-full", tone === "live" ? "bg-[var(--accent-bright,#2fd39b)]" : "bg-current opacity-70")} />}
 {children}
 </span>
 );
}

// ── Toggle — green when on ──
export function Toggle({ on, onClick, className }: { on: boolean; onClick?: () => void; className?: string }) {
 return (
 <button type="button" onClick={onClick} aria-pressed={on} className={cn("relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition", on ? "bg-[var(--accent,#0e9f76)]" : "bg-stone-200", className)}>
 <span className={cn("inline-block h-[17px] w-[17px] rounded-full bg-white shadow transition", on ? "translate-x-[19px]" : "translate-x-[3px]")} />
 </button>
 );
}

// ── Bar chart — vertical green bars (deck's sales-by-channel) ──
export function BarChart({ data, h = 150, showValues = true, money: asMoney = false, className }: { data: { label: string; value: number }[]; h?: number; showValues?: boolean; money?: boolean; className?: string }) {
 const max = Math.max(...data.map((d) => d.value), 1);
 const fmt = (v: number) => `${asMoney ? "$" : ""}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`;
 const topPad = showValues ? 20 : 6;
 return (
 <div className={cn("flex items-end gap-1.5", className)} style={{ height: h }}>
 {data.map((d, i) => (
 <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
 {showValues && <span className="font-mono text-[9px] tabular-nums text-stone-400">{fmt(d.value)}</span>}
 <div
 className="w-full max-w-[42px] rounded-t-[5px] bg-gradient-to-t from-[var(--accent,#0e9f76)] to-[var(--accent-bright,#2fd39b)]"
 style={{ height: `${Math.max(4, (d.value / max) * (h - topPad - 14))}px` }}
 />
 <span className="w-full truncate text-center font-mono text-[8.5px] uppercase tracking-[0.06em] text-stone-400">{d.label}</span>
 </div>
 ))}
 </div>
 );
}

// ── Donut chart — distribution ring with segments (Pango-style distribution) ──
export const DONUT_COLORS = ["#0e9f76", "#2fd39b", "#7fd8b8", "#b8e6d4", "#e6b980", "#c99a6a", "#c9cdd2"];
export function DonutChart({ data, size = 128, thickness = 16, className }: { data: { label: string; value: number }[]; size?: number; thickness?: number; className?: string }) {
 const total = data.reduce((s, d) => s + d.value, 0) || 1;
 const r = (size - thickness) / 2;
 const c = 2 * Math.PI * r;
 const gap = 2; // px gap between segments
 // Precompute each segment's arc + cumulative start offset with no mutable accumulator
 // (reassigning a `let` in a render-phase map trips the React compiler).
 const arcs = data.map((d) => (d.value / total) * c);
 const segs = data.map((d, i) => ({
 color: DONUT_COLORS[i % DONUT_COLORS.length],
 len: Math.max(0, arcs[i] - gap),
 offset: arcs.slice(0, i).reduce((s, v) => s + v, 0),
 }));
 return (
 <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className}>
 <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
 <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={thickness} />
 {segs.map((s, i) => (
 <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${s.len} ${c - s.len}`} strokeDashoffset={-s.offset} />
 ))}
 </g>
 </svg>
 );
}

// ── Segmented control — Today / 7d / 30d / 90d (Pango-style filter) ──
export function SegmentedControl({ options, value, onChange, className }: { options: string[]; value: string; onChange: (v: string) => void; className?: string }) {
 return (
 <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-stone-200 bg-white p-[3px]", className)}>
 {options.map((o) => (
 <button key={o} type="button" onClick={() => onChange(o)} className={cn("rounded-full px-3 py-1 text-[12px] font-medium tabular-nums transition", value === o ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800")}>{o}</button>
 ))}
 </div>
 );
}

// ── Demand row — brand name + mini sparkline + delta (deck's "what to source") ──
export function DemandRow({ name, delta, up, data }: { name: string; delta: string; up: boolean; data?: number[] }) {
 return (
 <div className="flex items-center justify-between gap-3 border-t border-stone-100 py-2.5 first:border-t-0">
 <span className="truncate text-[13px] font-medium text-stone-700">{name}</span>
 <div className="flex items-center gap-3">
 <Sparkline data={data} up={up} w={64} h={22} />
 <span className={cn("w-12 text-right text-[12px] font-semibold tabular-nums", up ? "text-[var(--accent-ink,#0b7a5c)]" : "text-rose-500")}>{up ? "▲" : "▼"} {delta}</span>
 </div>
 </div>
 );
}

// ── Page shell — the one editorial frame every admin page shares ──────────────
// Warm-canvas container + eyebrow/serif header, matched to Home. Use so pages read
// as one piece of software instead of 20 different Tailwind layouts.
export const serif = { fontFamily: "var(--font-display)" } as React.CSSProperties;

export function AdminPage({ children, className }: { children: React.ReactNode; className?: string }) {
 return <div className={cn("mx-auto max-w-6xl px-6 py-9 sm:px-10", className)}>{children}</div>;
}

export function AdminHeader({ eyebrow, title, subtitle, actions, className }: {
 eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
 return (
 <div className={cn("mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
 <div className="min-w-0">
 {eyebrow && <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">{eyebrow}</p>}
 <h1 className="mt-2 text-[30px] leading-none tracking-[-0.015em] text-stone-900" style={serif}>{title}</h1>
 {subtitle && <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-stone-500">{subtitle}</p>}
 </div>
 {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
 </div>
 );
}

// ── Button — pill, green primary / hairline secondary / ghost (admin-scoped) ──
type AdminBtn = "primary" | "secondary" | "ghost";
const ADMIN_BTN: Record<AdminBtn, string> = {
 primary: "bg-[var(--accent,#0e9f76)] text-white hover:bg-[var(--accent-hover,#0b8a66)] shadow-[0_1px_2px_rgba(16,24,40,0.08)]",
 secondary: "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
 ghost: "text-stone-500 hover:bg-stone-100 hover:text-stone-800",
};
const ADMIN_BTN_BASE = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-50";
export function TechButton({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AdminBtn }) {
 return <button className={cn(ADMIN_BTN_BASE, ADMIN_BTN[variant], className)} {...props} />;
}
export function TechButtonLink({ variant = "primary", className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: AdminBtn }) {
 return <a className={cn(ADMIN_BTN_BASE, ADMIN_BTN[variant], className)} {...props} />;
}

// ── Empty state — dashed hairline, calm ──
export function TechEmpty({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode; className?: string }) {
 return (
 <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white/60 px-6 py-16 text-center", className)}>
 {icon && <div className="mb-3 text-stone-300">{icon}</div>}
 <p className="text-[14px] font-medium text-stone-700">{title}</p>
 {body && <p className="mt-1 max-w-sm text-[13px] text-stone-500">{body}</p>}
 {action && <div className="mt-5">{action}</div>}
 </div>
 );
}

// ── Data table primitives — uppercase headers, tabular nums, hairline rows ──
export function TH({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
 return <th className={cn("border-b border-stone-200 pt-4 pb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400", right ? "text-right" : "text-left", className)}>{children}</th>;
}
export function TD({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
 return <td className={cn("border-b border-stone-100 py-3 text-[13px] text-stone-700", right ? "text-right tabular-nums" : "text-left", className)}>{children}</td>;
}
