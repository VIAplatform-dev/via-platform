"use client";

// Category controls, both built on the same idea: a category is a PATH — a family, then a
// category inside it. The editor states that path as a breadcrumb ("Bags › Totes"); the
// inventory filter walks it (pick a family, then narrow). Two views of one hierarchy, so
// what you tag with and what you filter by read the same way.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";
import {
 CATEGORY_GROUPS, OTHER_FAMILY, categoryTagLabel, categoryValueLabel, categoryFamily,
 familySlugs, isCanonicalCategory,
} from "@/app/lib/item-tags";

// Positioning is left to the caller — the breadcrumb anchors its menu, the header filter
// portals its own out of the table's scroll container.
const MENU_BASE = "z-30 max-h-64 min-w-[190px] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-[0_16px_44px_-12px_rgba(16,24,40,0.35)]";
const MENU = cn("absolute left-0 top-full mt-1.5", MENU_BASE);
const MENU_ITEM = "flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-stone-700 transition hover:bg-[var(--accent-soft,#eafaf3)] hover:text-[var(--accent-ink,#0b7a5c)]";
const CRUMB = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition disabled:pointer-events-none disabled:opacity-40";

/** Closes the dropdown on an outside click or Escape. */
function useDismiss<T extends HTMLElement>(onDismiss: () => void) {
 const ref = useRef<T>(null);
 useEffect(() => {
  const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onDismiss(); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
  document.addEventListener("mousedown", away);
  document.addEventListener("keydown", esc);
  return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
 }, [onDismiss]);
 return ref;
}

// ── The editor control: Bags › Totes ─────────────────────────────────────────
// The value is a canonical slug, or — under the "Other" family — whatever the seller typed.
export function CategoryBreadcrumb({ value, onChange, className }: {
 value: string | null;
 onChange: (v: string | null) => void;
 className?: string;
}) {
 // The family shown is the one the value belongs to, until you open the family menu and
 // choose a different one — then it's pending until you pick a category inside it.
 const [pendingFamily, setPendingFamily] = useState<string | null>(null);
 const [open, setOpen] = useState<"family" | "category" | null>(null);
 const [typed, setTyped] = useState("");
 const ref = useDismiss<HTMLDivElement>(() => setOpen(null));
 const customInput = useRef<HTMLInputElement>(null);

 const family = pendingFamily ?? (value ? categoryFamily(value) : null);
 const kids = family && family !== OTHER_FAMILY ? familySlugs(family) : [];
 const isOther = family === OTHER_FAMILY;
 const customValue = value && !isCanonicalCategory(value) ? value : null;

 const pickFamily = (label: string) => {
  if (label === family) { setOpen(null); return; }
  setPendingFamily(label);
  onChange(null);                       // the old category no longer belongs to this family
  if (label === OTHER_FAMILY) {
   setTyped("");
   setOpen(null);
   setTimeout(() => customInput.current?.focus(), 0);
  } else {
   setOpen("category");                 // straight on to the second half of the path
  }
 };
 const commitCustom = () => {
  const t = typed.trim();
  if (t) { onChange(t); setPendingFamily(null); }
 };

 return (
  <div ref={ref} className={cn("flex flex-wrap items-center gap-2", className)}>
   <div className="relative">
    <button
     type="button" aria-haspopup="listbox" aria-expanded={open === "family"}
     onClick={() => setOpen((o) => (o === "family" ? null : "family"))}
     className={cn(CRUMB, family
      ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white"
      : "border-stone-300 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-600")}
    >
     {family || "Family"}
     <span className={cn("text-[9px]", family ? "text-white/70" : "text-stone-400")}>▾</span>
    </button>
    {open === "family" && (
     <div className={MENU} role="listbox">
      {CATEGORY_GROUPS.map((g) => (
       <button
        key={g.label} type="button" role="option" aria-selected={family === g.label}
        onClick={() => pickFamily(g.label)}
        className={cn(MENU_ITEM, family === g.label && "text-[var(--accent-ink,#0b7a5c)]")}
       >
        <span>{g.label}</span>
        <span className="font-mono text-[10px] tabular-nums text-stone-400">{g.slugs.length}</span>
       </button>
      ))}
      {/* Escape hatch — a taxonomy this small can't name everything a vintage store sells. */}
      <div className="mt-1 border-t border-stone-100 pt-1">
       <button
        type="button" role="option" aria-selected={isOther}
        onClick={() => pickFamily(OTHER_FAMILY)}
        className={cn(MENU_ITEM, isOther && "text-[var(--accent-ink,#0b7a5c)]")}
       >
        <span>Other…</span>
        <span className="text-[10px] text-stone-400">type your own</span>
       </button>
      </div>
     </div>
    )}
   </div>

   <span className="select-none text-[13px] text-stone-300">›</span>

   {isOther ? (
    <input
     ref={customInput}
     value={customValue && !typed ? customValue : typed}
     onChange={(e) => setTyped(e.target.value)}
     onBlur={commitCustom}
     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCustom(); } }}
     placeholder="Type a category"
     aria-label="Custom category"
     className={cn(
      "w-44 rounded-full border px-3 py-1.5 text-xs outline-none transition",
      customValue
       ? "border-[var(--accent,#0e9f76)] bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)]"
       : "border-stone-300 bg-white text-stone-700 placeholder:text-stone-400 focus:border-[var(--accent,#0e9f76)]",
     )}
    />
   ) : (
    <div className="relative">
     <button
      type="button" aria-haspopup="listbox" aria-expanded={open === "category"} disabled={!family}
      onClick={() => setOpen((o) => (o === "category" ? null : "category"))}
      className={cn(CRUMB, value
       ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white"
       : "border-stone-300 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-600")}
     >
      {value ? categoryValueLabel(value) : family ? "Pick one" : "Category"}
      <span className={cn("text-[9px]", value ? "text-white/70" : "text-stone-400")}>▾</span>
     </button>
     {open === "category" && family && (
      <div className={MENU} role="listbox">
       {kids.map((s) => (
        <button
         key={s} type="button" role="option" aria-selected={value === s}
         onClick={() => { onChange(s); setPendingFamily(null); setOpen(null); }}
         className={cn(MENU_ITEM, value === s && "text-[var(--accent-ink,#0b7a5c)]")}
        >
         <span>{categoryTagLabel(s)}</span>
         {value === s && <span className="text-[11px] text-[var(--accent,#0e9f76)]">✓</span>}
        </button>
       ))}
      </div>
     )}
    </div>
   )}

   {value && (
    <button
     type="button"
     onClick={() => { onChange(null); setPendingFamily(null); setTyped(""); setOpen(null); }}
     className="text-[11px] text-stone-400 underline-offset-2 transition hover:text-stone-700 hover:underline"
    >
     clear
    </button>
   )}
  </div>
 );
}

// ── Column-header filter ─────────────────────────────────────────────────────
// The filter lives in the header of the column it filters, so the table needs no bar
// above it. The header shows the active value in the accent colour — that, plus the
// count rail under the table, is what keeps an invisible filter from being a trap.
export function HeaderFilter({ label, value, onClear, children }: {
 label: string;
 value: string | null;
 onClear: () => void;
 children: (close: () => void) => React.ReactNode;
}) {
 const [open, setOpen] = useState(false);
 const [at, setAt] = useState<{ top: number; left: number } | null>(null);
 const ref = useDismiss<HTMLDivElement>(() => setOpen(false));
 const anchor = useRef<HTMLButtonElement>(null);

 // The table scrolls horizontally, which also clips vertically — so the menu is positioned
 // fixed against the button's viewport rect and portalled out of the scroll container.
 const place = () => {
  const r = anchor.current?.getBoundingClientRect();
  setAt(r ? { top: r.bottom + 6, left: r.left } : null);
 };
 // Keep it stuck to the header while the page or the table scrolls under it.
 useEffect(() => {
  if (!open) return;
  const reposition = () => {
   const r = anchor.current?.getBoundingClientRect();
   if (r) setAt({ top: r.bottom + 6, left: r.left });
  };
  addEventListener("scroll", reposition, true);
  addEventListener("resize", reposition);
  return () => { removeEventListener("scroll", reposition, true); removeEventListener("resize", reposition); };
 }, [open]);

 return (
  <div ref={ref} className="inline-block">
   <button
    ref={anchor} type="button" aria-haspopup="menu" aria-expanded={open}
    onClick={() => { if (!open) place(); setOpen((o) => !o); }}
    className={cn(
     "inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition",
     value ? "text-[var(--accent-ink,#0b7a5c)]" : "text-stone-400 hover:text-stone-600",
    )}
   >
    {value || label}
    <span className="text-[8px] opacity-70">▾</span>
   </button>
   {value && (
    <button
     type="button" aria-label={`Clear ${label} filter`}
     onClick={onClear}
     className="ml-1 align-middle text-[10px] text-stone-400 transition hover:text-stone-700"
    >
     ✕
    </button>
   )}
   {open && at && createPortal(
    <div
     className={cn(MENU_BASE, "fixed normal-case tracking-normal")}
     style={{ top: at.top, left: at.left }}
     role="menu"
     onMouseDown={(e) => e.stopPropagation()}
    >
     {children(() => setOpen(false))}
    </div>,
    document.body,
   )}
  </div>
 );
}

// The category menu's body — an accordion, because the flat form ran to ~35 rows once every
// subcategory of every present family was offered. One family open at a time; the family
// holding the current filter opens itself. A family row expands rather than filtering, so
// "everything in Bags" is its own first child instead of a second hit target on the row.
export function CategoryFilterMenu({ groups, counts, familyCounts, total, untagged, family, value, onPick }: {
 groups: { label: string; values: string[] }[];
 counts: Record<string, number>;
 familyCounts: Record<string, number>;
 total: number;
 untagged: number;
 family: string | null;
 value: string | null;
 onPick: (family: string | null, value: string | null) => void;
}) {
 const [openFamily, setOpenFamily] = useState<string | null>(family);
 return (
  <>
   <p className="px-2.5 pb-1 pt-1.5 font-mono text-[9.5px] uppercase tracking-[0.11em] text-stone-400">Filter by category</p>
   <HeaderFilterItem label="All categories" count={total} selected={!value && !family} onClick={() => onPick(null, null)} />
   {groups.map((g) => {
    const expanded = openFamily === g.label;
    const holdsSelection = family === g.label;
    return (
     <div key={g.label} className="mt-1 border-t border-stone-100 pt-1">
      <button
       type="button" aria-expanded={expanded}
       onClick={() => setOpenFamily(expanded ? null : g.label)}
       className={cn(MENU_ITEM, "font-sans", holdsSelection && "text-[var(--accent-ink,#0b7a5c)]")}
      >
       <span className="flex items-center gap-1.5">
        <span className={cn("text-[8px] text-stone-400 transition-transform", expanded && "rotate-90")}>▶</span>
        <span className={cn(holdsSelection && "font-semibold")}>{g.label}</span>
       </span>
       <span className="font-mono text-[10px] tabular-nums text-stone-400">{familyCounts[g.label] ?? 0}</span>
      </button>
      {expanded && (
       <>
        <HeaderFilterItem
         indent label={`All ${g.label.toLowerCase()}`} count={familyCounts[g.label] ?? 0}
         selected={holdsSelection && !value} onClick={() => onPick(g.label, null)}
        />
        {g.values.map((v) => (
         <HeaderFilterItem
          key={v} indent label={categoryValueLabel(v)} count={counts[v] ?? 0}
          selected={value === v} onClick={() => onPick(g.label, v)}
         />
        ))}
       </>
      )}
     </div>
    );
   })}
   {untagged > 0 && (
    <p className="mt-1 border-t border-stone-100 px-2.5 pb-1 pt-2 text-[11px] font-normal normal-case tracking-normal text-stone-400">{untagged} uncategorised</p>
   )}
  </>
 );
}

export function HeaderFilterItem({ label, count, selected, onClick, indent }: {
 label: string; count?: number; selected?: boolean; onClick: () => void; indent?: boolean;
}) {
 return (
  <button
   type="button" role="menuitem" disabled={count === 0 && !selected}
   onClick={onClick}
   className={cn(MENU_ITEM, "font-sans font-normal", indent && "pl-6", selected && "font-semibold text-[var(--accent-ink,#0b7a5c)]", count === 0 && !selected && "pointer-events-none opacity-40")}
  >
   <span>{label}</span>
   {count != null && <span className="font-mono text-[10px] tabular-nums text-stone-400">{count}</span>}
  </button>
 );
}
