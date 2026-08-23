// ─────────────────────────────────────────────────────────────────────────────
// Seller-portal design system. A small set of primitives so every admin page
// looks like one cohesive piece of software (Shopify/Stripe-style) instead of
// ad-hoc Tailwind. Palette: warm-neutral "stone" greys + a single restrained
// wine accent (#5D0F17). System sans, hairline borders, dense + calm.
// The consumer surfaces (storefronts, marketplace) keep the boutique look —
// this is ONLY for /store/* admin.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const ADMIN_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const ACCENT = "#5D0F17";

// ── Button ──────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";
const BTN_SIZES: Record<BtnSize, string> = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5 text-[13px]", lg: "h-10 px-4 text-sm" };
const BTN_VARIANTS: Record<BtnVariant, string> = {
 primary: "bg-[var(--accent,#5D0F17)] text-white hover:bg-[var(--accent-hover,#4a0c12)] shadow-sm",
 secondary: "bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 shadow-sm",
 ghost: "text-stone-600 hover:bg-stone-100",
 danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};
export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
 return <button className={cn("inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap", BTN_SIZES[size], BTN_VARIANTS[variant], className)} {...props} />;
}
// Link styled as a button (same look, <a> semantics).
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: BtnVariant; size?: BtnSize }) {
 return <a className={cn("inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition", BTN_SIZES[size], BTN_VARIANTS[variant], className)} {...props} />;
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
 return <div className={cn("rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)} {...props}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
 return (
 <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
 <div className="min-w-0">
 <h3 className="text-[13px] font-semibold text-stone-900">{title}</h3>
 {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
 </div>
 {action}
 </div>
 );
}

// ── Status pill ───────────────────────────────────────────────────────────────
type Tone = "neutral" | "success" | "warning" | "critical" | "info" | "accent";
const TONES: Record<Tone, string> = {
 neutral: "bg-stone-100 text-stone-600",
 success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10",
 warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
 critical: "bg-red-50 text-red-700 ring-1 ring-red-600/10",
 info: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10",
 accent: "bg-[var(--accent-soft,rgba(93,15,23,0.07))] text-[var(--accent,#5D0F17)]",
};
export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
 return (
 <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", TONES[tone], className)}>
 {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
 {children}
 </span>
 );
}

// ── Page header ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
 return (
 <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
 <div>
 <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">{title}</h1>
 {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
 </div>
 {actions && <div className="flex items-center gap-2">{actions}</div>}
 </div>
 );
}

// ── Stat / metric ─────────────────────────────────────────────────────────────
export function Stat({ label, value, hint, trend }: { label: string; value: React.ReactNode; hint?: React.ReactNode; trend?: { dir: "up" | "down"; value: string } }) {
 return (
 <Card className="px-5 py-4">
 <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-400">{label}</p>
 <div className="mt-2 flex items-baseline gap-2">
 <span className="text-[26px] font-semibold tracking-[-0.02em] text-stone-900 tabular-nums">{value}</span>
 {trend && <span className={cn("text-xs font-medium tabular-nums", trend.dir === "up" ? "text-emerald-600" : "text-red-500")}>{trend.dir === "up" ? "↑" : "↓"} {trend.value}</span>}
 </div>
 {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
 </Card>
 );
}

// ── Form bits ─────────────────────────────────────────────────────────────────
export const inputCls = "h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/[0.06]";
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
 return <input {...props} className={cn(inputCls, props.className)} />;
}
export function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
 return (
 <label className="block">
 <span className="mb-1.5 block text-[13px] font-medium text-stone-700">
 {label}
 {required && <span className="ml-0.5 text-rose-500" title="Required to publish" aria-label="required">*</span>}
 </span>
 {children}
 {hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}
 </label>
 );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
 return (
 <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50 px-6 py-16 text-center">
 {icon && <div className="mb-3 text-stone-300">{icon}</div>}
 <p className="text-sm font-medium text-stone-700">{title}</p>
 {body && <p className="mt-1 max-w-sm text-[13px] text-stone-500">{body}</p>}
 {action && <div className="mt-5">{action}</div>}
 </div>
 );
}
