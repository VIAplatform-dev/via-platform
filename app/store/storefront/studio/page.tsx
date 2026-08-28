"use client";

// Chat-first storefront studio (tracks 1–3).
// The builder: describe it to VYA on the left; on the right, a LIVE, EDITABLE preview of the
// store. Text is click-to-edit inline, sections drag to reorder, and a page dropdown switches
// which page you're editing — all on the same canvas the assistant edits. Reuses the existing
// Blocks renderer (edit mode) + the design API. Every change autosaves; VYA's changes reload it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStoreBase } from "../../nav-base";
import Sidekick from "../../Sidekick";
import Blocks, { decodeEntities, effectiveSectionColors } from "@/app/s/Blocks";
import { StoreHeader, StoreFooter, HEADER_LAYOUTS, type ChromeNav, type HeaderLayout } from "@/app/s/StoreChrome";
import { stripThemeBackgroundOverrides } from "@/app/lib/theme-css";
import { makeBlock, makeOverlay, newBlockId, pageSlugify, blockDef, backgroundEmbedSrc, minSectionHeight, maxSectionHeight, type Block, type BlockType, type BlockStyle, type BgMedia, type FreeStyle, type Overlay, type OverlayKind, type StorePage } from "@/app/lib/storefront-blocks";
import { STOREFRONT_TEMPLATES, templateBlocks, templateShopBlocks, templatePages, STOREFRONT_PALETTES, HEADING_FONTS, BODY_FONTS, SERIF_FONTS, ALL_STOREFRONT_FONTS, storefrontFontsHref, isTemplatePageSlug, type StorefrontTemplate } from "@/app/lib/storefront-templates";
import { HexInput, ColorSwatch, ColorDot } from "@/app/store/storefront/ColorPicker";
import SectionThumb from "@/app/store/storefront/SectionThumb";
import ItemsEditor from "@/app/store/storefront/ItemsEditor";
import { variantsFor, resolveVariant, variantDefaults, normalizeVariant, SECTION_CATEGORIES, VARIANTS, type SectionCategory } from "@/app/lib/storefront-variants";
import { applyVariant, switchNotes } from "@/app/lib/storefront-variant-switch";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";
// The skin PICKER is gone (templates replaced it), but skin state is still read and passed
// through to <Blocks> so stores that already chose one keep rendering as they do today.
import { isSkin, type SkinId } from "@/app/lib/storefront-skins";
import type { ResizeHandle } from "@/app/s/blocks/kit";
import { ChevronLeft, ChevronRight, Monitor, Tablet, Smartphone, ExternalLink, ChevronDown, ChevronUp, Plus, X, Check, LayoutTemplate, Palette, Layers, Sparkles, Type, Image as ImageIcon, Film, Link as LinkIcon, MousePointerClick, Trash2, Copy, Square, Circle, Minus, BringToFront, SendToBack, Search, Undo2, Redo2, RotateCcw, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Shapes, Upload as UploadIcon, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

type Colors = { bg: string; text: string; accent: string };
type Fonts = { heading: string; body: string };
type Radius = "sharp" | "soft" | "round";

// Pull an overlay fully back inside its section using its stored size (shapes/images/lines carry
// w/h as % of the section). Position-only — the box is moved, never resized — matching the live
// drag clamp. Overlays with no stored size (auto-sized text/buttons) only get their corner clamped.
// Returns the SAME object when already in bounds, so callers can detect "nothing changed" by ref.
function clampOverlayToSection(o: Overlay): Overlay {
 const hiX = typeof o.w === "number" ? Math.max(0, 100 - Math.min(100, o.w)) : 100;
 const hiY = typeof o.h === "number" ? Math.max(0, 100 - Math.min(100, o.h)) : 100;
 const x = Math.max(0, Math.min(hiX, o.x));
 const y = Math.max(0, Math.min(hiY, o.y));
 return x === o.x && y === o.y ? o : { ...o, x, y };
}
// Clamp every overlay on every block back into its section. Returns the SAME array ref if nothing
// moved, so a load can tell whether it needs to persist a correction.
function normalizeOverlays(bs: Block[]): Block[] {
 let changed = false;
 const out = bs.map((b) => {
 if (!b.overlays?.length) return b;
 const ov = b.overlays.map(clampOverlayToSection);
 if (ov.some((o, i) => o !== b.overlays![i])) { changed = true; return { ...b, overlays: ov }; }
 return b;
 });
 return changed ? out : bs;
}

// A compact "Space" control for the background toolbar: just the word, until clicked — then a small
// dropdown of the four presets. Self-contained open/close state (same pattern as the colour swatches'
// popover), so it closes on its own; pass a fresh `key` (e.g. the section id) to reset it on selection change.
const SPACE_LABEL: Record<string, string> = { sm: "Small", md: "Medium", lg: "Large", xl: "Extra large" };
// Human label for a section's text-field toolbar, keyed by the field's `props` key (see BLOCK_TYPES
// in storefront-blocks.ts). Falls back to a capitalized key for anything not listed here.
const FIELD_LABEL: Record<string, string> = { heading: "Heading", subtext: "Subtext", body: "Body", text: "Text", cta: "Button", caption: "Caption", quote: "Quote" };
// Legacy sm/md/lg/xl heading presets, in px — mirrors Blocks.tsx's HEAD_SCALE (rem→px @16px root).
// Used only to seed the numeric size input with the heading's real current size before it's touched.
const HEAD_SCALE_PX: Record<string, number> = { sm: 26, md: 37, lg: 51, xl: 69 };
// Overlay (free-form) text presets, in px — mirrors Blocks.tsx's OVL_TEXT_SIZE base sizes (ignoring
// the @xl breakpoint variant, since this is just the numeric input's pre-touch fallback display).
const OVL_SIZE_PX: Record<string, number> = { sm: 14, md: 20, lg: 30, xl: 48 };
// A "Space"/"Align"-style dropdown: just the label until clicked, then a small menu of options.
// Portaled to <body> (position: fixed, anchored to the trigger button's own rect) because these
// live inside toolbars with `overflow-x-auto` — an absolutely-positioned child gets silently
// clipped by that ancestor's overflow, which is why the menu wasn't appearing at all before this.
// Sized to match the bordered "Bg" segmented-control group next to it, not the plain text chips.
function ToolbarDropdown<T extends string>({ label, value, options, labels, onChange, width = "w-32" }: {
 label: string; value?: string; options: readonly T[]; labels: Record<string, string>; onChange: (v: T) => void; width?: string;
}) {
 const [open, setOpen] = useState(false);
 const [anchor, setAnchor] = useState<DOMRect | null>(null);
 const btnRef = useRef<HTMLButtonElement>(null);
 return (
 <div className="relative shrink-0">
 <button
 ref={btnRef}
 type="button"
 onClick={() => { if (!open) setAnchor(btnRef.current?.getBoundingClientRect() ?? null); setOpen((o) => !o); }}
 className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition ${open ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-black/10 text-stone-600 hover:bg-stone-100"}`}
 >
 {label}{value ? ` · ${labels[value]}` : ""} <ChevronDown size={11} className={`transition ${open ? "rotate-180" : ""}`} />
 </button>
 {open && anchor && typeof document !== "undefined" && createPortal(
 <>
 <button type="button" aria-label="Close" className="fixed inset-0 z-[68] cursor-default" onClick={() => setOpen(false)} />
 <div style={{ position: "fixed", top: anchor.bottom + 6, left: Math.max(8, Math.min(anchor.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 160)) }} className={`z-[70] ${width} rounded-xl border border-black/10 bg-white p-1 shadow-[0_18px_44px_-12px_rgba(43,36,29,0.45)]`}>
 {options.map((o) => (
 <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }} className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition ${value === o ? "bg-[#5D0F17]/[0.08] text-[#5D0F17]" : "text-stone-600 hover:bg-stone-100"}`}>
 {labels[o]} {value === o && <Check size={13} />}
 </button>
 ))}
 </div>
 </>,
 document.body
 )}
 </div>
 );
}
const ALIGN_LABEL: Record<string, string> = { left: "Left", center: "Centre", right: "Right" };
const ALIGN_OPTIONS = ["left", "center", "right"] as const;
const SPACE_OPTIONS = ["sm", "md", "lg", "xl"] as const;
const OVL_BTN_SIZE_LABEL: Record<string, string> = { sm: "Small", md: "Medium", lg: "Large" };
const OVL_BTN_SIZE_OPTIONS = ["sm", "md", "lg"] as const;
const SHAPE_LABEL: Record<string, string> = { square: "Square", rounded: "Rounded", pill: "Pill" };
const SHAPE_OPTIONS = ["square", "rounded", "pill"] as const;
// The 6 "align within section" commands (Photoshop-style: reposition, not a persistent style) and the
// 2 layer-order commands — one-shot ACTIONS, not toggleable state, so their dropdown always shows
// value=undefined (nothing highlighted/checked) and onChange just fires the command.
const OVL_ALIGN_LABEL: Record<string, string> = { left: "Align left", hcenter: "Align centre", right: "Align right", top: "Align top", vmiddle: "Align middle", bottom: "Align bottom" };
const OVL_ALIGN_OPTIONS = ["left", "hcenter", "right", "top", "vmiddle", "bottom"] as const;
const OVL_POSITION_LABEL: Record<string, string> = { front: "Bring to front", back: "Send to back" };
const OVL_POSITION_OPTIONS = ["front", "back"] as const;
type RailTab = "design" | "sections" | "elements" | "text" | "uploads" | "assist";
// `price` arrives from /api/store/storefront/design already formatted — the same string the live
// storefront renders. Formatting it a second time here is how the editor and the shop drift apart.
type Product = { title: string; price: string; image: string };
type StoreCollection = { slug: string; title: string; itemCount: number; products: Product[] };
type Device = "desktop" | "tablet" | "phone";
type Settings = { handle: string; enabled: boolean; tagline: string | null; accentColor: string | null; heroImage: string | null; about: string | null };

// How far the pointer must travel before a press counts as a drag rather than a click. Below this,
// nothing is written — see the note in onFreeDragStart for what happened without it.
const DRAG_THRESHOLD_PX = 4;
const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
const ff = (name?: string) => (name ? `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

// One-click font pairings for the Design panel (heading × body). Click sets both at once — the
// dropdowns below stay for anyone who wants to mix their own.
const FONT_PAIRS: { name: string; heading: string; body: string }[] = [
 { name: "Editorial", heading: "Playfair Display", body: "Inter" },
 { name: "High Contrast", heading: "Bodoni Moda", body: "DM Sans" },
 { name: "Contemporary", heading: "Bricolage Grotesque", body: "Inter" },
 { name: "Warm Serif", heading: "Fraunces", body: "Source Serif 4" },
 { name: "Literary", heading: "Newsreader", body: "Newsreader" },
 { name: "Romantic", heading: "Cormorant Garamond", body: "Poppins" },
 { name: "Modern", heading: "Space Grotesk", body: "Inter" },
];
// The corner-preview curve for each shape option, so the segmented control shows what it does.

// ── Snapping (Canva/Figma alignment guides) ───────────────────────────────────
// At drag/resize start we gather every candidate line to snap to — the section's own edges + centre
// (0/50/100%) plus each SIBLING element's left/centre/right (x) and top/centre/bottom (y), measured
// live from the DOM and expressed in % of the section. During the move we snap the element's moving
// points to the nearest candidate within a small threshold, and surface a guide line where it locked.
type Guides = { v?: number; h?: number; top: number; left: number; width: number; height: number };
function gatherSnap(sec: HTMLElement, rect: DOMRect, exceptId: string): { xc: number[]; yc: number[] } {
 const xc = [0, 50, 100], yc = [0, 50, 100];
 sec.querySelectorAll<HTMLElement>("[data-ovl]").forEach((el) => {
 if (el.getAttribute("data-ovl") === exceptId) return;
 const r = el.getBoundingClientRect();
 const l = ((r.left - rect.left) / rect.width) * 100, rr = ((r.right - rect.left) / rect.width) * 100;
 const t = ((r.top - rect.top) / rect.height) * 100, bb = ((r.bottom - rect.top) / rect.height) * 100;
 xc.push(l, (l + rr) / 2, rr); yc.push(t, (t + bb) / 2, bb);
 });
 return { xc, yc };
}
// Best snap for a set of moving points against candidates. Returns the delta to apply and the guide %.
function snapAxis(points: number[], cands: number[], thr: number): { delta: number; guide: number | null } {
 let guide: number | null = null, delta = 0, dist = thr;
 for (const p of points) for (const c of cands) {
 const d = Math.abs(c - p);
 if (d <= dist) { dist = d; delta = c - p; guide = c; }
 }
 return { delta, guide };
}

// The colour controls (draggable picker + swatches) live in a shared module so the captured-site editor
// uses the exact same ones. HexInput is used directly here too.


// FAQ rows are stored as q0/a0, q1/a1… pairs in a block's props. These read them out (also migrating a
// legacy "items" blob) and write them back cleanly — shared by add/remove and drag-reorder.
type FaqPair = { q: string; a: string };
function readFaqPairs(props: Record<string, string>): FaqPair[] {
 const out: FaqPair[] = [];
 for (let i = 0; props[`q${i}`] !== undefined; i++) out.push({ q: props[`q${i}`] || "", a: props[`a${i}`] || "" });
 if (!out.length && props.items) String(props.items).split(/\n\s*\n/).forEach((blk) => { const ls = blk.split("\n"); const q = (ls.shift() || "").trim(); const a = ls.join("\n").trim(); if (q) out.push({ q, a }); });
 return out;
}
function writeFaqPairs(props: Record<string, string>, pairs: FaqPair[]): Record<string, string> {
 const p2 = { ...props };
 Object.keys(p2).forEach((k) => { if (/^[qa]\d+$/.test(k)) delete p2[k]; });
 delete p2.items;
 pairs.forEach((pr, i) => { p2[`q${i}`] = pr.q; p2[`a${i}`] = pr.a; });
 return p2;
}

// Rich editor for the "Shop by category" section — pick from the store's real collections, add a photo
// per tile, reorder, and choose the grid width. Tiles are stored back as "Label | image URL" lines.
type Tile = { label: string; img: string };
const parseTiles = (items?: string): Tile[] => (items || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [label, img] = l.split("|").map((s) => (s || "").trim()); return { label, img: img || "" }; });
const serializeTiles = (t: Tile[]) => t.map((x) => (x.img ? `${x.label} | ${x.img}` : x.label)).join("\n");
function CollectionsEditor({ block, onField, pick, uploading }: { block: Block; onField: (key: string, value: string) => void; pick: (cb: (url: string) => void) => void; uploading: boolean }) {
 const tiles = parseTiles(block.props?.items);
 const cols = block.props?.cols || "3";
 const [available, setAvailable] = useState<string[]>([]);
 useEffect(() => { (async () => { const r = await fetch("/api/store/collections?all=1").then((x) => (x.ok ? x.json() : null)).catch(() => null); setAvailable((r?.collections || []).map((c: { title: string }) => c.title)); })(); }, []);
 const set = (next: Tile[]) => onField("items", serializeTiles(next));
 const used = new Set(tiles.map((t) => t.label.toLowerCase()));
 const suggestions = available.filter((t) => !used.has(t.toLowerCase()));
 const inp = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 return (
 <div>
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Heading</label>
 <input value={decodeEntities(block.props?.heading || "")} onChange={(e) => onField("heading", e.target.value)} className={`${inp} mb-4`} />

 <label className="mb-1.5 block text-[12px] font-medium text-stone-600">Columns</label>
 <div className="mb-4 flex overflow-hidden rounded-lg border border-black/10">
 {(["2", "3", "4"] as const).map((c) => (
 <button key={c} type="button" onClick={() => onField("cols", c)} className={`flex-1 py-1.5 text-[12px] font-medium transition ${cols === c ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>{c}</button>
 ))}
 </div>

 {suggestions.length > 0 && (
 <>
 <label className="mb-1.5 block text-[12px] font-medium text-stone-600">Add from your collections</label>
 <div className="mb-4 flex flex-wrap gap-1.5">
 {suggestions.map((t) => (
 <button key={t} type="button" onClick={() => set([...tiles, { label: t, img: "" }])} className="rounded-full border border-black/10 px-2.5 py-1 text-[12px] text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]">+ {t}</button>
 ))}
 </div>
 </>
 )}

 <label className="mb-1.5 block text-[12px] font-medium text-stone-600">Tiles</label>
 <div className="space-y-2">
 {tiles.map((t, i) => (
 <div key={i} className="flex items-center gap-2 rounded-lg border border-black/10 bg-white p-1.5">
 <button type="button" disabled={uploading} onClick={() => pick((url) => set(tiles.map((x, k) => (k === i ? { ...x, img: url } : x))))} title={t.img ? "Replace photo" : "Add photo"} className="h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10" style={t.img ? { backgroundImage: `url("${t.img.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!t.img && <span className="grid h-full w-full place-items-center bg-stone-100 text-stone-400"><ImageIcon size={14} /></span>}</button>
 <input value={t.label} onChange={(e) => set(tiles.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className="min-w-0 flex-1 bg-transparent text-[13px] text-stone-700 outline-none" placeholder="Category name" />
 <button type="button" disabled={i === 0} onClick={() => { const n = [...tiles]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }} className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25"><ChevronUp size={13} /></button>
 <button type="button" disabled={i === tiles.length - 1} onClick={() => { const n = [...tiles]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); }} className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25"><ChevronDown size={13} /></button>
 <button type="button" onClick={() => set(tiles.filter((_, k) => k !== i))} className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600"><X size={13} /></button>
 </div>
 ))}
 </div>
 <button type="button" onClick={() => set([...tiles, { label: "New category", img: "" }])} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 py-2 text-[12px] font-medium text-stone-500 transition hover:bg-stone-50"><Plus size={13} /> Add tile</button>
 </div>
 );
}

// ── Deep style inspector — full visual control over any section ──────────────────────────────────
function StyleGroup({ label, children }: { label: string; children: React.ReactNode }) {
 return (
 <div className="border-t border-black/[0.06] py-4 first:border-t-0 first:pt-0">
 <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</p>
 <div className="space-y-3">{children}</div>
 </div>
 );
}
function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
 return (
 <div className="flex items-center gap-3">
 <span className="w-[70px] shrink-0 text-[12px] text-stone-500">{label}</span>
 <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
 </div>
 );
}
function Seg<T extends string>({ options, value, onPick, className }: { options: readonly (readonly [T, string])[]; value: T | null; onPick: (v: T) => void; className?: string }) {
 return (
 <div className={cn("flex overflow-hidden rounded-lg border border-black/10", className)}>
 {options.map(([v, label]) => (
 <button key={v} type="button" onClick={() => onPick(v)} className={cn("flex-1 whitespace-nowrap px-2 py-1.5 text-[11px] font-medium transition", value === v ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100")}>{label}</button>
 ))}
 </div>
 );
}
function StyleSlider({ value, min, max, step = 1, suffix, onChange, onClear }: { value: number | undefined; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void; onClear?: () => void }) {
 return (
 <div className="flex flex-1 items-center gap-2">
 <input type="range" min={min} max={max} step={step} value={value ?? min} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[#5D0F17]" />
 <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-stone-500">{value == null ? "—" : `${value}${suffix || ""}`}</span>
 {onClear && value != null && <button type="button" onClick={onClear} className="text-stone-300 hover:text-stone-500"><X size={12} /></button>}
 </div>
 );
}
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
 return (
 <button type="button" onClick={onClick} aria-pressed={on} className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[#5D0F17]" : "bg-black/15"}`}>
 <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${on ? "left-[18px]" : "left-0.5"}`} />
 </button>
 );
}
function SectionStyleInspector({ block, one, multi, pick, uploading }: { block: Block; one: (key: keyof BlockStyle, v: string | undefined) => void; multi: (patch: Partial<Record<keyof BlockStyle, string | undefined>>) => void; pick: (cb: (url: string) => void) => void; uploading: boolean }) {
 const st = (block.style || {}) as Record<string, string>;
 const n = (k: string) => (st[k] != null && st[k] !== "" ? Number(st[k]) : undefined);
 const swatch = (val: string, onChange: (v: string) => void) => <ColorSwatch value={val} onChange={onChange} />;
 // "Photo" is the one background type with nothing to write until a file is chosen — every other
 // option sets `bg`/`bgGradient` immediately, and bgType is derived from those. So picking Photo
 // wrote nothing, bgType fell straight back to "theme", the tab snapped back, and the upload row it
 // was supposed to reveal never rendered: the button looked dead. The INTENT has to be held here
 // until there's an image to derive it from. Keyed by block id so selecting a different section
 // doesn't inherit a Photo tab that section never asked for.
 const [photoIntent, setPhotoIntent] = useState<string | null>(null);
 const wantsPhoto = photoIntent === block.id;
 const bgType: "theme" | "solid" | "gradient" | "photo" | "accent" | "dark" = st.bgImage ? "photo" : st.bgGradient ? "gradient" : st.bg === "dark" ? "dark" : st.bg === "accent" ? "accent" : /^#/.test(st.bg || "") ? "solid" : wantsPhoto ? "photo" : "theme";
 const grad = (st.bgGradient || "#F4F0E8|#E9E0CE|180").split("|");
 return (
 <div className="mt-1">
 <StyleGroup label="Background">
 {/* "Page" (not "Theme") to match the section toolbar's own first chip — one concept, one name. */}
 <Seg options={[["theme", "Page"], ["solid", "Solid"], ["gradient", "Gradient"], ["photo", "Photo"], ["accent", "Accent"], ["dark", "Dark"]] as const} value={bgType} onPick={(v) => {
 setPhotoIntent(v === "photo" ? block.id : null);
 if (v === "theme") multi({ bg: undefined, bgGradient: undefined, bgImage: undefined });
 else if (v === "solid") multi({ bg: /^#/.test(st.bg || "") ? st.bg : "#F4F0E8", bgGradient: undefined, bgImage: undefined });
 else if (v === "gradient") multi({ bgGradient: st.bgGradient || "#F4F0E8|#E9E0CE|180", bg: undefined, bgImage: undefined });
 else if (v === "photo") multi({ bgGradient: undefined, bg: undefined });
 else multi({ bg: v, bgGradient: undefined, bgImage: undefined });
 }} />
 {bgType === "solid" && <StyleRow label="Colour">{swatch(/^#/.test(st.bg || "") ? st.bg : "#F4F0E8", (v) => one("bg", v))}</StyleRow>}
 {bgType === "gradient" && (
 <>
 <StyleRow label="From">{swatch(grad[0], (v) => one("bgGradient", `${v}|${grad[1]}|${grad[2] || 180}`))}</StyleRow>
 <StyleRow label="To">{swatch(grad[1], (v) => one("bgGradient", `${grad[0]}|${v}|${grad[2] || 180}`))}</StyleRow>
 <StyleRow label="Angle"><StyleSlider value={Number(grad[2] || 180)} min={0} max={360} suffix="°" onChange={(x) => one("bgGradient", `${grad[0]}|${grad[1]}|${x}`)} /></StyleRow>
 </>
 )}
 {bgType === "photo" && (
 <>
 <StyleRow label="Photo">
 <div className="flex items-center gap-2">
 {st.bgImage ? <span className="h-7 w-7 rounded-md bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${st.bgImage.replace(/"/g, "%22")}")` }} /> : <span className="grid h-7 w-7 place-items-center rounded-md bg-stone-100 text-stone-400"><ImageIcon size={13} /></span>}
 <button type="button" disabled={uploading} onClick={() => pick((url) => one("bgImage", url))} className="rounded-md bg-[#5D0F17] px-3 py-1 text-[12px] font-medium text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{uploading ? "…" : st.bgImage ? "Replace" : "Upload"}</button>
 {st.bgImage && <button type="button" onClick={() => one("bgImage", "")} className="text-stone-400 hover:text-stone-600"><X size={13} /></button>}
 </div>
 </StyleRow>
 {st.bgImage && <StyleRow label="Overlay"><StyleSlider value={n("bgOverlay") ?? 24} min={0} max={80} suffix="%" onChange={(x) => one("bgOverlay", String(x))} /></StyleRow>}
 </>
 )}
 </StyleGroup>

 <StyleGroup label="Text">
 <StyleRow label="Colour">{swatch(st.textColor || "#1a1a1a", (v) => one("textColor", v))}{st.textColor && <button type="button" onClick={() => one("textColor", "")} className="text-stone-300 hover:text-stone-500"><X size={12} /></button>}</StyleRow>
 {/* Empty row label — the "Align" dropdown button already says what it is, so the row label would just repeat it. */}
 <StyleRow label=""><ToolbarDropdown label="Align" options={ALIGN_OPTIONS} labels={ALIGN_LABEL} value={st.align} onChange={(v) => one("align", st.align === v ? undefined : v)} width="w-28" /></StyleRow>
 {/* Bold/italic/underline apply to every text field in the section (heading, subtext, body) — same as Colour above. */}
 <StyleRow label="Style">
 <div className="flex overflow-hidden rounded-lg border border-black/10">
 <button type="button" onClick={() => one("textBold", st.textBold ? undefined : "1")} title="Bold" className={`w-8 py-1.5 text-[13px] font-bold transition ${st.textBold ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>B</button>
 <button type="button" onClick={() => one("textItalic", st.textItalic ? undefined : "1")} title="Italic" className={`w-8 py-1.5 text-[13px] italic transition ${st.textItalic ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>I</button>
 <button type="button" onClick={() => one("textUnderline", st.textUnderline ? undefined : "1")} title="Underline" className={`w-8 py-1.5 text-[13px] underline transition ${st.textUnderline ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>U</button>
 </div>
 </StyleRow>
 <StyleRow label="Line height"><StyleSlider value={n("lineHeight") ?? 140} min={90} max={220} step={5} suffix="%" onChange={(x) => one("lineHeight", String(x))} onClear={() => one("lineHeight", "")} /></StyleRow>
 </StyleGroup>

 <StyleGroup label="Headings">
 <StyleRow label="Font">
 <select value={st.headingFont || ""} onChange={(e) => one("headingFont", e.target.value || undefined)} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: st.headingFont ? ff(st.headingFont) : undefined }}>
 <option value="">Theme font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 {/* Numeric px, not a preset — seeded from whatever the old sm/md/lg/xl preset renders as, so an untouched heading shows its real current size. */}
 <StyleRow label="Size"><StyleSlider value={n("headingSizePx") ?? HEAD_SCALE_PX[st.headingSize || "lg"]} min={14} max={120} step={1} suffix="px" onChange={(x) => one("headingSizePx", String(x))} onClear={() => one("headingSizePx", "")} /></StyleRow>
 <StyleRow label="Spacing"><StyleSlider value={n("tracking") ?? 0} min={-8} max={30} suffix="" onChange={(x) => one("tracking", String(x))} onClear={() => one("tracking", "")} /></StyleRow>
 </StyleGroup>

 <StyleGroup label="Subtext">
 <StyleRow label="Font">
 <select value={st.subtextFont || ""} onChange={(e) => one("subtextFont", e.target.value || undefined)} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: st.subtextFont ? ff(st.subtextFont) : undefined }}>
 <option value="">Theme font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 <StyleRow label="Size"><StyleSlider value={n("subtextSizePx") ?? 15} min={10} max={60} step={1} suffix="px" onChange={(x) => one("subtextSizePx", String(x))} onClear={() => one("subtextSizePx", "")} /></StyleRow>
 </StyleGroup>

 {/* The button's own style (fill, shape, hover, …) now lives in its own dedicated panel — click
 directly into the button's text on the canvas to open it, same as a free-floating button. */}

 <StyleGroup label="Size &amp; spacing">
 {/* Height was only ever settable by dragging the section's bottom edge on the canvas — precise
     enough to be fiddly, and undiscoverable if you never noticed the handle. Bounds match what that
     handle enforces for this section type. */}
 <StyleRow label="Height"><StyleSlider value={n("minH")} min={minSectionHeight(block.type)} max={maxSectionHeight(block.type)} step={10} suffix="px" onChange={(x) => one("minH", String(x))} onClear={() => one("minH", "")} /></StyleRow>
 {/* Top and bottom separately. One "Vertical" slider moved both edges at once, so closing the gap
     above a photo also closed the one below it. padY still backs these when neither is set, which is
     why an untouched section doesn't move. */}
 <StyleRow label="Top"><StyleSlider value={n("padTop") ?? n("padY")} min={0} max={400} step={4} suffix="px" onChange={(x) => one("padTop", String(x))} onClear={() => one("padTop", "")} /></StyleRow>
 <StyleRow label="Bottom"><StyleSlider value={n("padBottom") ?? n("padY")} min={0} max={400} step={4} suffix="px" onChange={(x) => one("padBottom", String(x))} onClear={() => one("padBottom", "")} /></StyleRow>
 <StyleRow label="Sides"><StyleSlider value={n("padX")} min={0} max={140} step={4} suffix="px" onChange={(x) => one("padX", String(x))} onClear={() => one("padX", "")} /></StyleRow>
 </StyleGroup>

 <StyleGroup label="Border & shadow">
 <StyleRow label="Radius"><StyleSlider value={n("radius")} min={0} max={72} step={2} suffix="px" onChange={(x) => one("radius", String(x))} onClear={() => one("radius", "")} /></StyleRow>
 <StyleRow label="Border"><StyleSlider value={n("border")} min={0} max={10} suffix="px" onChange={(x) => one("border", String(x))} onClear={() => one("border", "")} /></StyleRow>
 {n("border") != null && n("border")! > 0 && <StyleRow label="Colour">{swatch(st.borderColor || "#1a1a1a", (v) => one("borderColor", v))}</StyleRow>}
 <StyleRow label="Shadow"><Seg options={[["", "None"], ["sm", "S"], ["md", "M"], ["lg", "L"], ["xl", "XL"]] as const} value={(st.shadow as "md") || ""} onPick={(v) => one("shadow", v || undefined)} className="w-40" /></StyleRow>
 </StyleGroup>
 </div>
 );
}

// A static email-signup shown in the footer preview (the live storefront uses the real NewsletterForm).
function FooterEmailPreview({ accent }: { accent: string }) {
 return (
 <div className="mx-auto flex max-w-sm items-center gap-2">
 <input disabled placeholder="Email address" className="h-10 flex-1 rounded-md border border-current/20 bg-transparent px-3 text-[13px] opacity-60" />
 <span className="grid h-10 shrink-0 place-items-center rounded-md px-4 text-[12px] font-medium uppercase tracking-wide text-white" style={{ background: accent }}>Subscribe</span>
 </div>
 );
}

export default function StorefrontStudio() {
 // Return to whichever surface the studio was opened from (/store or /admin), not a
 // hardcoded /admin — otherwise "back" jumps surfaces and 404s from the seller portal.
 const base = useStoreBase();
 // Section-background "Background" popover: which section it's open for + where to float it, plus the embed-URL draft.
 const [bgMenu, setBgMenu] = useState<{ bid: string; top: number; left: number } | null>(null);
 const [embedInput, setEmbedInput] = useState("");
 const [embedErr, setEmbedErr] = useState(false);
 const [settings, setSettings] = useState<Settings | null>(null);
 const [storeName, setStoreName] = useState("Your store");
 const [colors, setColors] = useState<Colors>({ bg: "#FFFDF8", text: "#1a1a1a", accent: "#5D0F17" });
 // The colours the current template/palette shipped with — the "reset to" baseline. Updated
 // only when a palette/template is applied or design is loaded; NOT when a swatch is fine-tuned,
 // so the per-colour reset button can restore the template value after slider tweaks.
 const [baseColors, setBaseColors] = useState<Colors>({ bg: "#FFFDF8", text: "#1a1a1a", accent: "#5D0F17" });
 const [fonts, setFonts] = useState<Fonts>({ heading: "Playfair Display", body: "Inter" });
 const [radius, setRadius] = useState<Radius>("sharp");
 const [skin, setSkin] = useState<SkinId | "">("");
 // What the palette/type looked like BEFORE a skin was applied. Retained so an existing
 // store's preSkin value survives a save round-trip rather than being dropped.
 // rather than stranding the store on the last skin's colours. Session-scoped: after a reload the
 // colours are simply the store's colours, and the palette picker is the way to change them.
 const preSkinRef = useRef<{ colors: Colors; fonts: Fonts } | null>(null);
 // The look this store had when the editor opened. Captured ONCE, so "revert" always means "back to
 // how I found it" — not "back to the last thing I clicked", which is what undo is for.
 const loadedLook = useRef<{ colors: Colors; fonts: Fonts } | null>(null);
 const [railTab, setRailTab] = useState<RailTab>("design");
 // What the per-section VYA button hands the Assist panel. Held in state rather than dispatched as an
 // event because the panel isn't mounted until the tab actually switches — see Sidekick's `seed`.
 const [vyaSeed, setVyaSeed] = useState<string | null>(null);
 const [panelOpen, setPanelOpen] = useState(true); // Canva-style: collapse the side panel to free up canvas space
 const [products, setProducts] = useState<Product[]>([]);
 const [collections, setCollections] = useState<StoreCollection[]>([]);
 const [logo, setLogo] = useState<string>("");
 const [headerLayout, setHeaderLayout] = useState<HeaderLayout>("inline");
 // Which layout categories are expanded. Hero opens by default — nine categories of thumbnails all
 // at once is the thing that made this panel hard to scan; one open group gives it a starting point
 // without hiding that the rest are there.
 const [openCats, setOpenCats] = useState<Set<string>>(new Set(["Hero"]));
 // Same idea for the Design panel. "Style" open by default: it's the first decision a seller makes,
 // and it seeds the palette and fonts in the groups below it.
 const [openDesign, setOpenDesign] = useState<Set<string>>(new Set(["Style"]));
 const toggleDesign = (k: string) => setOpenDesign((prev) => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
 // Which piece of site chrome is selected. The header and footer wrap every page, so their settings
 // don't belong in a panel about the page you're on — you get them by clicking the thing itself.
 const [selChrome, setSelChrome] = useState<"header" | "footer" | null>(null);
 const [assets, setAssets] = useState<{ url: string }[]>([]); // Canva-style Uploads library (the store's photos)
 const [assetsBusy, setAssetsBusy] = useState(false);
 const [blocks, setBlocks] = useState<Block[]>([]);
 const [shopBlocks, setShopBlocks] = useState<Block[]>([]);
 const [extraPages, setExtraPages] = useState<StorePage[]>([]);
 const [customCss, setCustomCss] = useState("");
 const [socials, setSocials] = useState<Record<string, string>>({}); // footer social links
 const [footerAbout, setFooterAbout] = useState("");
 type NavLink = { label: string; href: string; place: "header" | "footer" | "both" };
 const [navLinks, setNavLinks] = useState<NavLink[]>([]); // custom links the seller adds to header/footer
 const [activeSlug, setActiveSlug] = useState("home");
 const [selBlock, setSelBlock] = useState<string | null>(null);
 const [selOverlay, setSelOverlay] = useState<{ blockId: string; overlayId: string } | null>(null);
 const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null); // where the floating toolbar sits (above the selection)
 const [ovlDragging, setOvlDragging] = useState(false); // hide the toolbar while dragging an element
 const [guides, setGuides] = useState<Guides | null>(null); // live alignment guide lines while dragging/resizing
 const [editingId, setEditingId] = useState<string | null>(null); // text element being typed into (inline edit)
 // Which section text field currently has focus (e.g. { blockId, key: "heading" }) — while set, the
 // section's floating toolbar shows that field's OWN text controls (colour/align/font/size) instead
 // of the background controls. Clicking the section's background/chrome (not a text field) clears it.
 const [textFocus, setTextFocus] = useState<{ blockId: string; key: string } | null>(null);
 // A selected / being-edited built-in element (hero heading/subtext/cta, …) — the free move+resize target.
 const [selFree, setSelFree] = useState<{ blockId: string; key: string } | null>(null);
 const [freeEditing, setFreeEditing] = useState<{ blockId: string; key: string } | null>(null);
 const [faqDrag, setFaqDrag] = useState<{ blockId: string; index: number } | null>(null); // FAQ row being dragged
 const [faqOver, setFaqOver] = useState<{ blockId: string; index: number } | null>(null); // where it will drop
 const [fileDrag, setFileDrag] = useState(false); // an image file is being dragged over the canvas
 const [uploading, setUploading] = useState(false);
 const [uploadErr, setUploadErr] = useState<string | null>(null); // why the last upload failed — shown as a toast
 const [dragIdx, setDragIdx] = useState<number | null>(null);
 const [canvasOver, setCanvasOver] = useState<number | null>(null);
 const [fmtBar, setFmtBar] = useState<{ top: number; left: number } | null>(null);
 const [device, setDevice] = useState<Device>("desktop");
 // ── Artboard (Canva model) ──
 // The canvas is a FIXED-SIZE page floating in the workspace, not a panel that stretches to whatever
 // room is left. Two reasons: a desktop design should be laid out at a real desktop width regardless
 // of how wide this window happens to be, and collapsing the sidebar should reveal more workspace —
 // not silently re-flow the design you were looking at. Zoom is how you trade detail for overview.
 const BASE_W: Record<Device, number> = { desktop: 1440, tablet: 834, phone: 390 };
 // A page taller than this scrolls INSIDE its own frame instead of stretching the document. Without
 // a ceiling one long page (Shop, with a full grid) makes the whole multi-page view useless — every
 // other page gets pushed so far down that zooming out to see them means zooming past legibility.
 // Generous enough that an ordinary page still shows whole; short enough to keep the stack scannable.
 const MAX_PAGE_H = 2400;
 const baseW = BASE_W[device];
 const viewportRef = useRef<HTMLDivElement>(null);
 const frameRef = useRef<HTMLDivElement>(null);
 const [avail, setAvail] = useState({ w: 0, h: 0 });
 // The page's own natural height. The artboard is the WHOLE page, not a window onto it — that's what
 // makes zooming out show more of the design instead of just shrinking a viewport you still have to
 // scroll. Measured, because it changes every time a section is added, resized, or removed.
 const [contentH, setContentH] = useState(0);
 // null = "haven't fitted this device yet". Fitting happens ONCE per device rather than on every
 // width change, which is the whole point: hiding the panel must not resize the page you're editing.
 const [zoom, setZoom] = useState<number | null>(null);
 const z = zoom ?? 1;
 const zoomRef = useRef(1);
 zoomRef.current = z; // pointer handlers read this — a drag in screen px is z× a drag on the page
 const [loading, setLoading] = useState(true);
 const [publishing, setPublishing] = useState(false);
 const [gateMsg, setGateMsg] = useState<string | null>(null); // "pick a plan to go live" prompt
 const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
 const [ddOpen, setDdOpen] = useState(false);
 const [showTemplates, setShowTemplates] = useState(false);
 // Which template this store is currently on, so the Design panel can mark it as
 // selected. Read from the design GET, which has always persisted it.
 const [templateId, setTemplateId] = useState<string>("");
 // Section picker: a search box and a category filter, because the library is ~30 layouts today and
 // heading for ~75. A flat wall of cards stops being browsable well before that.
 const [secQuery, setSecQuery] = useState("");
 const [secCat, setSecCat] = useState<SectionCategory | "all">("all");
 // A layout switch that changes what's SHOWN (a slideshow collapsing to one slide) is confirmed
 // first, with the specifics spelled out. A lossless one applies straight away — asking would be noise.
 const [pendingLayout, setPendingLayout] = useState<{ blockId: string; variant: string; label: string; notes: string[] } | null>(null);
 // Selecting a different section abandons the question. Without this the prompt is only HIDDEN (the
 // panel filters on blockId), so coming back to the original section resurfaces a stale "Switch to…?".
 useEffect(() => { setPendingLayout(null); }, [selBlock]);

 // Workspace size drives the fit calculation and the page's height.
 useEffect(() => {
 const el = viewportRef.current;
 if (!el || typeof ResizeObserver === "undefined") return;
 const ro = new ResizeObserver(([entry]) => setAvail({ w: entry.contentRect.width, h: entry.contentRect.height }));
 ro.observe(el);
 return () => ro.disconnect();
 // Depends on `loading` because the workspace isn't in the DOM until the store has loaded —
 // observing on mount alone would silently attach to nothing and leave the page unfitted.
 }, [loading]);
 // The page's own height, so the workspace can scroll the whole design rather than the design
 // scrolling inside a fixed frame. offsetHeight, not the observed box: the frame is scaled, and a
 // transformed element reports its SCALED size to a ResizeObserver.
 useEffect(() => {
 const el = frameRef.current;
 if (!el || typeof ResizeObserver === "undefined") return;
 const read = () => setContentH(el.offsetHeight);
 read();
 const ro = new ResizeObserver(read);
 ro.observe(el);
 return () => ro.disconnect();
 }, [loading]);
 // Switching device asks for a differently-shaped page, so re-fit. Nothing else re-fits.
 useEffect(() => { setZoom(null); }, [device]);
 useEffect(() => {
 if (zoom !== null || avail.w <= 0) return;
 setZoom(Math.min(1, Math.max(0.2, Math.round(((avail.w - 64) / baseW) * 100) / 100)));
 }, [zoom, avail.w, baseW]);

 // ── Zoom that keeps a point still ──
 // Scaling from the top-left corner drags the whole document toward the logo, so zooming in on a
 // footer walks it off screen. Instead: remember where a chosen anchor sits INSIDE the document
 // (as a fraction), then after the new scale lays out, scroll so that same fraction is back under
 // the same screen point. Trackpad pinch anchors on the cursor; the slider anchors on the middle
 // of what you're looking at, which is the closest thing to "where the user is" without a cursor.
 const zoomAnchor = useRef<{ ax: number; ay: number; fx: number; fy: number } | null>(null);
 const captureAnchor = (clientX?: number, clientY?: number) => {
 const vp = viewportRef.current, doc = frameRef.current;
 if (!vp || !doc) return;
 const vr = vp.getBoundingClientRect(), dr = doc.getBoundingClientRect();
 const ax = clientX ?? vr.left + vr.width / 2;
 const ay = clientY ?? vr.top + vr.height / 2;
 zoomAnchor.current = { ax, ay, fx: dr.width ? (ax - dr.left) / dr.width : 0.5, fy: dr.height ? (ay - dr.top) / dr.height : 0.5 };
 };
 useLayoutEffect(() => {
 const a = zoomAnchor.current;
 const vp = viewportRef.current, doc = frameRef.current;
 zoomAnchor.current = null;
 if (!a || !vp || !doc) return;
 const dr = doc.getBoundingClientRect();
 vp.scrollLeft += dr.left + a.fx * dr.width - a.ax;
 vp.scrollTop += dr.top + a.fy * dr.height - a.ay;
 }, [z]);
 // Every page lives in one document now, so "go to a page" means scrolling to it — whether you got
 // there from the tiles at the bottom, the dropdown, or a nav link inside the preview. Runs after
 // layout so it measures the page in its NEW position (switching pages re-renders both frames).
 useLayoutEffect(() => {
 const vp = viewportRef.current;
 const el = vp?.querySelector(`[data-page="${CSS.escape(activeSlug)}"]`) as HTMLElement | null;
 if (!vp || !el) return;
 vp.scrollTop += el.getBoundingClientRect().top - vp.getBoundingClientRect().top - 12;
 }, [activeSlug]);

 const zoomTo = (next: number, clientX?: number, clientY?: number) => {
 captureAnchor(clientX, clientY);
 setZoom(Math.min(2, Math.max(0.1, Math.round(next * 100) / 100)));
 };
 // Trackpad pinch arrives as a wheel event with ctrlKey set (every browser does this); cmd+wheel is
 // the mouse equivalent. Non-passive so the browser's own page zoom can be prevented.
 useEffect(() => {
 const vp = viewportRef.current;
 if (!vp) return;
 const onWheel = (e: WheelEvent) => {
  if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls the workspace
  e.preventDefault();
  zoomTo(zoomRef.current * Math.exp(-e.deltaY / 220), e.clientX, e.clientY);
 };
 vp.addEventListener("wheel", onWheel, { passive: false });
 return () => vp.removeEventListener("wheel", onWheel);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [loading]);
 const canvasRef = useRef<HTMLDivElement>(null);
 const overlayBarRef = useRef<HTMLDivElement>(null); // the overlay-element toolbar — can wrap to 2 rows, so its height is measured rather than assumed
 const loadedRef = useRef(false);
 const importedNameRef = useRef<string | null>(null); // brand name pulled from an imported site (wins over account name)
 const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 const loadDesign = useCallback(async () => {
 const r = await fetch("/api/store/storefront/design").catch(() => null);
 if (!r || !r.ok) return;
 const d = await r.json();
 if (d.storeName) { importedNameRef.current = d.storeName; setStoreName(d.storeName); }
 if (d.colors) { setColors(d.colors); setBaseColors(d.colors); }
 if (d.colors && d.fonts) loadedLook.current ??= { colors: d.colors, fonts: d.fonts };
 if (d.fonts) setFonts(d.fonts);
 if (d.radius === "sharp" || d.radius === "soft" || d.radius === "round") setRadius(d.radius);
 setSkin(isSkin(d.skin) ? d.skin : "");
 setTemplateId(typeof d.template === "string" ? d.template : "");
 preSkinRef.current = d.preSkin?.colors && d.preSkin?.fonts ? { colors: d.preSkin.colors, fonts: d.preSkin.fonts } : null;
 setProducts(d.products || []);
 setCollections(d.collections || []);
 setLogo(typeof d.logo === "string" ? d.logo : "");
 setHeaderLayout((["inline","center","split","stacked"].includes(d.headerLayout) ? d.headerLayout : "inline") as HeaderLayout);
 // Pull any already-saved overlay that overflows its section back inside (legacy elements placed
 // before the in-bounds clamps existed). Idempotent: a second load finds nothing to fix.
 const baseBlocks: Block[] = d.blocks || [], baseShop: Block[] = d.shopBlocks || [], basePages: StorePage[] = d.extraPages || [];
 const nBlocks = normalizeOverlays(baseBlocks);
 const nShop = normalizeOverlays(baseShop);
 let pagesChanged = false;
 const nPages = basePages.map((p) => {
 const nb = normalizeOverlays(p.blocks || []);
 if (nb !== (p.blocks || [])) { pagesChanged = true; return { ...p, blocks: nb }; }
 return p;
 });
 setBlocks(nBlocks);
 setShopBlocks(nShop);
 setExtraPages(nPages);
 // If anything was out of bounds, persist the corrected geometry once (mirrors the sections autosave).
 if (nBlocks !== baseBlocks || nShop !== baseShop || pagesChanged) {
 fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks: nBlocks, shopBlocks: nShop, extraPages: nPages }) }).catch(() => {});
 }
 setCustomCss(d.customCss || "");
 setSocials(d.socials || {});
 setFooterAbout(d.footerAbout || "");
 setNavLinks(Array.isArray(d.navLinks) ? d.navLinks : []);
 }, []);

 useEffect(() => {
 (async () => {
 const [sf] = await Promise.all([
 fetch("/api/store/storefront").then((r) => (r.ok ? r.json() : null)).catch(() => null),
 loadDesign(),
 ]);
 if (sf?.settings) setSettings(sf.settings as Settings);
 if (sf?.store?.name && !importedNameRef.current) setStoreName(sf.store.name as string);
 loadedRef.current = true;
 setLoading(false);
 })();
 }, [loadDesign]);

 // Load every option font once so the live preview — and the font-picker labels — render in their real
 // faces instead of a fallback. Editor-only; the live storefront loads just its two chosen families.
 useEffect(() => {
 const id = "vya-studio-fonts";
 if (document.getElementById(id)) return;
 const link = document.createElement("link");
 link.id = id; link.rel = "stylesheet"; link.href = storefrontFontsHref(ALL_STOREFRONT_FONTS);
 document.head.appendChild(link);
 }, []);

 // Also load the store's ACTUAL chosen fonts — an imported store's own typeface may be outside the
 // curated list, so without this the preview would fall back instead of rendering their real face.
 useEffect(() => {
 const extra = [fonts.heading, fonts.body].filter(Boolean);
 if (!extra.length) return;
 const id = "vya-theme-fonts";
 const href = storefrontFontsHref(extra);
 let link = document.getElementById(id) as HTMLLinkElement | null;
 if (!link) { link = document.createElement("link"); link.id = id; link.rel = "stylesheet"; document.head.appendChild(link); }
 if (link.getAttribute("href") !== href) link.setAttribute("href", href);
 }, [fonts]);

 // VYA changed the store from chat → pull the new design in.
 useEffect(() => {
 const onUpdate = () => loadDesign();
 window.addEventListener("vya:store-updated", onUpdate);
 return () => window.removeEventListener("vya:store-updated", onUpdate);
 }, [loadDesign]);

 // Autosave the sections whenever they change (debounced), skipping the initial load.
 useEffect(() => {
 if (!loadedRef.current) return;
 if (saveTimer.current) clearTimeout(saveTimer.current);
 saveTimer.current = setTimeout(async () => {
 setSave("saving");
 await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks, shopBlocks, extraPages }) }).catch(() => {});
 setSave("saved");
 }, 700);
 return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
 }, [blocks, shopBlocks, extraPages]);

 // ── page + block helpers (ported from the classic editor) ──
 const curBlocks = activeSlug === "home" ? blocks : activeSlug === "shop" ? shopBlocks : extraPages.find((p) => p.slug === activeSlug)?.blocks ?? [];
 const curBlocksRef = useRef<Block[]>(curBlocks);
 curBlocksRef.current = curBlocks; // always the live current-page blocks, for keyboard handlers that read them
 function updateCur(fn: (bs: Block[]) => Block[]) {
 if (activeSlug === "home") setBlocks(fn);
 else if (activeSlug === "shop") setShopBlocks(fn);
 else setExtraPages((ps) => ps.map((p) => (p.slug === activeSlug ? { ...p, blocks: fn(p.blocks) } : p)));
 }
 function editField(id: string, key: string, value: string) {
 updateCur((bs) => bs.map((b) => (b.id === id ? { ...b, props: { ...(b.props || {}), [key]: value } } : b)));
 }
 // Add / remove a FAQ accordion row. Rebuilds the q0/a0…qN/aN pairs cleanly (and migrates any legacy
 // "items" blob to pairs), so the accordion stays editable and consistent.
 function faqOp(id: string, op: "add" | { remove: number }) {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== id) return b;
 let pairs = readFaqPairs(b.props || {});
 if (op === "add") pairs.push({ q: "New question?", a: "Answer." });
 else pairs = pairs.filter((_, i) => i !== op.remove);
 return { ...b, props: writeFaqPairs(b.props || {}, pairs) };
 }));
 }
 // Move a FAQ row (drag-and-drop): reorder within its section, or move it into another FAQ section at
 // the drop index. Rewrites both sections' pairs so the accordion stays consistent.
 function moveFaqRow(fromBlock: string, fromIdx: number, toBlock: string, toIdx: number) {
 updateCur((bs) => {
 if (fromBlock === toBlock) {
 return bs.map((b) => {
 if (b.id !== fromBlock) return b;
 const pairs = readFaqPairs(b.props || {});
 if (fromIdx < 0 || fromIdx >= pairs.length) return b;
 const [moved] = pairs.splice(fromIdx, 1);
 let ins = fromIdx < toIdx ? toIdx - 1 : toIdx; // removal shifts later indices down by one
 ins = Math.max(0, Math.min(pairs.length, ins));
 pairs.splice(ins, 0, moved);
 return { ...b, props: writeFaqPairs(b.props || {}, pairs) };
 });
 }
 const src = bs.find((b) => b.id === fromBlock), dst = bs.find((b) => b.id === toBlock);
 if (!src || !dst) return bs;
 const srcPairs = readFaqPairs(src.props || {});
 if (fromIdx < 0 || fromIdx >= srcPairs.length) return bs;
 const [moved] = srcPairs.splice(fromIdx, 1);
 const dstPairs = readFaqPairs(dst.props || {});
 dstPairs.splice(Math.max(0, Math.min(dstPairs.length, toIdx)), 0, moved);
 return bs.map((b) => b.id === fromBlock ? { ...b, props: writeFaqPairs(b.props || {}, srcPairs) } : b.id === toBlock ? { ...b, props: writeFaqPairs(b.props || {}, dstPairs) } : b);
 });
 }
 // Pointer-based row drag: reliable (no HTML5 dataTransfer, works over the editable text). We hit-test
 // the row under the cursor with elementFromPoint, snapping before/after by its midpoint, and move on release.
 const faqDnd = {
 dragBlock: faqDrag?.blockId ?? null,
 dragIndex: faqDrag?.index ?? null,
 overBlock: faqOver?.blockId ?? null,
 overIndex: faqOver?.index ?? null,
 onGripDown: (blockId: string, index: number) => {
 const from = { blockId, index };
 setFaqDrag(from); setFaqOver({ blockId, index });
 let over: { blockId: string; index: number } | null = { blockId, index };
 const move = (ev: PointerEvent) => {
 const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
 const row = el?.closest("[data-faq-row]") as HTMLElement | null;
 if (row) {
 const blk = row.getAttribute("data-faq-block") || "";
 const idx = Number(row.getAttribute("data-faq-index"));
 const r = row.getBoundingClientRect();
 over = { blockId: blk, index: ev.clientY > r.top + r.height / 2 ? idx + 1 : idx };
 } else {
 const cont = el?.closest("[data-faq-container]") as HTMLElement | null;
 over = cont ? { blockId: cont.getAttribute("data-faq-block") || "", index: cont.querySelectorAll("[data-faq-row]").length } : null;
 }
 setFaqOver(over);
 };
 const up = () => {
 window.removeEventListener("pointermove", move);
 window.removeEventListener("pointerup", up);
 if (over) moveFaqRow(from.blockId, from.index, over.blockId, over.index);
 setFaqDrag(null); setFaqOver(null);
 };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 },
 };
 function reorderTo(to: number) {
 if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; }
 const from = dragIdx;
 updateCur((bs) => { const next = [...bs]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
 setDragIdx(null);
 }
 const canvasReorder = {
 dragIndex: dragIdx,
 overIndex: canvasOver,
 onStart: (i: number) => setDragIdx(i),
 onOver: (i: number) => setCanvasOver((c) => (c === i ? c : i)),
 onEnd: () => { setDragIdx(null); setCanvasOver(null); },
 onDrop: (i: number) => { reorderTo(i); setCanvasOver(null); },
 onMove: (i: number, dir: "up" | "down") => updateCur((bs) => { const j = dir === "up" ? i - 1 : i + 1; if (j < 0 || j >= bs.length) return bs; const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n; }),
 };
 function switchPage(slug: string) { setActiveSlug(slug); setSelBlock(null); setSelOverlay(null); setTextFocus(null); setFmtBar(null); setDdOpen(false); }
 function addPage() {
 const title = window.prompt("Page name (e.g. About, FAQ, Shipping)");
 if (!title || !title.trim()) return;
 let slug = pageSlugify(title);
 const taken = new Set(["home", "shop", ...extraPages.map((p) => p.slug)]);
 if (taken.has(slug)) slug = `${slug}-${extraPages.length + 1}`;
 setExtraPages((ps) => [...ps, { slug, title: title.trim().slice(0, 60), blocks: [makeBlock("text")] }]);
 switchPage(slug);
 }
 function deletePage(slug: string) {
 if (!window.confirm("Delete this page?")) return;
 setExtraPages((ps) => ps.filter((p) => p.slug !== slug));
 if (activeSlug === slug) switchPage("home");
 }

 // Floating format toolbar over a text selection inside the canvas (bold / italic / underline / colour).
 useEffect(() => {
 const onSel = () => {
 const s = window.getSelection();
 if (!s || s.isCollapsed || s.rangeCount === 0) { setFmtBar(null); return; }
 let node: Node | null = s.getRangeAt(0).commonAncestorContainer;
 if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
 const host = node as HTMLElement | null;
 if (!host || !canvasRef.current?.contains(host) || !host.closest('[contenteditable="true"]')) { setFmtBar(null); return; }
 const r = s.getRangeAt(0).getBoundingClientRect();
 if (r.width === 0 && r.height === 0) { setFmtBar(null); return; }
 setFmtBar({ top: r.top, left: r.left + r.width / 2 });
 };
 document.addEventListener("selectionchange", onSel);
 return () => document.removeEventListener("selectionchange", onSel);
 }, []);
 function fmtCmd(cmd: string, val?: string) {
 if (cmd === "foreColor") document.execCommand("styleWithCSS", false, "true");
 document.execCommand(cmd, false, val);
 if (cmd === "foreColor") document.execCommand("styleWithCSS", false, "false");
 }

 // Pick a template: a template is a whole STORE, so applying one lays out the home page, the Shop
 // page's intro and catalogue density, the corner style and header arrangement, and the pages this
 // template ships with (Authentication, Visit, Condition Scale…).
 //
 // Template pages are REPLACED, not accumulated. This used to only ever add — any template page
 // whose slug was free got appended and nothing was removed — so trying three templates left the
 // nav carrying all three sets at once: How Drops Work and Drop Archive from Bold sitting next to
 // The Edits and Sourcing Requests from Catalogue, with Home and Shop restyled to something else
 // entirely. The store was never actually the template you picked.
 //
 // A page counts as template-provided when its slug appears in ANY template (TEMPLATE_PAGE_SLUGS).
 // Anything else was written by the seller and is never touched — so an About page someone wrote
 // survives, but the previous template's Authentication page makes way for the new one's.
 async function applyTemplate(t: StorefrontTemplate) {
 const incoming = templatePages(t.id);
 const kept = extraPages.filter((e) => !isTemplatePageSlug(e.slug));
 const dropped = extraPages.filter((e) => isTemplatePageSlug(e.slug) && !incoming.some((p) => p.slug === e.slug));
 const droppedNote = dropped.length ? ` It removes ${dropped.length} page${dropped.length === 1 ? "" : "s"} from your current template (${dropped.map((p) => p.title).join(", ")}).` : "";
 const keptNote = kept.length ? ` Your own ${kept.length} page${kept.length === 1 ? "" : "s"} (${kept.map((p) => p.title).join(", ")}) stay.` : "";
 if (!window.confirm(`Switch to “${t.name}”? This restyles your store, replaces the Home and Shop page sections, and lays down its own ${incoming.length} pages (${incoming.map((p) => p.title).join(", ")}).${droppedNote}${keptNote} Your products and settings are unaffected.`)) return;
 setColors(t.colors);
 setBaseColors(t.colors);
 setFonts(t.fonts);
 setRadius(t.radius);
 setHeaderLayout(t.headerLayout);
 // The autosave effect persists blocks / shopBlocks / extraPages; the design POST below carries the
 // tokens and the grid, which don't ride that effect.
 setBlocks(templateBlocks(t.id));
 setShopBlocks(templateShopBlocks(t.id));
 // Seller-authored pages first, then this template's — so the nav reads in a stable order
 // rather than however the accumulated history happened to land.
 setExtraPages([...kept, ...incoming]);
 setActiveSlug("home");
 setSelBlock(null);
 setShowTemplates(false);
 setTemplateId(t.id);
 await fetch("/api/store/storefront/design", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  // applyContent:false — the sections are already in local state and on their way up via autosave.
  // Letting the server lay them out too would race that write and could clobber it.
  body: JSON.stringify({ template: t.id, applyContent: false, colors: t.colors, fonts: t.fonts, radius: t.radius, headerLayout: t.headerLayout, shopGrid: t.grid, productLayout: t.productLayout }),
 }).catch(() => {});
 }

 // ── Design panel: direct-manipulation colour / font / corner controls (the "Canva-easy" surface) ──
 // Tokens live on the theme, not the blocks, so they persist through their own debounced POST (the
 // blocks autosave effect only handles sections). Colour pickers fire rapidly while dragging, hence the
 // debounce; palette / font / corner clicks are discrete but ride the same path.
 const designTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const pushDesign = useCallback((patch: { colors?: Colors; fonts?: Fonts; radius?: Radius; skin?: string; preSkin?: { colors: Colors; fonts: Fonts } | null; customCss?: string; socials?: Record<string, string>; footerAbout?: string; navLinks?: NavLink[]; logo?: string; headerLayout?: HeaderLayout }) => {
 if (designTimer.current) clearTimeout(designTimer.current);
 setSave("saving");
 designTimer.current = setTimeout(async () => {
 await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
 setSave("saved");
 }, 400);
 }, []);
 function applyPalette(c: Colors) { setColors(c); setBaseColors(c); pushDesign({ colors: c }); }
 // Put the colours and fonts back to how the store looked when this editor session began.
 const lookChanged = !!loadedLook.current && JSON.stringify({ colors, fonts }) !== JSON.stringify(loadedLook.current);
 function revertLook() {
 const l = loadedLook.current;
 if (!l) return;
 setColors(l.colors); setBaseColors(l.colors); setFonts(l.fonts);
 pushDesign({ colors: l.colors, fonts: l.fonts });
 }
 function changeColor(key: keyof Colors, val: string) { const next = { ...colors, [key]: val }; setColors(next); pushDesign({ colors: next }); }
 function changeFont(which: keyof Fonts, val: string) { const next = { ...fonts, [which]: val }; setFonts(next); pushDesign({ fonts: next }); }
 function changeFont2(heading: string, body: string) { const next = { heading, body }; setFonts(next); pushDesign({ fonts: next }); }

 // ── Undo / redo ─────────────────────────────────────────────────────────────────────────────────
 // A snapshot of everything editable. We diff the serialized state on every change: a real edit pushes
 // the *previous* snapshot onto the undo stack; an undo/redo restore is flagged so it doesn't self-record.
 const pastRef = useRef<string[]>([]);
 const futureRef = useRef<string[]>([]);
 const lastSnapRef = useRef<string>("");
 const applyingRef = useRef(false);
 const [hist, setHist] = useState({ u: 0, r: 0 });
 // Copy/cut/paste clipboard (in-memory) — an element or a whole section, reusable across sections & pages.
 const clipboardRef = useRef<{ kind: "overlay"; data: Overlay } | { kind: "block"; data: Block } | null>(null);
 useEffect(() => {
 if (loading) return;
 const json = JSON.stringify({ blocks, shopBlocks, extraPages, colors, fonts, radius, customCss, socials, footerAbout });
 if (lastSnapRef.current === "") { lastSnapRef.current = json; return; } // seed on first settled state
 if (applyingRef.current) { applyingRef.current = false; lastSnapRef.current = json; return; } // this change WAS an undo/redo
 // A DRAG is ONE edit. Every gesture — resizing a photo, moving a heading, dragging a section's
 // bottom edge — writes on every pointermove, and each of those writes was landing on the undo stack
 // as its own entry. So a two-second drag buried the state you actually wanted behind a hundred
 // one-pixel steps, and pressing undo appeared to do nothing at all: it worked perfectly, one
 // imperceptible increment at a time.
 //
 // While a gesture runs we push nothing AND leave lastSnapRef alone, so it still holds the state from
 // before the gesture began. `ovlDragging` is in the dep list, so releasing the pointer re-runs this
 // and pushes exactly one entry: the whole drag, undone in one press.
 if (ovlDragging) return;
 if (json === lastSnapRef.current) return;
 pastRef.current.push(lastSnapRef.current);
 if (pastRef.current.length > 200) pastRef.current.shift();
 futureRef.current = [];
 lastSnapRef.current = json;
 setHist({ u: pastRef.current.length, r: 0 });
 }, [blocks, shopBlocks, extraPages, colors, fonts, radius, customCss, socials, footerAbout, loading, ovlDragging]);
 const restoreSnap = useCallback((json: string) => {
 const s = JSON.parse(json);
 applyingRef.current = true;
 setBlocks(s.blocks || []); setShopBlocks(s.shopBlocks || []); setExtraPages(s.extraPages || []);
 setColors(s.colors); setBaseColors(s.colors); setFonts(s.fonts); setRadius(s.radius); setCustomCss(s.customCss || "");
 setSocials(s.socials || {}); setFooterAbout(s.footerAbout || "");
 setSelBlock(null); setSelOverlay(null); setTextFocus(null); setEditingId(null);
 pushDesign({ colors: s.colors, fonts: s.fonts, radius: s.radius, customCss: s.customCss || "", socials: s.socials || {}, footerAbout: s.footerAbout || "" });
 }, [pushDesign]);
 const undo = useCallback(() => {
 if (!pastRef.current.length) return;
 futureRef.current.push(lastSnapRef.current);
 restoreSnap(pastRef.current.pop()!);
 setHist({ u: pastRef.current.length, r: futureRef.current.length });
 }, [restoreSnap]);
 const redo = useCallback(() => {
 if (!futureRef.current.length) return;
 pastRef.current.push(lastSnapRef.current);
 restoreSnap(futureRef.current.pop()!);
 setHist({ u: pastRef.current.length, r: futureRef.current.length });
 }, [restoreSnap]);
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 const t = e.target as HTMLElement | null;
 const inField = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
 const mod = e.metaKey || e.ctrlKey;
 const k = e.key.toLowerCase();
 if (mod && (k === "z" || k === "y")) {
 if (inField) return; // let fields keep native text-undo
 e.preventDefault();
 if (k === "y" || (k === "z" && e.shiftKey)) redo(); else undo();
 return;
 }
 if (inField) return; // the rest are canvas shortcuts — never hijack typing
 if (mod && k === "c") { if (selOverlay || selBlock) { e.preventDefault(); copySel(); } return; }
 if (mod && k === "x") { if (selOverlay || selBlock) { e.preventDefault(); cutSel(); } return; }
 if (mod && k === "v") { if (clipboardRef.current) { e.preventDefault(); pasteClip(); } return; }
 if (selOverlay && (k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright")) { // nudge element
 e.preventDefault();
 const step = e.shiftKey ? 2 : 0.5;
 const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
 const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
 updateCur((bs) => bs.map((b) => (b.id !== selOverlay.blockId ? b : { ...b, overlays: (b.overlays || []).map((ov) => (ov.id !== selOverlay.overlayId ? ov : { ...ov, x: Math.max(0, Math.min(100 - (ov.w ?? 2), (ov.x ?? 10) + dx)), y: Math.max(0, Math.min(100 - (ov.h ?? 2), (ov.y ?? 10) + dy)) })) })));
 return;
 }
 if (mod && k === "d") { // duplicate selection
 if (selOverlay) { e.preventDefault(); duplicateOverlay(selOverlay.blockId, selOverlay.overlayId); }
 else if (selBlock) { e.preventDefault(); duplicateBlock(selBlock); }
 return;
 }
 if (k === "delete" || k === "backspace") { // remove selection — the SELECTED element first, section last
 if (selOverlay) { e.preventDefault(); removeOverlay(selOverlay.blockId, selOverlay.overlayId); }
 // A selected PHOTO deletes the photo, not merely its free transform — "delete" on a picture can
 // only sensibly mean the picture. Its frame goes too, so re-adding one starts from the layout.
 else if (selFree?.key === "image") { e.preventDefault(); removePhoto(selFree.blockId); }
 else if (selFree) { e.preventDefault(); removeFreeField(selFree.blockId, selFree.key); }
 else if (selBlock) { e.preventDefault(); removeBlock(selBlock); }
 return;
 }
 if (k === "escape") { setSelOverlay(null); setSelBlock(null); setSelFree(null); setFreeEditing(null); setTextFocus(null); setEditingId(null); }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [undo, redo, selBlock, selOverlay, selFree]); // eslint-disable-line react-hooks/exhaustive-deps

 /**
  * Where a new section should land.
  *
  * It used to always be the end of the page, which meant scrolling back down to find what you
  * just added and then dragging it up to where you actually wanted it. Two rules instead:
  *
  *   1. A SELECTED section is an explicit "here" — the new one goes directly after it.
  *   2. Otherwise use what's ON SCREEN. The section covering the middle of the visible canvas
  *      is the one being looked at, so the new section goes after it.
  *
  * Scrolled to the very top with nothing yet crossing the midpoint, the new section goes first —
  * which is what "add a section while looking at the top of the page" should mean.
  */
 function insertIndexForNewSection(bs: Block[]): number {
 if (selBlock) {
  const i = bs.findIndex((b) => b.id === selBlock);
  if (i >= 0) return i + 1;
 }
 const c = canvasRef.current;
 if (!c) return bs.length;
 const mid = c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2;
 // The LAST section that starts above the midpoint. Using "starts above" rather than "contains
 // the midpoint" means a gap between two sections still resolves to the one above it.
 let at = -1;
 bs.forEach((b, i) => {
  const el = c.querySelector(`.vya-b-${b.id}`) as HTMLElement | null;
  if (el && el.getBoundingClientRect().top <= mid) at = i;
 });
 return at + 1;
 }

 // Add a section to the current page (Canva's "Elements" analog for a section-based builder) and
 // select it so the seller can immediately edit it on the canvas.
 function addSection(type: BlockType, variant?: string) {
 // The type's own defaults, the chosen layout's defaults on top, and the layout id itself (omitted
 // when it's the type's default, so the block stays identical to one added before variants existed).
 const b = makeBlock(type, variantDefaults(type, variant), normalizeVariant(type, variant));
 const at = insertIndexForNewSection(curBlocks);
 updateCur((bs) => [...bs.slice(0, at), b, ...bs.slice(at)]);
 setSelBlock(b.id);
 // Scroll to the new section itself rather than to the bottom of the page — it is no longer
 // necessarily at the bottom, and centring it is how you confirm it landed where you meant.
 requestAnimationFrame(() => canvasRef.current?.querySelector(`.vya-b-${b.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
 // A product section arrives already pointed at a collection the seller can fill. Without this the
 // only way to curate is to go make a collection first and come back — so the default would stay
 // "newest items" forever and the feature would go unused. An existing "Featured" is reused, never
 // duplicated (getOrCreateCollection is idempotent on the title).
 if (type === "featured" || type === "spotlight") ensureSectionCollection(b.id);
 }

 /** Point a new product section at a "Featured" collection, creating it the first time. */
 async function ensureSectionCollection(blockId: string) {
 const existing = collections[0];
 const target = existing
  ? existing
  : await fetch("/api/store/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Featured" }) })
     .then((r) => (r.ok ? r.json() : null))
     .then((d) => (d?.collection ? { slug: d.collection.slug as string, title: d.collection.title as string, itemCount: 0, products: [] as Product[] } : null))
     .catch(() => null);
 if (!target) return; // collections unavailable — the section just shows newest items, as before
 setCollections((cs) => (cs.some((c) => c.slug === target.slug) ? cs : [...cs, target]));
 editField(blockId, "collection", target.slug);
 }

 // Switch a section to a different LAYOUT, in place: same section, same id, same content, new bones.
 // applyVariant never deletes props, so this rides the existing undo stack exactly like any other edit.
 function setBlockVariant(id: string, variant: string) {
 updateCur((bs) => bs.map((b) => (b.id === id ? applyVariant(b, variant) : b)));
 setPendingLayout(null);
 // Positioned/scaled text belongs to the layout it was placed in — a heading dragged to the corner of
 // a full-bleed photo has no meaningful position in a split. Selection is cleared so the newly
 // rendered layout isn't showing handles for an element that has moved.
 setSelFree(null); setFreeEditing(null); setTextFocus(null);
 }

 // ── Section styling (the inspector that appears when a section is selected) ──
 // Setting a value to "" / undefined clears that override, so a section drops back to the theme default.
 function setBlockStyleMulti(id: string, patch: Partial<Record<keyof BlockStyle, string | undefined>>) {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== id) return b;
 const style = { ...(b.style || {}) } as Record<string, string>;
 for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") delete style[k]; else style[k] = v; }
 return { ...b, style: Object.keys(style).length ? (style as BlockStyle) : undefined };
 }));
 }
 function setBlockStyle(id: string, key: keyof BlockStyle, value: string | undefined) {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== id) return b;
 const style: BlockStyle = { ...(b.style || {}) };
 if (value == null || value === "") delete style[key];
 else (style as Record<string, string>)[key] = value;
 return { ...b, style: Object.keys(style).length ? style : undefined };
 }));
 }
 // Drag a section's top/bottom resize handle to set its height explicitly (style.minH, px). Sections
 // are full-width, in normal document flow — there's no independent x/width to drag, only height —
 // so dragging the TOP handle up or the BOTTOM handle down both grow the box (mirrored sign), same
 // "drag outward = bigger" feel as the corner handles on a free-form element. Seeds from the
 // section's actual rendered height at drag-start so the first move doesn't jump.
 function onSectionResizeStart(blockId: string, edge: "top" | "bottom", e: React.PointerEvent) {
 const handleEl = e.currentTarget as HTMLElement;
 const sec = handleEl.closest(".vya-sec") as HTMLElement | null;
 if (!sec) return;
 const startH = sec.getBoundingClientRect().height;
 const sy = e.clientY;
 const dir = edge === "top" ? -1 : 1; // top: dragging up (negative dy) grows the section
 setSelBlock(blockId); setSelOverlay(null); setTextFocus(null); setOvlDragging(true);
 handleEl.setPointerCapture?.(e.pointerId);
 // A strip can go far thinner than a content section: 80px is taller than an entire announcement
 // bar, so the old flat floor made one impossible to shrink to the size it actually wants to be.
 const type = curBlocksRef.current.find((b) => b.id === blockId)?.type;
 const floor = minSectionHeight(type);
 const ceiling = maxSectionHeight(type); // strips stop being strips past their cap
 const move = (ev: PointerEvent) => {
 // startH and the pointer delta are both SCREEN pixels; minH is stored in page pixels. At 50% zoom
 // a 100px drag is 200px of page, so divide the whole measurement by the scale before storing it.
 // (The percentage-based drags elsewhere divide by a measured rect, so they're already scale-free.)
 const h = Math.round(Math.max(floor, Math.min(ceiling, (startH + dir * (ev.clientY - sy)) / zoomRef.current)));
 setBlockStyle(blockId, "minH", String(h));
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 }
 function removeBlock(id: string) {
 updateCur((bs) => bs.filter((b) => b.id !== id));
 setSelBlock(null); setSelOverlay(null); setTextFocus(null);
 }
 // Reliable reorder without dragging — move a section one slot up or down.
 function moveBlock(id: string, dir: "up" | "down") {
 updateCur((bs) => {
 const i = bs.findIndex((b) => b.id === id);
 const j = dir === "up" ? i - 1 : i + 1;
 if (i < 0 || j < 0 || j >= bs.length) return bs;
 const next = [...bs];
 [next[i], next[j]] = [next[j], next[i]];
 return next;
 });
 }
 // A hero (and a plain image section) render props.image as their OWN visible picture — so a "background
 // photo" there must set props.image, or it hides behind the section's own render. Every other section
 // paints style.bgImage full-bleed behind its content.
 const sectionUsesPropsImage = (type: string) => type === "hero" || type === "image";
 const sectionBgUrl = (b: Block) => (sectionUsesPropsImage(b.type) ? b.props?.image || "" : b.style?.bgImage || "");
 function setSectionBgImage(b: Block, url: string | undefined) {
 // A photo background and rich media (video/embed) are mutually exclusive — setting a photo always
 // clears any bgMedia. Hero/image sections render props.image; every other section uses style.bgImage.
 updateCur((bs) => bs.map((x) => {
 if (x.id !== b.id) return x;
 const style = { ...(x.style || {}) };
 delete style.bgMedia;
 if (sectionUsesPropsImage(b.type)) {
 delete style.bgImage;
 return { ...x, props: { ...x.props, image: url || "" }, style: Object.keys(style).length ? style : undefined };
 }
 if (url) style.bgImage = url; else delete style.bgImage;
 return { ...x, style: Object.keys(style).length ? style : undefined };
 }));
 }
 // Set (or clear) a section's rich background media — a video or an embed. Mutually exclusive with a
 // plain bg photo, so we drop the legacy bgImage when setting media (and clear both when passed undefined).
 function setSectionBgMedia(b: Block, media: BgMedia | undefined) {
 updateCur((bs) => bs.map((x) => {
 if (x.id !== b.id) return x;
 const style = { ...(x.style || {}) };
 delete style.bgImage;
 if (media) style.bgMedia = media; else delete style.bgMedia;
 // On hero/image sections the photo lives in props.image — media supersedes it, so clear it too.
 const props = media && sectionUsesPropsImage(b.type) ? { ...(x.props || {}), image: "" } : x.props;
 return { ...x, props, style: Object.keys(style).length ? style : undefined };
 }));
 }
 /**
  * Hand the selected section to VYA.
  *
  * Asking the assistant to fix a section used to mean leaving the canvas, opening Assist, and then
  * writing a description of WHICH section — by which point typing the change yourself was faster,
  * so nobody asked. This puts VYA on every section's own toolbar and pre-addresses the question, so
  * the merchant writes what they want changed and nothing else.
  *
  * It composes rather than sends: the section is context, not a request, and firing a half-formed
  * prompt at an assistant that edits the live store would be worse than useless.
  */
 function askVya(b: Block) {
  const name = blockDef(b.type)?.label || b.type.replace(/[-_]/g, " ");
  // Clearing the selection is what MAKES the panel open. The left rail is one branch chain and the
  // section-edit panel is tested BEFORE the Assist branch, so any selected block wins and the chat
  // can never render — selecting the section here (which the first cut did, for context) is exactly
  // what stopped the button from reaching the panel at all. Same clear the VYA icon in the rail
  // already does. The context isn't lost: it's in the seed text below, which is where VYA reads it.
  // selChrome heads the same chain, so it has to go too — otherwise header/footer settings would
  // outrank the chat exactly the way a selected section did.
  setSelBlock(null); setSelOverlay(null); setSelFree(null); setTextFocus(null); setSelChrome(null);
  setRailTab("assist");
  setPanelOpen(true); // a collapsed panel would swallow the click just as silently
  setVyaSeed(`About my ${name} section on ${activeTitle}: `);
 }

 function duplicateBlock(id: string) {
 updateCur((bs) => {
 const i = bs.findIndex((b) => b.id === id);
 if (i < 0) return bs;
 const src = bs[i];
 const copy: Block = { ...src, id: newBlockId(), overlays: src.overlays?.map((o) => ({ ...o, id: `o_${newBlockId()}` })) };
 return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)];
 });
 }

 // ── Free-form overlay elements (drag a button/text/image anywhere on a section) ──
 // Overlays live inside their section's block, so the blocks autosave persists them for free.
 function patchOverlay(blockId: string, overlayId: string, patch: Partial<Overlay>) {
 updateCur((bs) => bs.map((b) => (b.id === blockId ? { ...b, overlays: (b.overlays || []).map((o) => (o.id === overlayId ? { ...o, ...patch } : o)) } : b)));
 }
 function patchOverlayProps(blockId: string, overlayId: string, kv: Record<string, string>) {
 updateCur((bs) => bs.map((b) => (b.id === blockId ? { ...b, overlays: (b.overlays || []).map((o) => (o.id === overlayId ? { ...o, props: { ...o.props, ...kv } } : o)) } : b)));
 }
 function removeOverlay(blockId: string, overlayId: string) {
 updateCur((bs) => bs.map((b) => (b.id === blockId ? { ...b, overlays: (b.overlays || []).filter((o) => o.id !== overlayId) } : b)));
 setSelOverlay(null);
 }
 // Delete a selected BUILT-IN element (hero CTA, heading, …): clear its text and its free transform,
 // so the element disappears without removing the whole section.
 /**
  * Put the photo back in the slot the layout designed for it — full width, the template's own height,
  * back in the flow. The way OUT of a frame you dragged somewhere you didn't mean to.
  *
  * Deletes the whole free entry rather than zeroing its parts: an x with no y (or a w with no h) is a
  * half-state the renderer would still treat as positioned.
  */
 function resetPhotoFrame(blockId: string) {
  updateCur((bs) => bs.map((b) => {
   if (b.id !== blockId) return b;
   const free = { ...(b.style?.free || {}) };
   delete free.image;
   const style: BlockStyle = { ...(b.style || {}) };
   if (Object.keys(free).length) style.free = free; else delete style.free;
   return { ...b, style: Object.keys(style).length ? style : undefined };
  }));
 }

 /** Clear a section's photo and the frame it was sitting in. */
 function removePhoto(blockId: string) {
  setSelFree(null);
  updateCur((bs) => bs.map((b) => {
   if (b.id !== blockId) return b;
   const free = { ...(b.style?.free || {}) };
   delete free.image;
   const style: BlockStyle = { ...(b.style || {}) };
   if (Object.keys(free).length) style.free = free; else delete style.free;
   // Both keys: hero/image sections paint props.image, every other section a bgImage/bgMedia layer.
   delete style.bgImage;
   delete style.bgMedia;
   return { ...b, props: { ...(b.props || {}), image: "" }, style: Object.keys(style).length ? style : undefined };
  }));
 }

 function removeFreeField(blockId: string, key: string) {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== blockId) return b;
 const props = { ...(b.props || {}), [key]: "" };
 const style = { ...(b.style || {}) };
 if (style.free) { const free = { ...style.free }; delete free[key]; if (Object.keys(free).length) style.free = free; else delete style.free; }
 return { ...b, props, style: Object.keys(style).length ? style : undefined };
 }));
 setSelFree(null); setFreeEditing(null);
 }
 function duplicateOverlay(blockId: string, overlayId: string) {
 const nid = `o_${newBlockId()}`;
 updateCur((bs) => bs.map((b) => {
 if (b.id !== blockId) return b;
 const src = (b.overlays || []).find((o) => o.id === overlayId);
 if (!src) return b;
 // Nudge the copy down-right a touch (in %) so it doesn't sit exactly on the original.
 const copy: Overlay = { ...src, id: nid, x: Math.min(90, (src.x ?? 10) + 3), y: Math.min(90, (src.y ?? 10) + 3), props: { ...src.props } };
 return { ...b, overlays: [...(b.overlays || []), copy] };
 }));
 setSelOverlay({ blockId, overlayId: nid });
 }
 // Align the selected element within its section. We measure its live size (%) from the DOM — text/buttons
 // are auto-sized and have no stored w/h — then set x/y so the chosen edge/centre meets the section's.
 function alignOverlay(edge: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") {
 if (!selOverlay) return;
 const { blockId, overlayId } = selOverlay;
 const el = document.querySelector<HTMLElement>(`[data-ovl="${overlayId}"]`);
 const layer = el?.closest<HTMLElement>(".vya-ovl-layer");
 if (!el || !layer) return;
 const lr = layer.getBoundingClientRect(), r = el.getBoundingClientRect();
 const w = (r.width / lr.width) * 100, h = (r.height / lr.height) * 100;
 const patch: Partial<Overlay> =
 edge === "left" ? { x: 0 } :
 edge === "hcenter" ? { x: Math.max(0, 50 - w / 2) } :
 edge === "right" ? { x: Math.max(0, 100 - w) } :
 edge === "top" ? { y: 0 } :
 edge === "vmiddle" ? { y: Math.max(0, 50 - h / 2) } :
 { y: Math.max(0, 100 - h) };
 patchOverlay(blockId, overlayId, patch);
 }
 // ── Copy / cut / paste (in-memory clipboard) ──────────────────────────────────────────────────────
 function copySel() {
 if (selOverlay) {
 const o = curBlocksRef.current.find((b) => b.id === selOverlay.blockId)?.overlays?.find((o) => o.id === selOverlay.overlayId);
 if (o) clipboardRef.current = { kind: "overlay", data: JSON.parse(JSON.stringify(o)) };
 } else if (selBlock) {
 const b = curBlocksRef.current.find((b) => b.id === selBlock);
 if (b) clipboardRef.current = { kind: "block", data: JSON.parse(JSON.stringify(b)) };
 }
 }
 function cutSel() {
 copySel();
 if (selOverlay) removeOverlay(selOverlay.blockId, selOverlay.overlayId);
 else if (selBlock) removeBlock(selBlock);
 }
 function pasteClip() {
 const clip = clipboardRef.current;
 if (!clip) return;
 if (clip.kind === "overlay") {
 const nid = `o_${newBlockId()}`;
 const copy: Overlay = { ...clip.data, id: nid, x: Math.min(90, (clip.data.x ?? 10) + 3), y: Math.min(90, (clip.data.y ?? 10) + 3), props: { ...clip.data.props } };
 let target = selBlock;
 updateCur((bs) => {
 target = target && bs.some((b) => b.id === target) ? target : bs[bs.length - 1]?.id ?? null;
 return target ? bs.map((b) => (b.id === target ? { ...b, overlays: [...(b.overlays || []), copy] } : b)) : bs;
 });
 if (target) { setSelBlock(target); setSelOverlay({ blockId: target, overlayId: nid }); }
 } else {
 const copy: Block = { ...clip.data, id: newBlockId(), overlays: clip.data.overlays?.map((o) => ({ ...o, id: `o_${newBlockId()}` })) };
 updateCur((bs) => {
 const i = bs.findIndex((b) => b.id === selBlock);
 return i < 0 ? [...bs, copy] : [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)];
 });
 setSelBlock(copy.id); setSelOverlay(null);
 }
 }
 // Layer order: overlays render in array order (later = on top), so reordering the array is the z-order.
 function reorderOverlay(blockId: string, overlayId: string, dir: "front" | "back" | "forward" | "backward") {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== blockId) return b;
 const ovs = [...(b.overlays || [])];
 const i = ovs.findIndex((o) => o.id === overlayId);
 if (i < 0) return b;
 const [o] = ovs.splice(i, 1);
 if (dir === "front") ovs.push(o);
 else if (dir === "back") ovs.unshift(o);
 else if (dir === "forward") ovs.splice(Math.min(ovs.length, i + 1), 0, o);
 else ovs.splice(Math.max(0, i - 1), 0, o);
 return { ...b, overlays: ovs };
 }));
 }
 // Human label + icon for an element, for the Layers panel.
 // `form` was missing from both of these, so a form element listed itself as "Line" with a line's icon.
 const overlayLabel = (o: Overlay) => o.kind === "text" ? (o.props?.text || "Text") : o.kind === "button" ? (o.props?.label || "Button") : o.kind === "image" ? "Image" : o.kind === "rect" ? "Rectangle" : o.kind === "circle" ? "Circle" : o.kind === "form" ? (o.props?.title || "Form") : "Line";
 const OverlayIcon = (o: Overlay) => o.kind === "text" ? Type : o.kind === "button" ? MousePointerClick : o.kind === "image" ? ImageIcon : o.kind === "rect" ? Square : o.kind === "circle" ? Circle : o.kind === "form" ? AlignLeft : Minus;
 // Add an element to the SELECTED section (fallback: the last section on the page), then select it.
 // The section currently centered in the canvas viewport, by its `vya-b-<id>` class. Lets a newly
 // added element land where the user is looking instead of at the bottom of the page. Returns null
 // if the canvas isn't mounted or no section overlaps the viewport.
 // The section you're actually looking at = the one filling the most of the canvas right now, by
 // VISIBLE AREA. The old version used "center nearest the viewport middle", which broke on a tall
 // hero: a hero taller than the viewport has its center off-screen, so a shorter next section whose
 // center sits near the middle would win — and a button added "to the section in view" landed in the
 // wrong one. Most-visible-area gets it right: a hero filling the screen wins even with its center off.
 function sectionInViewId(): string | null {
 const c = canvasRef.current;
 if (!c) return null;
 const cr = c.getBoundingClientRect();
 let bestId: string | null = null, bestVisible = 0;
 c.querySelectorAll<HTMLElement>(".vya-sec").forEach((sec) => {
 const r = sec.getBoundingClientRect();
 const visible = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
 if (visible > bestVisible) {
 const cls = Array.from(sec.classList).find((k) => k.startsWith("vya-b-"));
 if (cls) { bestVisible = visible; bestId = cls.slice("vya-b-".length); }
 }
 });
 return bestId;
 }
 /** Is this section at least partly on screen right now? Used so a stale selection that's been
  *  scrolled away doesn't capture a new element meant for the section actually in view. */
 function isSectionOnScreen(blockId: string): boolean {
 const c = canvasRef.current;
 const sec = c?.querySelector<HTMLElement>(`.vya-b-${blockId}`);
 if (!c || !sec) return false;
 const cr = c.getBoundingClientRect(), r = sec.getBoundingClientRect();
 return r.bottom > cr.top && r.top < cr.bottom;
 }
 function addElement(kind: OverlayKind, extraProps?: Record<string, string>) {
 // Where the new element lands, in order:
 //  1. the selected section — but ONLY if it's still on screen (a selection you scrolled away from
 //     shouldn't hijack an element you're adding to the hero you're now looking at),
 //  2. otherwise the section filling the most of the canvas — what you're actually looking at,
 //  3. otherwise the selected section even if off-screen, then the last section.
 // This is the fix for "added a button and it went to the next section / clicked me out of hero":
 // the target is now the section in view, and we keep it selected below.
 const inView = sectionInViewId();
 const selUsable = selBlock && curBlocks.some((b) => b.id === selBlock);
 const targetId = (selUsable && isSectionOnScreen(selBlock!)) ? selBlock
 : (inView && curBlocks.some((b) => b.id === inView)) ? inView
 : selUsable ? selBlock
 : curBlocks[curBlocks.length - 1]?.id;
 if (!targetId) { setRailTab("sections"); window.alert("Add a section first, then drop elements onto it."); return; }
 const o = makeOverlay(kind);
 if (extraProps) o.props = { ...(o.props || {}), ...extraProps };
 updateCur((bs) => bs.map((b) => (b.id === targetId ? { ...b, overlays: [...(b.overlays || []), o] } : b)));
 setSelBlock(targetId);
 setSelOverlay({ blockId: targetId, overlayId: o.id });
 // Center the new element in view so it's never off-screen — even if its section was only partly visible.
 requestAnimationFrame(() => canvasRef.current?.querySelector(`[data-ovl="${o.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
 }
 // Drag math (px → %) lives here because it needs the live section rect. Listeners close over the
 // current page state at drag-start — a drag is short-lived, so this stays correct without refs.
 const overlayEdit = {
 selectedId: selOverlay?.overlayId ?? null,
 editingId,
 onSelect: (blockId: string, overlayId: string) => { setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setEditingId(null); setPanelOpen(true); },
 onStartEdit: (blockId: string, overlayId: string) => { setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setEditingId(overlayId); },
 onText: (blockId: string, overlayId: string, value: string) => { patchOverlayProps(blockId, overlayId, { text: value }); setEditingId(null); },
 onDragStart: (blockId: string, overlayId: string, e: React.PointerEvent) => {
 const el = e.currentTarget as HTMLElement;
 const sec = el.closest(".vya-sec") as HTMLElement | null;
 if (!sec) return;
 const rect = sec.getBoundingClientRect();
 if (!rect.width || !rect.height) return;
 const cur = curBlocks.find((b) => b.id === blockId)?.overlays?.find((o) => o.id === overlayId);
 const ox = cur?.x ?? 0, oy = cur?.y ?? 0, sx = e.clientX, sy = e.clientY;
 const ew = (el.getBoundingClientRect().width / rect.width) * 100, eh = (el.getBoundingClientRect().height / rect.height) * 100;
 // Keep the whole element inside its section: the top-left may range 0 … (100 − size).
 const hiX = Math.max(0, 100 - ew), hiY = Math.max(0, 100 - eh);
 const { xc, yc } = gatherSnap(sec, rect, overlayId);
 const thrX = (6 / rect.width) * 100, thrY = (6 / rect.height) * 100;
 setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setOvlDragging(true);
 el.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 let nx = Math.min(hiX, Math.max(0, ox + ((ev.clientX - sx) / rect.width) * 100));
 let ny = Math.min(hiY, Math.max(0, oy + ((ev.clientY - sy) / rect.height) * 100));
 // snap the element's left/centre/right (and top/centre/bottom) to the nearest guide
 const sX = snapAxis([nx, nx + ew / 2, nx + ew], xc, thrX);
 const sY = snapAxis([ny, ny + eh / 2, ny + eh], yc, thrY);
 nx = Math.min(hiX, Math.max(0, nx + sX.delta)); ny = Math.min(hiY, Math.max(0, ny + sY.delta));
 patchOverlay(blockId, overlayId, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
 setGuides({
 v: sX.guide == null ? undefined : rect.left + (sX.guide / 100) * rect.width,
 h: sY.guide == null ? undefined : rect.top + (sY.guide / 100) * rect.height,
 top: rect.top, left: rect.left, width: rect.width, height: rect.height,
 });
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); setGuides(null); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 },
 // Drag a corner/side handle to resize. Corners resize both axes (shapes/images); side handles widen
 // only (text/buttons/lines keep flowing height). The opposite edge stays anchored, so top/left handles
 // move x/y as the box shrinks — same feel as Canva/Figma.
 onResizeStart: (blockId: string, overlayId: string, handle: ResizeHandle, e: React.PointerEvent) => {
 const handleEl = e.currentTarget as HTMLElement;
 const wrapper = handleEl.closest(".vya-ovl") as HTMLElement | null;
 const sec = wrapper?.closest(".vya-sec") as HTMLElement | null;
 if (!wrapper || !sec) return;
 const rect = sec.getBoundingClientRect();
 if (!rect.width || !rect.height) return;
 const cur = curBlocks.find((b) => b.id === blockId)?.overlays?.find((o) => o.id === overlayId);
 if (!cur) return;
 const wr = wrapper.getBoundingClientRect();
 const startW = cur.w ?? (wr.width / rect.width) * 100; // seed from rendered size for auto-sized text/buttons
 const startH = cur.h ?? (wr.height / rect.height) * 100;
 const startX = cur.x, startY = cur.y, sx = e.clientX, sy = e.clientY;
 const left = handle === "w" || handle === "nw" || handle === "sw";
 const right = handle === "e" || handle === "ne" || handle === "se";
 const top = handle === "nw" || handle === "ne";
 const bottom = handle === "sw" || handle === "se";
 const twoAxis = top || bottom; // corner handle → also resize height
 // A button always scales as a whole (any handle → font size, so the label never clips); text scales on
 // corners and still widens on the side handles. Seed from the stored fontPx, else the rendered font-size.
 const scaleMode = cur.kind === "button" || (twoAxis && cur.kind === "text");
 const seedEl = wrapper.firstElementChild as HTMLElement | null;
 const startFont = cur.props?.fontPx ? Number(cur.props.fontPx) : (seedEl ? (parseFloat(getComputedStyle(seedEl).fontSize) || 20) : 20);
 // A button hugs its label, so clear any stored box size — scaling font is what resizes it.
 if (cur.kind === "button" && (cur.w != null || cur.h != null)) patchOverlay(blockId, overlayId, { w: undefined, h: undefined });
 // Images/shapes scale PROPORTIONALLY (Google-Docs style) — the whole element grows/shrinks with a locked
 // aspect ratio, so nothing inside gets cropped or stretched. Lock to the image's natural ratio when we can.
 const aspectLock = twoAxis && (cur.kind === "image" || cur.kind === "rect" || cur.kind === "circle");
 const pxW0 = wr.width, pxH0 = wr.height;
 const imgEl = wrapper.querySelector("img") as HTMLImageElement | null;
 const aspectA = cur.kind === "image" && imgEl && imgEl.naturalWidth > 0 ? imgEl.naturalWidth / imgEl.naturalHeight : (pxH0 > 0 ? pxW0 / pxH0 : 1);
 const r1 = (n: number) => Math.round(n * 10) / 10;
 const { xc, yc } = gatherSnap(sec, rect, overlayId);
 const thrX = (6 / rect.width) * 100, thrY = (6 / rect.height) * 100;
 setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setOvlDragging(true);
 handleEl.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 const dx = ((ev.clientX - sx) / rect.width) * 100, dy = ((ev.clientY - sy) / rect.height) * 100;
 if (scaleMode) {
 const signedDx = right ? dx : left ? -dx : 0; // grow when dragging a corner outward
 const factor = Math.max(0.15, (startW + signedDx) / startW);
 const nf = Math.min(200, Math.max(8, Math.round(startFont * factor)));
 patchOverlayProps(blockId, overlayId, { fontPx: String(nf) });
 return;
 }
 if (aspectLock) {
 const dxPx = ev.clientX - sx, dyPx = ev.clientY - sy;
 const signX = right ? 1 : left ? -1 : 0, signY = bottom ? 1 : top ? -1 : 0;
 const fx = pxW0 > 0 ? (pxW0 + signX * dxPx) / pxW0 : 1;
 const fy = pxH0 > 0 ? (pxH0 + signY * dyPx) / pxH0 : 1;
 const factor = Math.max(0.1, Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy); // follow whichever axis moved most, scale uniformly
 const w2 = Math.max(2, Math.min(100, ((pxW0 * factor) / rect.width) * 100));
 const h2 = Math.max(2, ((((w2 / 100) * rect.width) / aspectA) / rect.height) * 100); // height derived from width → aspect locked (no crop)
 const x2 = Math.max(0, left ? (startX + startW) - w2 : startX);
 const y2 = Math.max(0, top ? (startY + startH) - h2 : startY);
 patchOverlay(blockId, overlayId, { x: r1(x2), y: r1(y2), w: r1(w2), h: r1(h2) });
 return;
 }
 let x = startX, y = startY, w = startW, h = startH;
 if (right) w = Math.max(2, Math.min(100 - startX, startW + dx));
 if (left) { w = Math.max(2, Math.min(100, startW - dx)); x = Math.max(0, startX + (startW - w)); }
 if (bottom) h = Math.max(2, Math.min(100 - startY, startH + dy));
 if (top) { h = Math.max(2, Math.min(100, startH - dy)); y = Math.max(0, startY + (startH - h)); }
 // Snap the moving edge to a guide, adjusting the size (opposite edge stays put).
 let gv: number | null = null, gh: number | null = null;
 if (right) { const s = snapAxis([x + w], xc, thrX); if (s.guide != null) { w = Math.max(2, Math.min(100 - x, w + s.delta)); gv = s.guide; } }
 else if (left) { const s = snapAxis([x], xc, thrX); if (s.guide != null) { x = Math.max(0, x + s.delta); w = Math.max(2, w - s.delta); gv = s.guide; } }
 if (bottom) { const s = snapAxis([y + h], yc, thrY); if (s.guide != null) { h = Math.max(2, Math.min(100 - y, h + s.delta)); gh = s.guide; } }
 else if (top) { const s = snapAxis([y], yc, thrY); if (s.guide != null) { y = Math.max(0, y + s.delta); h = Math.max(2, h - s.delta); gh = s.guide; } }
 const patch: Partial<Overlay> = { x: r1(x), y: r1(y), w: r1(w) };
 if (twoAxis) patch.h = r1(h);
 patchOverlay(blockId, overlayId, patch);
 setGuides({
 v: gv == null ? undefined : rect.left + (gv / 100) * rect.width,
 h: gh == null ? undefined : rect.top + (gh / 100) * rect.height,
 top: rect.top, left: rect.left, width: rect.width, height: rect.height,
 });
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); setGuides(null); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 },
 };
 // Same shape as overlayEdit, but for built-in template elements (hero heading/subtext/cta, …).
 const freeEdit = {
 selectedKey: selFree?.key ?? null,
 editingKey: freeEditing?.key ?? null,
 onSelect: (blockId: string, key: string) => { setSelBlock(blockId); setSelOverlay(null); setTextFocus(null); setSelFree({ blockId, key }); setFreeEditing(null); setPanelOpen(true); },
 onStartEdit: (blockId: string, key: string) => { setSelBlock(blockId); setSelFree({ blockId, key }); setFreeEditing({ blockId, key }); },
 onText: (blockId: string, key: string, value: string) => { editField(blockId, key, value); setFreeEditing(null); },
 onDragStart: onFreeDragStart,
 onResizeStart: onFreeResizeStart,
 };
 // Drag the selected hero's content group (heading/subtext/button) anywhere in the banner. Stores its
 // centre as cx/cy % of the frame; snaps to the banner's edges + centre with guides, recenters on mobile.
 function onHeroContentDragStart(blockId: string, e: React.PointerEvent) {
 const grip = e.currentTarget as HTMLElement;
 const inner = grip.closest(".vya-hero-inner") as HTMLElement | null;
 const frame = grip.closest(".vya-hero-frame") as HTMLElement | null;
 if (!inner || !frame) return;
 const rect = frame.getBoundingClientRect();
 if (!rect.width || !rect.height) return;
 const pr = curBlocks.find((b) => b.id === blockId)?.props || {};
 let ox: number, oy: number;
 if (pr.cx && pr.cy) { ox = Number(pr.cx); oy = Number(pr.cy); }
 else { const ir = inner.getBoundingClientRect(); ox = ((ir.left + ir.width / 2 - rect.left) / rect.width) * 100; oy = ((ir.top + ir.height / 2 - rect.top) / rect.height) * 100; }
 const sx = e.clientX, sy = e.clientY, cands = [0, 50, 100], thrX = (7 / rect.width) * 100, thrY = (7 / rect.height) * 100, r1 = (n: number) => Math.round(n * 10) / 10;
 // The element is CENTRE-anchored (translate(-50%,-50%)), so clamping the centre to 0–100% still lets
 // half of it hang outside the section — where it overlaps whatever section comes next. Clamp by the
 // element's half-size instead, so its BOX stays inside: a centre at `halfW` puts its left edge exactly
 // on the canvas edge. (An element wider than the canvas can only sit centred.)
 const er0 = inner.getBoundingClientRect();
 const halfW = Math.min(50, (er0.width / 2 / rect.width) * 100), halfH = Math.min(50, (er0.height / 2 / rect.height) * 100);
 const clampX = (n: number) => Math.min(100 - halfW, Math.max(halfW, n));
 const clampY = (n: number) => Math.min(100 - halfH, Math.max(halfH, n));
 setSelBlock(blockId); setSelOverlay(null); setOvlDragging(true);
 grip.setPointerCapture?.(e.pointerId);
 let armed = false; // see the note in onFreeDragStart: a click must not register as a drag
 const move = (ev: PointerEvent) => {
 if (!armed) {
  if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) return;
  armed = true;
 }
 let nx = clampX(ox + ((ev.clientX - sx) / rect.width) * 100);
 let ny = clampY(oy + ((ev.clientY - sy) / rect.height) * 100);
 const sX = snapAxis([nx], cands, thrX), sY = snapAxis([ny], cands, thrY);
 nx = clampX(nx + sX.delta); ny = clampY(ny + sY.delta);
 updateCur((bs) => bs.map((b) => (b.id === blockId ? { ...b, props: { ...(b.props || {}), cx: String(r1(nx)), cy: String(r1(ny)) } } : b)));
 setGuides({
 v: sX.guide == null ? undefined : rect.left + (sX.guide / 100) * rect.width,
 h: sY.guide == null ? undefined : rect.top + (sY.guide / 100) * rect.height,
 top: rect.top, left: rect.left, width: rect.width, height: rect.height,
 });
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); setGuides(null); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 }
 // ── Free transforms for a section's BUILT-IN elements (hero heading/subtext/cta, …) ──
 // Stored on style.free[key] so the blocks autosave persists them.
 function patchFree(blockId: string, key: string, patch: Partial<FreeStyle>) {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== blockId) return b;
 const style = { ...(b.style || {}) };
 const free = { ...(style.free || {}) };
 free[key] = { ...(free[key] || {}), ...patch }; // fontPx alone scales in place; drag adds x/y to position
 style.free = free;
 return { ...b, style };
 }));
 }
 // Grab a native element's body and drag it anywhere in its section canvas (centre-anchored, like the hero group).
 function onFreeDragStart(blockId: string, key: string, e: React.PointerEvent) {
 // The grip is inside the frame, so measure the FRAME — el.closest finds it either way, but for the
 // photo the grip is the currentTarget rather than the box itself.
 const el = (key === "image" ? (e.currentTarget as HTMLElement).closest(".vya-photo") : e.currentTarget) as HTMLElement;
 if (!el) return;
 // A photo's coordinate space is the whole SECTION. Text fields live inside a .vya-free-canvas and
 // are positioned against it; a photo usually sits OUTSIDE that canvas (a hero-stack strip is a
 // sibling of the text block), so scoping it to the canvas would find nothing and the drag would
 // silently do nothing at all. .vya-sec is position:relative, so it's a valid offset parent.
 const canvas = (key === "image" ? el.closest(".vya-sec") : el.closest(".vya-free-canvas") || el.closest(".vya-sec")) as HTMLElement | null;
 if (!canvas) return;
 const rect = canvas.getBoundingClientRect();
 if (!rect.width || !rect.height) return;
 const cur = curBlocks.find((b) => b.id === blockId)?.style?.free?.[key];
 let ox: number, oy: number;
 if (cur && cur.x != null && cur.y != null) { ox = cur.x; oy = cur.y; }
 else { const er = el.getBoundingClientRect(); ox = ((er.left + er.width / 2 - rect.left) / rect.width) * 100; oy = ((er.top + er.height / 2 - rect.top) / rect.height) * 100; }
 const sx = e.clientX, sy = e.clientY, cands = [0, 50, 100], thrX = (7 / rect.width) * 100, thrY = (7 / rect.height) * 100, r1 = (n: number) => Math.round(n * 10) / 10;
 // Centre-anchored, so clamping the centre to 0–100% still lets half the element hang outside the
 // section and over its neighbour. Clamp by half-size so the element's BOX stays inside.
 // Measure the FIELD, not the selection wrapper: the wrapper can be taller than what it frames
 // (flow margins, line-box space), and clamping to that would restrict the drag by empty pixels.
 // A text wrapper can be taller than what it frames, so it measures its child; a photo frame IS the
 // box, and measuring its first child (the <img>) would clamp against the wrong thing.
 const er0 = key === "image" ? el.getBoundingClientRect() : ((el.firstElementChild as HTMLElement | null)?.getBoundingClientRect() || el.getBoundingClientRect());
 const halfW = Math.min(50, (er0.width / 2 / rect.width) * 100), halfH = Math.min(50, (er0.height / 2 / rect.height) * 100);
 const clampX = (n: number) => Math.min(100 - halfW, Math.max(halfW, n));
 const clampY = (n: number) => Math.min(100 - halfH, Math.max(halfH, n));
 setSelBlock(blockId); setSelOverlay(null); setTextFocus(null); setSelFree({ blockId, key }); setFreeEditing(null); setOvlDragging(true);
 el.setPointerCapture?.(e.pointerId);
 // A CLICK is a press with a pixel or two of hand-shake in it. Without a threshold that shake is a
 // drag: the field gets an x/y, which pulls it out of normal flow and re-anchors it by its centre —
 // so merely selecting a heading visibly jumped it to the middle, changed its width, and let the
 // line beneath slide up into the space it left. Nothing is written until the pointer has actually
 // travelled, so a click stays a click.
 let armed = false;
 const move = (ev: PointerEvent) => {
 if (!armed) {
  if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) return;
  armed = true;
 }
 let nx = clampX(ox + ((ev.clientX - sx) / rect.width) * 100);
 let ny = clampY(oy + ((ev.clientY - sy) / rect.height) * 100);
 const sX = snapAxis([nx], cands, thrX), sY = snapAxis([ny], cands, thrY);
 nx = clampX(nx + sX.delta); ny = clampY(ny + sY.delta);
 patchFree(blockId, key, { x: r1(nx), y: r1(ny) });
 setGuides({
 v: sX.guide == null ? undefined : rect.left + (sX.guide / 100) * rect.width,
 h: sY.guide == null ? undefined : rect.top + (sY.guide / 100) * rect.height,
 top: rect.top, left: rect.left, width: rect.width, height: rect.height,
 });
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); setGuides(null); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 }
 // Resize a native text element. The two kinds of handle do genuinely different things:
 //
 //   CORNERS scale the type — the whole field gets bigger, the way dragging a photo's corner does.
 //   SIDES set the field's WIDTH, which rewraps the text: pull the right handle out and three lines
 //   become one long line; pull it in and one line becomes three.
 //
 // Every handle used to scale the font, so the side handles just made the text bigger — which is
 // not what a side handle means anywhere else, and left no way to control line length at all.
 function onFreeResizeStart(blockId: string, key: string, handle: ResizeHandle, e: React.PointerEvent) {
 const handleEl = e.currentTarget as HTMLElement;
 // A photo frame is `.vya-photo`; every other free field is `.vya-free`. They're deliberately
 // separate classes — the mobile fallback un-positions `.vya-free`, which a photo must not inherit.
 const wrapper = handleEl.closest(key === "image" ? ".vya-photo" : ".vya-free") as HTMLElement | null;
 // Same scoping as the drag — a photo sizes itself against the section it lives in.
 const canvas = (key === "image" ? wrapper?.closest(".vya-sec") : wrapper?.closest(".vya-free-canvas") || wrapper?.closest(".vya-sec")) as HTMLElement | null;
 if (!wrapper || !canvas) return;
 const rect = canvas.getBoundingClientRect();
 if (!rect.width) return;
 const cur = curBlocks.find((b) => b.id === blockId)?.style?.free?.[key];
 const seedEl = wrapper.firstElementChild as HTMLElement | null;
 const startFont = cur?.fontPx ? cur.fontPx : (seedEl ? (parseFloat(getComputedStyle(seedEl).fontSize) || 24) : 24);
 const startW = (wrapper.getBoundingClientRect().width / rect.width) * 100 || 1;
 const left = handle === "w" || handle === "nw" || handle === "sw";
 const right = handle === "e" || handle === "ne" || handle === "se";
 // A button scales as one piece (fontPx) from EVERY handle — it has no meaningful width to drag,
 // so its side/middle handles scale it too instead of doing nothing. Text fields keep width on the
 // side handles (control the line width) and font on the corners.
 const isButton = key === "cta" || key.startsWith("cta");
 // A photo has no type to scale — its corners size the FRAME in both axes. Text keeps font-on-corners.
 const isImage = key === "image";
 const widthOnly = (handle === "w" || handle === "e") && !isButton;
 // Top/bottom on a photo change the frame's HEIGHT only — the picture keeps its scale and simply
 // shows less of itself, because it's object-cover. That is a crop, not a squash: the Canva gesture.
 const heightOnly = (handle === "n" || handle === "s") && isImage;
 const down = handle === "sw" || handle === "se" || handle === "s";
 // Width is stored as a % of the field's OWN container, so it stays exact wherever the field sits —
 // the canvas for a positioned field, whatever column holds it otherwise.
 const basis = (wrapper.parentElement?.getBoundingClientRect().width) || rect.width;
 const startWidthPct = cur?.w ?? Math.min(100, (wrapper.getBoundingClientRect().width / basis) * 100 || 100);
 const sx = e.clientX, sy = e.clientY;
 // The frame's on-screen box at the moment the drag starts. Seeding from what is actually rendered
 // means the first pixel of movement continues from the current size instead of jumping to a value
 // derived from somewhere else.
 const startBox = wrapper.getBoundingClientRect();
 const startWpx = startBox.width, startHpx = startBox.height;
 setSelBlock(blockId); setSelFree({ blockId, key }); setOvlDragging(true);
 handleEl.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 if (heightOnly) {
  const hpx = Math.max(24, startHpx + (ev.clientY - sy) * (down ? 1 : -1));
  patchFree(blockId, key, { h: Math.min(400, Math.max(10, Math.round((hpx / (startWpx || 1)) * 100))) });
  return;
 }
 if (widthOnly) {
  // Both side handles grow the field when dragged AWAY from it, which is what the cursor implies.
  const d = ((ev.clientX - sx) / basis) * 100 * (right ? 1 : -1);
  patchFree(blockId, key, { w: Math.min(100, Math.max(5, Math.round(startWidthPct + d))) });
  return;
 }
 if (isImage) {
  // Corners size the frame in both axes at once, each edge growing when dragged away from the box.
  //
  // Height is stored as a RATIO (percent of the frame's own width), not as a percent of anything
  // else, and both numbers here are ratios of on-screen pixels — so the canvas zoom cancels out of
  // the maths instead of having to be threaded through it.
  const wpx = Math.max(24, startWpx + (ev.clientX - sx) * (right ? 1 : -1));
  const hpx = Math.max(24, startHpx + (ev.clientY - sy) * (down ? 1 : -1));
  patchFree(blockId, key, {
   w: Math.min(100, Math.max(5, Math.round((wpx / basis) * 100))),
   h: Math.min(400, Math.max(10, Math.round((hpx / wpx) * 100))),
  });
  return;
 }
 const dx = ((ev.clientX - sx) / rect.width) * 100;
 const signedDx = right ? dx : left ? -dx : 0;
 const factor = Math.max(0.15, (startW + signedDx) / startW);
 patchFree(blockId, key, { fontPx: Math.min(200, Math.max(8, Math.round(startFont * factor))) });
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 }
 const selOverlayObj = selOverlay ? curBlocks.find((b) => b.id === selOverlay.blockId)?.overlays?.find((o) => o.id === selOverlay.overlayId) ?? null : null;
 // A section is "inspected" when it's selected and no overlay on it is selected.
 const selBlockObj = selBlock && !selOverlay ? curBlocks.find((b) => b.id === selBlock) ?? null : null;

 // ── Floating toolbar anchoring (Canva-style: sits just above the selection, follows canvas scroll) ──
 useEffect(() => {
 const canvas = canvasRef.current;
 if ((!selBlock && !selOverlay) || !canvas) { setAnchor(null); return; }
 const measure = () => {
 const c = canvasRef.current;
 if (!c) return;
 // Anchor to the most specific thing selected: an overlay element, the exact text field focused
 // inside the section (not just "the section"), or failing that the section itself.
 const fieldKey = (textFocus && textFocus.blockId === selBlock) ? textFocus.key : (selFree && selFree.blockId === selBlock) ? selFree.key : null;
 const fieldEl = fieldKey ? c.querySelector(`.vya-b-${selBlock} [data-field="${fieldKey}"]`) : null;
 const el = (selOverlay ? c.querySelector(`[data-ovl="${selOverlay.overlayId}"]`) : fieldEl || c.querySelector(`.vya-b-${selBlock}`)) as HTMLElement | null;
 if (!el) { setAnchor(null); return; }
 const r = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
 const GAP = 22; // sit the toolbar a bit higher above the selection so it doesn't crowd what you clicked
 // The overlay toolbar can wrap onto a second row (more controls than fit on one line), so it no
 // longer has a fixed height — measure it directly once it exists. Before it's ever rendered, fall
 // back to a single-row estimate; the requestAnimationFrame pass below corrects this right after
 // mount, once the real (possibly two-row) height is known.
 const BAR = selOverlay ? (overlayBarRef.current?.getBoundingClientRect().height ?? 46) : 46;
 let top = r.top - GAP - BAR; // above the selection…
 // …but always kept INSIDE the canvas: never above its top, and never below its bottom
 // (past the bottom it would float over the Pages strip that sits below the canvas).
 const minTop = cr.top + 6, maxTop = cr.bottom - BAR - 6;
 top = Math.max(minTop, Math.min(maxTop, top));
 const left = Math.min(cr.right - 24, Math.max(cr.left + 24, r.left + r.width / 2));
 setAnchor({ top, left });
 };
 measure();
 const raf = requestAnimationFrame(measure); // second pass once the (possibly newly two-row) toolbar has mounted
 canvas.addEventListener("scroll", measure, { passive: true });
 window.addEventListener("resize", measure);
 return () => { cancelAnimationFrame(raf); canvas.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
 }, [selBlock, selOverlay, textFocus, selFree, blocks, shopBlocks, extraPages, activeSlug, device]);

 // ── Image upload + drag-and-drop (no more URL fields) ──
 // Every failure now tells the seller WHY. The server already returns clear messages
 // ("Image must be under 25MB", "Use an MP4, WebM, or MOV video", …); the client used to throw
 // them away and just return null, so an upload would silently do nothing. We surface the server's
 // message, pre-check the size so an oversized file fails instantly instead of after a long upload,
 // and translate the platform's raw 413 (body-too-large, which never reaches our route as JSON).
 const IMAGE_MAX = 25 * 1024 * 1024, VIDEO_MAX = 64 * 1024 * 1024;
 async function uploadImage(file: File): Promise<string | null> {
 const isVideo = file.type.startsWith("video/");
 if (!file.type.startsWith("image/") && !isVideo) { setUploadErr("That file isn’t an image or video. Use a JPG, PNG, GIF, or MP4."); return null; }
 // Fail fast on size — a 100MB photo shouldn't upload for 30s only to be rejected.
 const max = isVideo ? VIDEO_MAX : IMAGE_MAX;
 if (file.size > max) { setUploadErr(`That ${isVideo ? "video" : "image"} is ${(file.size / 1048576).toFixed(0)}MB — the limit is ${max / 1048576}MB. Try a smaller file.`); return null; }
 const fd = new FormData(); fd.append("file", file);
 setUploading(true); setUploadErr(null);
 try {
 const r = await fetch("/api/store/assets", { method: "POST", body: fd });
 if (!r.ok) {
  // 413 is the platform rejecting the body before our route runs — it isn't JSON, so read it as text.
  const d = await r.json().catch(() => null);
  setUploadErr(d?.error || (r.status === 413 ? "That file’s too large to upload — try one under 25MB." : `Upload failed (${r.status}). Try again.`));
  return null;
 }
 const d = await r.json().catch(() => null);
 if (!d?.url) { setUploadErr("Upload didn’t return an image — try again."); return null; }
 return d.url;
 } catch {
 setUploadErr("Upload failed — check your connection and try again.");
 return null;
 } finally { setUploading(false); }
 }
 // Pick a file, upload it, and hand back the hosted URL (used by the toolbar "Upload" buttons).
 /** Drop a photo straight onto any image slot — same upload path as the picker, no dialog. */
 async function dropAndUpload(file: File, onUrl: (url: string) => void) {
 if (!file.type.startsWith("image/")) return;
 const url = await uploadToLibrary(file);
 if (url) onUrl(url);
 }
 async function pickAndUpload(onUrl: (url: string) => void, accept = "image/*") {
 const inp = document.createElement("input");
 inp.type = "file"; inp.accept = accept;
 inp.onchange = async () => { const f = inp.files?.[0]; if (f) { const url = await uploadImage(f); if (url) onUrl(url); } };
 inp.click();
 }
 // Uploads library (Canva-style) — the store's photos, reusable across the site. uploadImage already
 // POSTs to the same library, so every upload lands here too.
 const loadAssets = useCallback(async () => {
 setAssetsBusy(true);
 const r = await fetch("/api/store/assets").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 setAssets(r?.assets || []);
 setAssetsBusy(false);
 }, []);
 useEffect(() => { loadAssets(); }, [loadAssets]);
 async function uploadToLibrary(file: File): Promise<string | null> {
 const url = await uploadImage(file);
 if (url) setAssets((a) => [{ url }, ...a.filter((x) => x.url !== url)]);
 return url;
 }
 // Resolve which section (and overlay, if any) a drop landed on, from the drop point.
 function targetFromPoint(x: number, y: number): { blockId?: string; overlayId?: string } {
 const el = document.elementFromPoint(x, y) as HTMLElement | null;
 const overlayId = (el?.closest(".vya-ovl") as HTMLElement | null)?.getAttribute("data-ovl") || undefined;
 const sec = el?.closest(".vya-sec") as HTMLElement | null;
 const cls = sec ? [...sec.classList].find((c) => c.startsWith("vya-b-")) : undefined;
 return { blockId: cls ? cls.slice("vya-b-".length) : undefined, overlayId };
 }
 function onCanvasDragOver(e: React.DragEvent) {
 if (!Array.from(e.dataTransfer.types).includes("Files")) return; // ignore section-reorder drags
 e.preventDefault();
 if (!fileDrag) setFileDrag(true);
 }
 async function onCanvasDrop(e: React.DragEvent) {
 if (!e.dataTransfer.files?.length) return; // a reorder drop, not a file
 e.preventDefault();
 setFileDrag(false);
 const file = e.dataTransfer.files[0];
 const { blockId, overlayId } = targetFromPoint(e.clientX, e.clientY);
 if (!blockId && !overlayId) return;
 const url = await uploadImage(file);
 if (!url) return;
 // Dropped on an image element → set its picture; otherwise it's the section's background.
 if (blockId && overlayId) {
 const o = curBlocks.find((b) => b.id === blockId)?.overlays?.find((x) => x.id === overlayId);
 if (o?.kind === "image") { patchOverlayProps(blockId, overlayId, { src: url }); setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); return; }
 }
 if (blockId) { const blk = curBlocks.find((x) => x.id === blockId); if (blk) setSectionBgImage(blk, url); setSelBlock(blockId); setSelOverlay(null); }
 }

 async function togglePublish() {
 if (!settings) return;
 setPublishing(true); setGateMsg(null);
 try {
 const r = await fetch("/api/store/storefront", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, enabled: !settings.enabled }) });
 const d = await r.json().catch(() => null);
 if (r.ok && d?.settings) setSettings(d.settings as Settings);
 // "Set up but held": going live needs an active plan — surface the prompt instead of failing silently.
 else if (r.status === 402 || d?.code === "subscription_required") setGateMsg(d?.error || "Pick a plan to take your store live.");
 } catch { /* ignore */ }
 setPublishing(false);
 }

 const handle = settings?.handle || "";
 const enabled = !!settings?.enabled;
 // The page is as tall as the workspace at 100% — so at 100% it reads exactly like a browser window,
 // and zooming out pulls that whole window back rather than revealing a differently-shaped page.
 const baseH = Math.max(320, avail.h || 720);
 const pageList = [{ slug: "home", title: "Home", n: blocks.length }, { slug: "shop", title: "Shop", n: shopBlocks.length }, ...extraPages.map((p) => ({ slug: p.slug, title: p.title, n: p.blocks.length }))];
 const activeTitle = pageList.find((p) => p.slug === activeSlug)?.title || "Home";
 // Every page of the site, in order — the whole document, so zooming out shows the shape of the
 // store rather than one page of it.
 const allPages: { slug: string; title: string; blocks: Block[] }[] = [
 { slug: "home", title: "Home", blocks },
 { slug: "shop", title: "Shop", blocks: shopBlocks },
 ...extraPages.map((p) => ({ slug: p.slug, title: p.title, blocks: p.blocks })),
 ];
 const activeIdx = Math.max(0, allPages.findIndex((p) => p.slug === activeSlug));
 // The Shop page's real content isn't sections — it's the live inventory, listed automatically. Held
 // in one place because BOTH the page you're editing and the previews of it have to show it: rendering
 // it only for the active page made Shop look like an empty page until you clicked on it.
 const shopGrid = (
 <section className="mx-auto max-w-6xl px-6 py-16 sm:px-8">
  <p className="mb-8 text-center text-[10px] uppercase tracking-[0.28em] text-stone-400">Your products · auto-listed from live inventory</p>
  {products.length > 0 ? (
   <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
    {/* No cap — the live Shop page lists the whole catalogue, so capping here would show the seller
        a shorter shop than their customers get. Long pages scroll inside their frame (MAX_PAGE_H). */}
    {products.map((p, i) => (
     <div key={i}>
      <div className="aspect-[3/4] w-full bg-stone-100 bg-cover bg-center" style={{ backgroundImage: p.image ? `url("${p.image.replace(/"/g, "%22")}")` : undefined }} />
      <p className="mt-3 text-[12px] leading-snug" style={{ fontFamily: ff(fonts.body) }}>{p.title}</p>
      <p className="text-[12px] text-stone-500">{p.price}</p>
     </div>
    ))}
   </div>
  ) : (
   <p className="text-center text-[13px] text-stone-400">Your products appear here once you have live listings.</p>
  )}
 </section>
 );
 // A non-active page renders as a true-to-life PREVIEW, not an editor: no selection outlines, no
 // handles, nothing to click into by accident. Editing writes through `activeSlug`, so letting two
 // pages be editable at once would quietly send your edits to the wrong one. Click to switch.
 const pagePreview = (pg: { slug: string; title: string; blocks: Block[] }) => (
 <div key={pg.slug} data-page={pg.slug} className="group/pv relative flex cursor-pointer flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-24px_rgba(43,36,29,0.4)] ring-1 ring-black/10" style={{ maxHeight: MAX_PAGE_H }} onClick={() => switchPage(pg.slug)}>
  <div className="flex h-9 shrink-0 items-center gap-2 border-b border-black/[0.07] bg-[#f4f1ec] px-3">
   <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /></div>
   <span className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-600">{pg.title}</span>
   <span className="ml-auto text-[11px] text-stone-400"><span className="text-stone-500">{handle || "your-store"}</span>.getvya.ai{pg.slug !== "home" ? `/${pg.slug}` : ""}</span>
  </div>
  {/* `overflow-hidden`, not a scrollbar: a preview you can't click into shouldn't offer to scroll. */}
  <div className="min-h-0 flex-1 overflow-hidden" style={{ background: colors.bg }}>
   <div style={{ fontFamily: ff(fonts.body), color: colors.text }}>
    {/* The nav is live even in a preview: clicking "About" here should take you to About, not to the
        page the preview happens to be. Lifted above the click-overlay and its clicks stopped from
        bubbling, or the wrapper's "switch to THIS page" would immediately overrule the link. */}
    <div className="relative z-20" onClick={(e) => e.stopPropagation()}>
     <StoreHeader layout={headerLayout} storeName={storeName} logo={logo || null} nav={headerChromeNav} colors={colors} headingFontFamily={ff(fonts.heading)} onNav={(item) => item.slug ? switchPage(item.slug) : item.href && window.open(item.href, "_blank")} search={<Search size={16} strokeWidth={1.8} />} />
    </div>
    {pg.blocks.length > 0 && (
     <Blocks blocks={pg.blocks} colors={colors} fonts={fonts} radius={radius} products={products} collections={collections} skin={skin || undefined} />
    )}
    {pg.slug === "shop" && shopGrid}
    {pg.blocks.length === 0 && pg.slug !== "shop" && (
     <div className="flex min-h-[200px] items-center justify-center px-8 py-16 text-center text-[13px] text-stone-400">This page is empty.</div>
    )}
    <div className="relative z-20" onClick={(e) => e.stopPropagation()}>
     <StoreFooter storeName={storeName} logo={logo || null} nav={footerChromeNav} tagline={settings?.tagline ?? null} colors={colors} headingFontFamily={ff(fonts.heading)} year={new Date().getFullYear()} socials={socials} footerAbout={footerAbout} newsletter={<FooterEmailPreview accent={colors.accent} />} onNav={(item) => item.slug ? switchPage(item.slug) : item.href && window.open(item.href, "_blank")} />
    </div>
   </div>
  </div>
  {/* A single click target over the whole preview: one click means "work on this page", never
      "select the third section of a page you aren't editing". */}
  <div className="absolute inset-0 z-10 transition group-hover/pv:bg-[#5D0F17]/[0.04] group-hover/pv:ring-2 group-hover/pv:ring-inset group-hover/pv:ring-[#5D0F17]/30" />
 </div>
 );
 // The site nav shown in the persistent header/footer — one entry per page, current page marked active.
 const chromeNav: ChromeNav[] = pageList.map((p) => ({ label: p.title, slug: p.slug, active: p.slug === activeSlug }));
 const headerChromeNav: ChromeNav[] = [...chromeNav, ...navLinks.filter((l) => l.place !== "footer").map((l) => ({ label: l.label, href: l.href }))];
 const footerChromeNav: ChromeNav[] = [...chromeNav, ...navLinks.filter((l) => l.place !== "header").map((l) => ({ label: l.label, href: l.href }))];

 const dbtn = (d: Device, label: string, Icon: typeof Monitor) => (
 <button type="button" onClick={() => setDevice(d)} aria-label={label} className={`grid h-7 w-9 place-items-center rounded-md transition ${device === d ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}><Icon size={15} strokeWidth={1.9} /></button>
 );

 return (
 // fixed inset-0 z-[60] covers the portal sidebar + floating chat — a focused full-screen builder.
 <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#e7e3db] text-stone-800">
 {/* Upload error toast — says WHY an upload failed (too big, wrong type, offline). Click to dismiss. */}
 {uploadErr && (
 <div className="fixed left-1/2 top-4 z-[95] flex -translate-x-1/2 items-start gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]" role="alert">
 <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-100 text-[12px] font-bold text-red-600">!</span>
 <p className="max-w-xs text-[13px] leading-snug text-stone-700">{uploadErr}</p>
 <button type="button" onClick={() => setUploadErr(null)} aria-label="Dismiss" className="ml-1 shrink-0 text-stone-400 transition hover:text-stone-700"><X size={15} /></button>
 </div>
 )}
 {/* Top bar */}
 <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-[#fbf9f5] px-3">
 <div className="flex items-center gap-2.5">
 <a href={`${base}/home`} title="Back to admin" className="grid h-7 w-7 place-items-center rounded-lg border border-black/10 text-stone-500 transition hover:bg-stone-100"><ChevronLeft size={16} /></a>
 <span className="text-[15px] font-semibold tracking-tight">{storeName}</span>
 <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${enabled ? "bg-emerald-500/[0.12] text-emerald-700" : "bg-black/[0.06] text-stone-500"}`}>{enabled ? "Live" : "Draft"}</span>
 <span className="mx-0.5 h-5 w-px bg-black/10" />
 <div className="flex overflow-hidden rounded-lg border border-black/10 bg-[#f4f1ec]">
 <button type="button" onClick={undo} disabled={!hist.u} title="Undo (⌘Z)" aria-label="Undo" className="grid h-7 w-8 place-items-center text-stone-500 transition enabled:hover:bg-white enabled:hover:text-stone-800 disabled:opacity-35"><Undo2 size={15} strokeWidth={1.9} /></button>
 <span className="w-px bg-black/10" />
 <button type="button" onClick={redo} disabled={!hist.r} title="Redo (⌘⇧Z)" aria-label="Redo" className="grid h-7 w-8 place-items-center text-stone-500 transition enabled:hover:bg-white enabled:hover:text-stone-800 disabled:opacity-35"><Redo2 size={15} strokeWidth={1.9} /></button>
 </div>
 <span className="text-[11px] text-stone-400">{save === "saving" ? "Saving…" : save === "saved" ? "All changes saved" : ""}</span>
 </div>

 <div className="flex rounded-lg border border-black/10 bg-[#f4f1ec] p-0.5">{dbtn("desktop", "Desktop", Monitor)}{dbtn("tablet", "Tablet", Tablet)}{dbtn("phone", "Phone", Smartphone)}</div>

 <div className="flex items-center gap-2">
 <button type="button" onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-[13px] font-medium text-stone-700 transition hover:bg-stone-100"><LayoutTemplate size={13} /> <span className="hidden sm:inline">Templates</span></button>
 {handle && <a href={`/s/${handle}?preview=1`} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-[13px] font-medium text-stone-700 transition hover:bg-stone-100 sm:flex"><ExternalLink size={13} /> View</a>}
 <button type="button" onClick={togglePublish} disabled={publishing || !settings} className="rounded-lg bg-[#5D0F17] px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{publishing ? "Saving…" : enabled ? "Published ✓" : "Publish"}</button>
 </div>
 </div>

 {gateMsg && (
 <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
 <span>{gateMsg}</span>
 <a href="/admin/billing" className="shrink-0 rounded-lg bg-[#5D0F17] px-3 py-1 text-[12px] font-semibold text-white transition hover:bg-[#4a0c12]">Choose a plan →</a>
 </div>
 )}

 {/* Body: editing rail (Design / Add / Assist) + editable live preview */}
 <div className="flex min-h-0 flex-1">
 <div className={`relative flex shrink-0 overflow-visible border-r border-black/10 bg-[#fbf9f5] transition-[width] duration-200 ${panelOpen ? "w-[404px] max-w-[46vw]" : "w-[70px]"}`}>
 {/* Collapse / expand the side panel (Canva-style) — the icon rail always stays visible */}
 <button type="button" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? "Collapse panel" : "Expand panel"} className="absolute -right-3 top-1/2 z-30 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-black/10 bg-white text-stone-500 shadow-sm transition hover:text-[#5D0F17]">{panelOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}</button>
 {/* Canva-style vertical icon rail */}
 <div className="flex w-[70px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-black/10 bg-white py-3">
 {([["design", "Design", Palette], ["sections", "Layout", Layers], ["elements", "Elements", Shapes], ["text", "Text", Type], ["uploads", "Uploads", UploadIcon], ["assist", "VYA", Sparkles]] as const).map(([id, label, Icon]) => (
 <button key={id} type="button" onClick={() => { if (!selBlockObj && railTab === id && panelOpen) { setPanelOpen(false); } else { setRailTab(id); setPanelOpen(true); setSelBlock(null); setSelOverlay(null); setTextFocus(null); } }} className={`flex w-[58px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition ${!selBlockObj && railTab === id && panelOpen ? "bg-[#5D0F17]/[0.08] text-[#5D0F17]" : "text-stone-500 hover:bg-stone-100"}`}>
 <Icon size={19} strokeWidth={1.8} />{label}
 </button>
 ))}
 </div>

 {/* Active panel — hidden when the side bar is collapsed */}
 {panelOpen && (
 <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
 {/* Header/footer settings. These wrap EVERY page, so they don't belong in a panel about the page
     you happen to be on — you reach them by clicking the header or footer on the canvas, the same
     way you reach a section's settings by clicking the section. */}
 {selChrome ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[17px] font-semibold tracking-tight text-stone-800">{selChrome === "header" ? "Header" : "Footer"}</p>
 <button type="button" onClick={() => setSelChrome(null)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 <p className="mb-4 text-[12px] leading-snug text-stone-400">Shown on every page of your store.</p>

 {selChrome === "header" && (<>
 {/* Logo. The live storefront has always supported one — there was simply no way to set it here. */}
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Logo</p>
 <p className="mb-2 text-[12px] leading-snug text-stone-400">Drop an image here or click to upload. With no logo, your store name shows in type.</p>
 <div
  onClick={() => pickAndUpload((url) => { setLogo(url); pushDesign({ logo: url }); })}
  onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); e.currentTarget.classList.add("border-[#5D0F17]"); }}
  onDragLeave={(e) => e.currentTarget.classList.remove("border-[#5D0F17]")}
  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-[#5D0F17]"); const f = e.dataTransfer.files?.[0]; if (f) dropAndUpload(f, (url) => { setLogo(url); pushDesign({ logo: url }); }); }}
  className="mb-2 flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-black/20 bg-white px-3 py-4 text-[12px] text-stone-500 transition hover:border-[#5D0F17]/50"
 >
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {logo ? <img src={logo} alt="Store logo" className="max-h-9 w-auto object-contain" /> : <><UploadIcon size={14} /> Drop a logo, or click to upload</>}
 </div>
 {logo && <button type="button" onClick={() => { setLogo(""); pushDesign({ logo: "" }); }} className="mb-5 text-[12px] font-medium text-stone-500 underline hover:text-[#5D0F17]">Remove logo</button>}

 {/* Layout — the same three parts, arranged differently. */}
 <p className="mb-1 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Layout</p>
 <p className="mb-2 text-[12px] leading-snug text-stone-400">Where your name and menu sit.</p>
 <div className="mb-5 grid grid-cols-2 gap-2">
 {HEADER_LAYOUTS.map((h) => {
 const active = headerLayout === h.id;
 return (
 <button key={h.id} type="button" title={h.description} onClick={() => { setHeaderLayout(h.id); pushDesign({ headerLayout: h.id }); }}
  className={cn("rounded-lg border px-3 py-2.5 text-left transition", active ? "border-[#5D0F17] ring-1 ring-[#5D0F17]" : "border-black/10 hover:border-[#5D0F17]/40")}>
  <span className={cn("block text-[13px] font-semibold", active ? "text-[#5D0F17]" : "text-stone-700")}>{h.label}</span>
  <span className="mt-0.5 block text-[11px] leading-snug text-stone-400">{h.description}</span>
 </button>
 );
 })}
 </div>
 </>)}
 {/* Socials and the blurb live in the footer, so they only appear when the footer is selected. */}
 {selChrome === "footer" && (<>
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Social links</p>
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Add your socials — they show as icons in the footer on every page. A short blurb sits beside them.</p>
 <div className="space-y-2">
 {([["instagram", "Instagram URL"], ["tiktok", "TikTok URL"], ["facebook", "Facebook URL"], ["youtube", "YouTube URL"], ["pinterest", "Pinterest URL"], ["email", "Contact email"]] as const).map(([key, label]) => (
 <input key={key} value={socials[key] || ""} onChange={(e) => { const next = { ...socials, [key]: e.target.value }; setSocials(next); pushDesign({ socials: next }); }} placeholder={label} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 ))}
 <textarea value={footerAbout} onChange={(e) => { setFooterAbout(e.target.value); pushDesign({ footerAbout: e.target.value }); }} rows={2} placeholder="A short line about your store (footer)" className="w-full resize-y rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] leading-relaxed text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 </div>

 </>)}

 {/* Links belong to both, but a link carries WHERE it shows — so each panel lists the ones that
     appear in it, and a link added here starts out placed here. */}
 <p className="mb-1 mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{selChrome === "header" ? "Nav links" : "Footer links"}</p>
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Your own links in the {selChrome === "header" ? "top nav" : "footer"} — a page, a policy, or an external URL. Set one to “both” to show it in the other too.</p>
 <div className="space-y-2">
 {navLinks.map((l, i) => ({ l, i })).filter(({ l }) => l.place === "both" || l.place === selChrome).map(({ l, i }) => {
 const update = (patch: Partial<NavLink>) => { const next = navLinks.map((x, j) => (j === i ? { ...x, ...patch } : x)); setNavLinks(next); pushDesign({ navLinks: next }); };
 return (
 <div key={i} className="rounded-lg border border-black/10 bg-white p-2">
 <div className="mb-1.5 flex items-center gap-1.5">
 <input value={l.label} onChange={(e) => update({ label: e.target.value })} placeholder="Label" className="w-[38%] rounded-md border border-black/10 px-2 py-1.5 text-[12px] outline-none focus:border-[#5D0F17]/50" />
 <input value={l.href} onChange={(e) => update({ href: e.target.value })} placeholder="/about or https://…" className="flex-1 rounded-md border border-black/10 px-2 py-1.5 text-[12px] outline-none focus:border-[#5D0F17]/50" />
 <button type="button" onClick={() => { const next = navLinks.filter((_, j) => j !== i); setNavLinks(next); pushDesign({ navLinks: next }); }} className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600"><X size={13} /></button>
 </div>
 <div className="flex overflow-hidden rounded-md border border-black/10">
 {(["header", "footer", "both"] as const).map((p) => (
 <button key={p} type="button" onClick={() => update({ place: p })} className={`flex-1 py-1 text-[11px] font-medium capitalize transition ${l.place === p ? "bg-[#5D0F17] text-white" : "text-stone-500 hover:bg-stone-100"}`}>{p}</button>
 ))}
 </div>
 </div>
 );
 })}
 <button type="button" onClick={() => { const next = [...navLinks, { label: "", href: "", place: (selChrome ?? "both") as NavLink["place"] }]; setNavLinks(next); }} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/20 py-2 text-[12px] font-medium text-stone-500 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"><Plus size={13} /> Add a link</button>
 </div>

 </div>
 ) : selOverlay && selOverlayObj?.kind === "form" ? (
 // A form was addable and then frozen: every word it shows — its heading, its note, its button, and
 // the subject its enquiries arrive under — was fixed at whatever `addElement` seeded, with no way
 // to change any of it. Same docked panel the button gets, editing exactly the props the renderer
 // reads, so what you type is what a shopper sees.
 (() => {
 const { blockId, overlayId } = selOverlay;
 const p = selOverlayObj.props || {};
 const patch = (kv: Record<string, string>) => patchOverlayProps(blockId, overlayId, kv);
 const inp = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 return (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[17px] font-semibold tracking-tight text-stone-800">Edit form</p>
 <button type="button" onClick={() => { setSelBlock(null); setSelOverlay(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Heading</label>
 <input value={p.title || ""} onChange={(e) => patch({ title: e.target.value })} className={inp} placeholder="Enquire" />
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Note <span className="font-normal text-stone-400">— optional</span></label>
 <textarea value={p.note || ""} onChange={(e) => patch({ note: e.target.value })} rows={2} className={`${inp} resize-y leading-relaxed`} placeholder="A line under the heading, if it needs one." />
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Button label</label>
 <input value={p.cta || ""} onChange={(e) => patch({ cta: e.target.value })} className={inp} placeholder="Send" />
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Subject</label>
 <input value={p.topic || ""} onChange={(e) => patch({ topic: e.target.value })} className={inp} placeholder={p.title || "Enquiry"} />
 {/* This one isn't decoration: it's how a seller tells two forms apart in the inbox. */}
 <p className="mt-1 text-[11px] leading-snug text-stone-400">What these messages are labelled as in your inbox. Leave blank to use the heading.</p>
 </div>
 <p className="mt-4 border-t border-black/[0.06] pt-3 text-[11px] leading-relaxed text-stone-400">The name, email and message fields are always shown. On your live storefront the form really sends; here it stays inert so you cannot message yourself while arranging the page.</p>
 </div>
 );
 })()
 ) : selOverlay && selOverlayObj?.kind === "button" ? (
 // Select a button element → its full style lives in this SAME panel sections use — a real
 // docked panel, not another floating popover, so it reads unambiguously as "settings," not
 // "toolbar." The floating bar above the button keeps only the fast, look-at-it-and-click edits
 // (fill, text colour, size) plus position/duplicate/delete, which are spatial actions you want
 // right where you're looking, not tucked away in here.
 (() => {
 const { blockId, overlayId } = selOverlay;
 const p = selOverlayObj.props || {};
 const patch = (kv: Record<string, string>) => patchOverlayProps(blockId, overlayId, kv);
 const inp = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 return (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[17px] font-semibold tracking-tight text-stone-800">Edit button</p>
 <button type="button" onClick={() => { setSelBlock(null); setSelOverlay(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Label</label>
 <input value={p.label || ""} onChange={(e) => patch({ label: e.target.value })} className={inp} placeholder="Button" />
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Link</label>
 <input value={p.href || ""} onChange={(e) => patch({ href: e.target.value })} className={inp} placeholder="/shop or https://…" />
 </div>
 <StyleGroup label="Text">
 <StyleRow label="Font">
 <select value={p.font || ""} onChange={(e) => patch({ font: e.target.value })} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: p.font ? ff(p.font) : undefined }}>
 <option value="">Theme font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 <StyleRow label="Size"><Seg options={[["sm", "S"], ["md", "M"], ["lg", "L"]] as const} value={(p.size as "sm" | "md" | "lg") || "md"} onPick={(v) => patch({ size: v })} className="w-32" /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Shape">
 <StyleRow label="Corners"><Seg options={[["square", "◻"], ["rounded", "▢"], ["pill", "⬭"]] as const} value={(p.shape as "square" | "rounded" | "pill") || null} onPick={(v) => patch({ shape: p.shape === v ? "" : v })} className="w-32" /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Style">
 <StyleRow label="Style"><Seg options={[["fill", "Fill"], ["outline", "No fill"]] as const} value={p.outline === "1" ? "outline" : "fill"} onPick={(v) => patch({ outline: v === "outline" ? "1" : "" })} className="w-32" /></StyleRow>
 <StyleRow label={p.outline === "1" ? "Outline" : "Fill"}><ColorSwatch value={p.bg || "#1a1a1a"} onChange={(v) => patch({ bg: v })} /></StyleRow>
 <StyleRow label="Text"><ColorSwatch value={p.color || "#ffffff"} onChange={(v) => patch({ color: v })} /></StyleRow>
 <StyleRow label="Border"><StyleSlider value={Number(p.border ?? (p.outline === "1" ? 2 : 0))} min={0} max={8} suffix="px" onChange={(x) => patch({ border: String(x) })} onClear={() => patch({ border: "" })} /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Hover">
 <StyleRow label="Fill"><ColorSwatch value={p.hoverBg || p.bg || "#1a1a1a"} onChange={(v) => patch({ hoverBg: v })} /></StyleRow>
 <StyleRow label="Text"><ColorSwatch value={p.hoverColor || p.color || "#ffffff"} onChange={(v) => patch({ hoverColor: v })} /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Position">
 {/* Align/Position are one-shot commands, not a persisted setting — a dropdown implies "pick a
 state," but these mean "do this now," so an icon grid you can scan and hit directly (the same
 language Figma/Canva use for alignment) reads better here than the toolbar's dropdown does. */}
 <p className="mb-1.5 text-[12px] text-stone-500">Align</p>
 <div className="mb-3.5 grid grid-cols-6 gap-1.5">
 <button type="button" onClick={() => alignOverlay("left")} title="Align left" className="grid h-8 place-items-center rounded-md border border-black/10 text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignStartVertical size={15} /></button>
 <button type="button" onClick={() => alignOverlay("hcenter")} title="Align centre" className="grid h-8 place-items-center rounded-md border border-black/10 text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignCenterVertical size={15} /></button>
 <button type="button" onClick={() => alignOverlay("right")} title="Align right" className="grid h-8 place-items-center rounded-md border border-black/10 text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignEndVertical size={15} /></button>
 <button type="button" onClick={() => alignOverlay("top")} title="Align top" className="grid h-8 place-items-center rounded-md border border-black/10 text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignStartHorizontal size={15} /></button>
 <button type="button" onClick={() => alignOverlay("vmiddle")} title="Align middle" className="grid h-8 place-items-center rounded-md border border-black/10 text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignCenterHorizontal size={15} /></button>
 <button type="button" onClick={() => alignOverlay("bottom")} title="Align bottom" className="grid h-8 place-items-center rounded-md border border-black/10 text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignEndHorizontal size={15} /></button>
 </div>
 <p className="mb-1.5 text-[12px] text-stone-500">Layer order</p>
 <div className="flex gap-1.5">
 <button type="button" onClick={() => reorderOverlay(blockId, overlayId, "front")} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-black/10 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-[#5D0F17]"><BringToFront size={14} /> Front</button>
 <button type="button" onClick={() => reorderOverlay(blockId, overlayId, "back")} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-black/10 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-[#5D0F17]"><SendToBack size={14} /> Back</button>
 </div>
 </StyleGroup>
 <p className="mt-4 border-t border-black/[0.06] pt-3 text-[11px] leading-relaxed text-stone-400">Duplicate and delete stay on the toolbar above the button.</p>
 </div>
 );
 })()
 ) : textFocus && textFocus.blockId === selBlock && textFocus.key === "cta" && selBlockObj ? (
 // A section's BUILT-IN button (the "Shop now" baked into a hero/featured/split) gets the exact
 // same dedicated panel a free-floating button does — same header, same grouped layout, same
 // Font + Size controls — instead of being one buried sub-section inside the whole section's
 // edit panel.
 (() => {
 const bid = selBlockObj.id;
 const st = (selBlockObj.style || {}) as Record<string, string>;
 const one = (k: keyof BlockStyle, v: string | undefined) => setBlockStyle(bid, k, v);
 return (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[17px] font-semibold tracking-tight text-stone-800">Edit button</p>
 <button type="button" onClick={() => setTextFocus(null)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Label</label>
 <input value={decodeEntities(selBlockObj.props?.cta || "")} onChange={(e) => editField(bid, "cta", e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50" placeholder="Shop now" />
 {/* Only countdown has its own custom link (ctaHref) — every other section's button always
 points at the shop page, so there's nothing to edit there. */}
 {blockDef(selBlockObj.type)?.fields.some((f) => f.key === "ctaHref") ? (
 <>
 <label className="mb-1 mt-3 block text-[12px] font-medium text-stone-600">Link</label>
 <input value={decodeEntities(selBlockObj.props?.ctaHref || "")} onChange={(e) => editField(bid, "ctaHref", e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50" placeholder="/shop or https://…" />
 </>
 ) : (
 <p className="mt-1.5 text-[11px] text-stone-400">Links to your shop page.</p>
 )}
 </div>
 <StyleGroup label="Text">
 <StyleRow label="Font">
 <select value={st.ctaFont || ""} onChange={(e) => one("ctaFont", e.target.value || undefined)} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: st.ctaFont ? ff(st.ctaFont) : undefined }}>
 <option value="">Theme font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 <StyleRow label="Size"><Seg options={[["sm", "S"], ["md", "M"], ["lg", "L"]] as const} value={(st.ctaSize as "sm" | "md" | "lg") || "md"} onPick={(v) => one("ctaSize", v)} className="w-32" /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Shape">
 <StyleRow label="Corners"><Seg options={[["square", "◻"], ["rounded", "▢"], ["pill", "⬭"]] as const} value={(st.ctaShape as "square" | "rounded" | "pill") || null} onPick={(v) => one("ctaShape", st.ctaShape === v ? undefined : v)} className="w-32" /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Style">
 <StyleRow label="Style"><Seg options={[["fill", "Fill"], ["outline", "No fill"]] as const} value={st.ctaOutline ? "outline" : "fill"} onPick={(v) => one("ctaOutline", v === "outline" ? "1" : undefined)} className="w-32" /></StyleRow>
 <StyleRow label={st.ctaOutline ? "Outline" : "Fill"}><ColorSwatch value={st.ctaOutline ? (st.ctaBorderColor || st.ctaBg || "#5D0F17") : (st.ctaBg || "#5D0F17")} onChange={(v) => one(st.ctaOutline ? "ctaBorderColor" : "ctaBg", v)} /></StyleRow>
 <StyleRow label="Text"><ColorSwatch value={st.ctaColor || "#ffffff"} onChange={(v) => one("ctaColor", v)} /></StyleRow>
 <StyleRow label="Border"><StyleSlider value={st.ctaBorder != null && st.ctaBorder !== "" ? Number(st.ctaBorder) : (st.ctaOutline ? 2 : 0)} min={0} max={8} suffix="px" onChange={(x) => one("ctaBorder", String(x))} onClear={() => one("ctaBorder", "")} /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Hover">
 <StyleRow label="Fill"><ColorSwatch value={st.ctaHoverBg || st.ctaBg || "#5D0F17"} onChange={(v) => one("ctaHoverBg", v)} /></StyleRow>
 <StyleRow label="Text"><ColorSwatch value={st.ctaHoverColor || st.ctaColor || "#ffffff"} onChange={(v) => one("ctaHoverColor", v)} /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Position">
 <StyleRow label="Full width"><Toggle on={!!st.ctaFullWidth} onClick={() => one("ctaFullWidth", st.ctaFullWidth ? undefined : "1")} /></StyleRow>
 {!st.ctaFullWidth && (
 <>
 <p className="mb-1.5 mt-1 text-[12px] text-stone-500">Align</p>
 <div className="grid grid-cols-3 gap-1.5">
 {(["left", "center", "right"] as const).map((a) => (
 <button key={a} type="button" onClick={() => one("ctaAlign", st.ctaAlign === a ? undefined : a)} title={ALIGN_LABEL[a]} className={`rounded-md border py-1.5 text-[12px] font-medium transition ${st.ctaAlign === a ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-black/10 text-stone-600 hover:bg-stone-100"}`}>{ALIGN_LABEL[a]}</button>
 ))}
 </div>
 </>
 )}
 </StyleGroup>
 <p className="mt-4 border-t border-black/[0.06] pt-3 text-[11px] leading-relaxed text-stone-400">This button is part of the section — there&apos;s no separate delete or layer order for it.</p>
 </div>
 );
 })()
 ) : ((selFree && selFree.blockId === selBlock && selFree.key !== "cta") || (textFocus && textFocus.blockId === selBlock && textFocus.key !== "cta")) && selBlockObj ? (
 // Select a built-in text element → its full per-field type panel (Figma/Canva-style): font, size,
 // weight, case, colour, alignment, letter-spacing, line-height — all stored on style.free[key].
 (() => {
 const bid = selBlockObj.id;
 const key = (selFree && selFree.blockId === selBlock) ? selFree.key : textFocus!.key;
 const st = selBlockObj.style || {};
 const fv: FreeStyle = st.free?.[key] || {};
 const fieldLabel = FIELD_LABEL[key] || (key.charAt(0).toUpperCase() + key.slice(1));
 const set = (patch: Partial<FreeStyle>) => patchFree(bid, key, patch);
 const dfltPx = key === "heading" ? HEAD_SCALE_PX[st.headingSize || "lg"] : key === "subtext" ? 15 : 16;
 return (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[17px] font-semibold tracking-tight text-stone-800">Edit {fieldLabel.toLowerCase()}</p>
 <button type="button" onClick={() => { setSelFree(null); setTextFocus(null); setFreeEditing(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Text</label>
 <textarea value={decodeEntities(selBlockObj.props?.[key] || "")} onChange={(e) => editField(bid, key, e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50" placeholder={`Add ${fieldLabel.toLowerCase()}`} />
 </div>
 <StyleGroup label="Font">
 <StyleRow label="Family">
 <select value={fv.font || ""} onChange={(e) => set({ font: e.target.value || undefined })} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: fv.font ? ff(fv.font) : undefined }}>
 <option value="">Theme font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 <StyleRow label="Size"><StyleSlider value={fv.fontPx ?? dfltPx} min={8} max={200} suffix="px" onChange={(x) => set({ fontPx: x })} onClear={() => set({ fontPx: undefined })} /></StyleRow>
 <StyleRow label="Style">
 <div className="flex overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => set({ bold: !fv.bold })} title="Bold" className={`w-9 py-1.5 text-[13px] font-bold transition ${fv.bold ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>B</button>
 <button type="button" onClick={() => set({ italic: !fv.italic })} title="Italic" className={`w-9 py-1.5 font-serif text-[13px] italic transition ${fv.italic ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>I</button>
 <button type="button" onClick={() => set({ underline: !fv.underline })} title="Underline" className={`w-9 py-1.5 text-[13px] underline transition ${fv.underline ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>U</button>
 </div>
 </StyleRow>
 <StyleRow label="Case"><Seg options={[["none", "—"], ["uppercase", "AA"], ["lowercase", "aa"], ["capitalize", "Aa"]] as const} value={fv.transform || "none"} onPick={(v) => set({ transform: v === "none" ? undefined : v })} className="w-40" /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Colour">
 <StyleRow label="Text"><ColorSwatch value={fv.color || st.textColor || effectiveSectionColors(st, colors).text} onChange={(v) => set({ color: v })} /></StyleRow>
 </StyleGroup>
 <StyleGroup label="Paragraph">
 <StyleRow label="Align"><Seg options={[["left", "L"], ["center", "C"], ["right", "R"]] as const} value={fv.align || null} onPick={(v) => set({ align: fv.align === v ? undefined : v })} className="w-32" /></StyleRow>
 <StyleRow label="Letter spacing"><StyleSlider value={fv.ls ?? 0} min={-10} max={40} suffix="" onChange={(x) => set({ ls: x })} onClear={() => set({ ls: undefined })} /></StyleRow>
 <StyleRow label="Line height"><StyleSlider value={fv.lh ?? 120} min={80} max={250} suffix="%" onChange={(x) => set({ lh: x })} onClear={() => set({ lh: undefined })} /></StyleRow>
 </StyleGroup>
 <button type="button" onClick={() => { setSelFree(null); setTextFocus(null); removeFreeField(bid, key); }} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-black/10 py-2 text-[12px] font-medium text-stone-500 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /> Delete text</button>
 </div>
 );
 })()
 ) : selBlockObj ? (
 // Select a section → edit ALL its content here (not just the inline text). This is what makes
 // list/URL fields — marquee names, gallery photos, a video link — actually editable.
 (() => {
 const def = blockDef(selBlockObj.type);
 const bp = selBlockObj.props || {};
 // The section's LAYOUT decides which fields it actually has: a slideshow adds `slides`, a split
 // adds `imageSide`. Fields come from the type plus the chosen variant.
 const vDef = resolveVariant(selBlockObj.type, selBlockObj.variant);
 const layouts = variantsFor(selBlockObj.type);
 const itemsName = vDef?.supports?.items;
 const itemSchema = itemsName ? ITEM_SCHEMAS[itemsName] : undefined;
 // Repeated content gets the structured row editor instead of a raw field — except single-field
 // lists (marquee names, gallery URLs), where a plain textarea is genuinely faster to fill.
 const useItemsEditor = !!itemSchema && itemSchema.fields.length > 1 && selBlockObj.type !== "collections";
 const fields = [...(def?.fields || []), ...(vDef?.fields || [])].filter((f) => !(useItemsEditor && itemSchema && f.key === itemSchema.key));
 const inp = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 return (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[17px] font-semibold tracking-tight text-stone-800">Edit {def?.label || selBlockObj.type}</p>
 <button type="button" onClick={() => { setSelBlock(null); setSelOverlay(null); setTextFocus(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>

 {/* Layout — the section's bones. Switching is in-place: same section, same content, new arrangement,
     and it's undoable like any other edit. Only shown for types that actually have a choice. */}
 {layouts.length > 1 && (
 <div className="mb-5">
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Layout</p>
 <div className="grid grid-cols-3 gap-1.5">
 {layouts.map((v) => {
 const active = (vDef?.id || "") === v.id;
 return (
 <button
 key={v.id}
 type="button"
 title={v.description}
 onClick={() => {
 if (active) return;
 const notes = switchNotes(selBlockObj, v.id);
 if (notes.length) setPendingLayout({ blockId: selBlockObj.id, variant: v.id, label: v.label, notes });
 else setBlockVariant(selBlockObj.id, v.id);
 }}
 className={cn("group flex flex-col overflow-hidden rounded-lg border bg-white text-left transition", active ? "border-[#5D0F17] ring-1 ring-[#5D0F17]" : "border-black/10 hover:border-[#5D0F17]/40")}
 >
 <span className="block h-[46px] w-full border-b border-black/5 bg-gradient-to-b from-white to-stone-50"><SectionThumb type={selBlockObj.type} variant={v.id} /></span>
 <span className={cn("truncate px-1.5 py-1 text-[11px] font-medium", active ? "text-[#5D0F17]" : "text-stone-600")}>{v.label}</span>
 </button>
 );
 })}
 </div>
 {pendingLayout?.blockId === selBlockObj.id && (
 <div className="mt-2 rounded-lg border border-[#5D0F17]/25 bg-[#5D0F17]/[0.04] p-2.5">
 <p className="text-[12px] font-semibold text-stone-800">Switch to {pendingLayout.label}?</p>
 {pendingLayout.notes.map((n, i) => <p key={i} className="mt-1 text-[11.5px] leading-snug text-stone-600">{n}</p>)}
 <div className="mt-2 flex gap-1.5">
 <button type="button" onClick={() => setBlockVariant(pendingLayout.blockId, pendingLayout.variant)} className="rounded-md bg-[#5D0F17] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#4a0c12]">Switch</button>
 <button type="button" onClick={() => setPendingLayout(null)} className="rounded-md px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-100">Cancel</button>
 </div>
 </div>
 )}
 <p className="mt-1.5 text-[11px] leading-snug text-stone-400">{vDef?.description}</p>
 </div>
 )}

 {useItemsEditor && itemSchema ? (
 <ItemsEditor
 // Keyed by section: the editor tracks which row is expanded by position, so a fresh section
 // must start fresh rather than inherit "row 3 is open" from the one you were just editing.
 key={selBlockObj.id}
 props={bp}
 schema={itemSchema}
 onChange={(key, value) => editField(selBlockObj.id, key, value)}
 pick={pickAndUpload}
 uploading={uploading}
 addLabel={itemsName === "slides" ? "Add slide" : "Add item"}
 singular={itemsName === "slides" ? "Slide" : "Item"}
 />
 ) : null}

 {selBlockObj.type === "collections" ? (
 <>
 <CollectionsEditor block={selBlockObj} onField={(key, value) => editField(selBlockObj.id, key, value)} pick={pickAndUpload} uploading={uploading} />
 {/* The tile labels are the one piece of type in this section nothing else reaches: they aren't the
     heading (that has its own on-canvas toolbar) and they aren't body copy, so the Headings and
     Subtext groups below both miss them. Unset = whatever the layout already did. */}
 <div className="mt-4 border-t border-black/[0.06] pt-3">
 <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Tile captions</p>
 <div className="space-y-3">
 <StyleRow label="Font">
 <select value={bp.tileFont || ""} onChange={(e) => editField(selBlockObj.id, "tileFont", e.target.value)} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: bp.tileFont ? ff(bp.tileFont) : undefined }}>
 <option value="">Heading font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 <StyleRow label="Size"><StyleSlider value={bp.tileSizePx ? Number(bp.tileSizePx) : undefined} min={9} max={64} suffix="px" onChange={(x) => editField(selBlockObj.id, "tileSizePx", String(x))} onClear={() => editField(selBlockObj.id, "tileSizePx", "")} /></StyleRow>
 <StyleRow label="Colour">
 <ColorSwatch value={bp.tileColor || "#ffffff"} onChange={(v) => editField(selBlockObj.id, "tileColor", v)} />
 {bp.tileColor && <button type="button" onClick={() => editField(selBlockObj.id, "tileColor", "")} title="Back to the layout's own colour" className="text-stone-300 hover:text-stone-500"><X size={12} /></button>}
 </StyleRow>
 </div>
 </div>
 </>
 ) : fields.length ? fields.map((f) => {
 // The hero's "image" field IS the section background — surface the SAME Background dropdown as the
 // toolbar (Photo/GIF, Video, or an embedded link), not a plain image upload, so the two stay in sync.
 const isHeroBg = selBlockObj.type === "hero" && f.key === "image";
 return (
 <div key={f.key} className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">{isHeroBg ? "Background" : f.label}</label>
 {isHeroBg ? (() => {
 const bid = selBlockObj.id;
 const media = selBlockObj.style?.bgMedia;
 const curImg = selBlockObj.props?.image || "";
 return (
 <button type="button" disabled={uploading} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setEmbedInput(""); setEmbedErr(false); setBgMenu(bgMenu?.bid === bid ? null : { bid, top: r.bottom + 8, left: r.left }); }} className="flex w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50">
 {curImg
 ? <span className="h-6 w-6 rounded bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${curImg.replace(/"/g, "%22")}")` }} />
 : media?.kind === "video" ? <Film size={15} className="text-stone-500" />
 : media?.kind === "embed" ? <LinkIcon size={15} className="text-stone-500" />
 : <ImageIcon size={15} className="text-stone-500" />}
 <span className="flex-1 text-left">{media?.kind === "video" ? "Video" : media?.kind === "embed" ? "Embedded video" : curImg ? "Photo" : "Add a background"}</span>
 <ChevronDown size={14} className="text-stone-400" />
 </button>
 );
 })() : f.kind === "textarea" ? (
 <textarea value={bp[f.key] || ""} onChange={(e) => editField(selBlockObj.id, f.key, e.target.value)} rows={5} className={`${inp} resize-y leading-relaxed`} placeholder={def?.defaults?.[f.key] || ""} />
 ) : f.kind === "image" ? (
 <div className="flex items-center gap-2">
 {bp[f.key]
 ? <span className="h-10 w-10 shrink-0 rounded-md bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${bp[f.key].replace(/"/g, "%22")}")` }} />
 : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-400"><ImageIcon size={15} /></span>}
 <button type="button" disabled={uploading} onClick={() => pickAndUpload((url) => editField(selBlockObj.id, f.key, url))} className="rounded-md bg-[#5D0F17] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{uploading ? "Uploading…" : bp[f.key] ? "Replace" : "Upload"}</button>
 {bp[f.key] && <button type="button" onClick={() => editField(selBlockObj.id, f.key, "")} className="rounded-md px-2 py-1.5 text-[12px] text-stone-500 hover:bg-stone-100">Remove</button>}
 </div>
 ) : f.kind === "datetime" ? (
 <input type="datetime-local" value={bp[f.key] || ""} onChange={(e) => editField(selBlockObj.id, f.key, e.target.value)} className={inp} />
 ) : f.kind === "choice" ? (
 <select value={bp[f.key] || def?.defaults?.[f.key] || ""} onChange={(e) => editField(selBlockObj.id, f.key, e.target.value)} className={inp}>
 {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
 </select>
 ) : f.kind === "collection" ? (
 // Which of the store's collections this section draws from. The seller curates once in
 // Inventory and every section pointed at that collection follows — no re-picking products
 // section by section. "" keeps the old behaviour: whatever's newest.
 <>
 <select value={bp[f.key] || ""} onChange={(e) => editField(selBlockObj.id, f.key, e.target.value)} className={inp}>
 <option value="">Newest items (all products)</option>
 {collections.map((c) => <option key={c.slug} value={c.slug}>{c.title} · {c.itemCount}</option>)}
 </select>
 {(() => {
 const chosen = collections.find((c) => c.slug === bp[f.key]);
 if (!bp[f.key]) return <p className="mt-1 text-[11px] leading-snug text-stone-400">Shows your newest pieces automatically.</p>;
 if (!chosen) return <p className="mt-1 text-[11px] leading-snug text-amber-600">That collection no longer exists — showing newest items instead.</p>;
 if (!chosen.itemCount) return <p className="mt-1 text-[11px] leading-snug text-amber-600">“{chosen.title}” is empty. Add items to it in <a href={`${base}/inventory`} className="font-semibold underline">Inventory</a> and they’ll appear here.</p>;
 return <p className="mt-1 text-[11px] leading-snug text-stone-400">{chosen.itemCount} {chosen.itemCount === 1 ? "piece" : "pieces"} · manage in <a href={`${base}/inventory`} className="font-semibold underline">Inventory</a>.</p>;
 })()}
 </>
 ) : (
 <input value={bp[f.key] || ""} onChange={(e) => editField(selBlockObj.id, f.key, e.target.value)} className={inp} placeholder={def?.defaults?.[f.key] || ""} />
 )}
 </div>
 );
 }) : <p className="text-[13px] leading-relaxed text-stone-400">This section has no text fields — its content comes from your products.</p>}

 {selBlockObj.type === "columns" && (
 <div className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Columns per row</label>
 <div className="flex overflow-hidden rounded-lg border border-black/10">
 {["2", "3", "4"].map((c) => (
 <button key={c} type="button" onClick={() => editField(selBlockObj.id, "cols", c)} className={`flex-1 py-1.5 text-[13px] font-medium transition ${(bp.cols || "3") === c ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>{c}</button>
 ))}
 </div>
 </div>
 )}

 {/* Deep style inspector — full visual control over the selected section */}
 <div className="mt-5 border-t border-black/10 pt-4">
 <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Style</p>
 <SectionStyleInspector block={selBlockObj} one={(k, v) => setBlockStyle(selBlockObj.id, k, v)} multi={(patch) => setBlockStyleMulti(selBlockObj.id, patch)} pick={pickAndUpload} uploading={uploading} />
 </div>
 <p className="mt-4 border-t border-black/[0.06] pt-3 text-[11px] leading-relaxed text-stone-400">Tip: click text directly on the canvas to edit it, and drag the section handles to reorder.</p>
 </div>
 );
 })()
 ) : railTab === "assist" ? (
 <Sidekick docked seed={vyaSeed} onSeedUsed={() => setVyaSeed(null)} />
 ) : railTab === "design" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <p className="mb-4 text-[17px] font-semibold tracking-tight text-stone-800">Design</p>
 {/* Templates — the store's whole look lives here now.
     The Style skins (Gallery / Editorial / Boutique / Archive / Statement) used to sit
     in this slot. They were a second, competing style axis that seeded a palette and a
     font pairing — the same two things the Colour palette and Type controls below own —
     so picking a skin silently overwrote choices made under them and there were two
     different answers to "what does my store look like".

     Templates are the real answer: a whole store, with its own home page, Shop grid
     density and pages. applyTemplate() confirms before switching, because it replaces
     the Home and Shop sections.

     NOTE: skinCss() is deliberately still wired up in app/s/Blocks.tsx. Any store that
     already picked a skin keeps rendering exactly as it does today — this removes the
     way to choose a NEW one, it does not retroactively restyle live storefronts. */}
 <button type="button" onClick={() => toggleDesign("Template")} className="mb-2 flex w-full items-center gap-1.5 border-b border-black/[0.07] py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 transition hover:text-stone-800">
 <ChevronDown size={12} className={`transition ${openDesign.has("Template") ? "" : "-rotate-90"}`} /> <span className="flex-1">Template</span>
 </button>
 {openDesign.has("Template") && (<>
 <p className="mb-2 mt-2 text-[12px] leading-snug text-stone-400">A whole starting store — palette, type, a laid-out home page and its own pages. Switching asks first, and keeps the pages you&rsquo;ve written.</p>
 <div className="grid grid-cols-2 gap-2">
 {STOREFRONT_TEMPLATES.map((t) => {
 const active = templateId === t.id;
 return (
 <button
 key={t.id}
 type="button"
 title={t.signature}
 onClick={() => { if (!active) applyTemplate(t); }}
 className={cn("group overflow-hidden rounded-lg border text-left transition", active ? "border-[#5D0F17] ring-1 ring-[#5D0F17]" : "border-black/10 hover:border-[#5D0F17]/40")}
 >
 {/* The template's REAL catalogue density at its real card shape, because
     choosing between them is largely choosing 2-up over 5-up.

     The strips are capped at 34px tall. They size themselves from grid.ratio,
     and in a two-column sidebar a 3/4 card comes out ~57px — taller than the
     swatch, so they were being clipped by overflow-hidden and every card looked
     cut off at the bottom. min-h-0 lets the row shrink instead of overflowing.

     The name is NOT repeated under the swatch: it already renders inside, in the
     template's own heading font, which is half the point of showing it. */}
 <div className="relative flex h-[84px] flex-col justify-between gap-2 overflow-hidden px-2.5 pb-2.5 pt-2.5" style={{ background: t.colors.bg }}>
 <span className="truncate pr-10 text-[12px] leading-tight" style={{ fontFamily: ff(t.fonts.heading), color: t.colors.text }}>{t.name}</span>
 {active && (
 <span className="absolute right-2 top-2 rounded-full bg-[#5D0F17] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white">Current</span>
 )}
 <div className="flex min-h-0 items-end" style={{ gap: t.grid.gutter === "tight" ? 2 : t.grid.gutter === "wide" ? 5 : 3 }}>
 {Array.from({ length: t.grid.cols }).map((_, i) => (
 <span
 key={i}
 className="flex-1"
 style={{
 aspectRatio: t.grid.ratio.replace("/", " / "),
 maxHeight: 34,
 background: `${t.colors.text}1a`,
 borderRadius: t.radius === "round" ? 6 : t.radius === "soft" ? 2 : 0,
 }}
 />
 ))}
 </div>
 </div>
 </button>
 );
 })}
 </div>
 </>)}
 <button type="button" onClick={() => toggleDesign("Colour palette")} className="mb-2 mt-6 flex w-full items-center gap-1.5 border-b border-black/[0.07] py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 transition hover:text-stone-800">
 <ChevronDown size={12} className={`transition ${openDesign.has("Colour palette") ? "" : "-rotate-90"}`} /> <span className="flex-1">Colour palette</span>
 </button>
 {openDesign.has("Colour palette") && (<>
 <div className="grid grid-cols-3 gap-2">
 {STOREFRONT_PALETTES.map((p) => {
 const active = colors.bg === p.colors.bg && colors.text === p.colors.text && colors.accent === p.colors.accent;
 return (
 <button key={p.id} type="button" onClick={() => applyPalette(p.colors)} title={p.name} className={`overflow-hidden rounded-lg border text-left transition ${active ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <div className="flex h-11" style={{ background: p.colors.bg }}>
 <span className="m-auto flex gap-1">
 <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: p.colors.text }} />
 <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: p.colors.accent }} />
 </span>
 </div>
 <p className="truncate px-1.5 py-1 text-[9px] font-medium text-stone-500">{p.name}</p>
 </button>
 );
 })}
 </div>

 {/* Fine-tune colours */}
 </>)}
 <button type="button" onClick={() => toggleDesign("Colours")} className="mb-2 mt-6 flex w-full items-center gap-1.5 border-b border-black/[0.07] py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 transition hover:text-stone-800">
 <ChevronDown size={12} className={`transition ${openDesign.has("Colours") ? "" : "-rotate-90"}`} /> <span className="flex-1">Colours</span>
 </button>
 {openDesign.has("Colours") && (<>
 <div className="space-y-1.5">
 {([["bg", "Background"], ["text", "Text"], ["accent", "Accent"]] as const).map(([key, label]) => {
 const changed = (colors[key] || "").toLowerCase() !== (baseColors[key] || "").toLowerCase();
 return (
 <div key={key} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">{label}</span>
 {changed && (
 <button
 type="button"
 onClick={() => changeColor(key, baseColors[key])}
 title={`Reset ${label.toLowerCase()} to the template colour (${baseColors[key]})`}
 aria-label={`Reset ${label} to template colour`}
 className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
 >
 <RotateCcw size={13} />
 </button>
 )}
 <ColorSwatch value={colors[key]} onChange={(v) => changeColor(key, v)} />
 </div>
 );
 })}
 </div>

 {/* Fonts */}
 </>)}
 <button type="button" onClick={() => toggleDesign("Fonts")} className="mb-2 mt-6 flex w-full items-center gap-1.5 border-b border-black/[0.07] py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 transition hover:text-stone-800">
 <ChevronDown size={12} className={`transition ${openDesign.has("Fonts") ? "" : "-rotate-90"}`} /> <span className="flex-1">Fonts</span>
 </button>
 {openDesign.has("Fonts") && (<>
 <div className="grid grid-cols-2 gap-2">
 {FONT_PAIRS.map((fp) => {
 const active = fonts.heading === fp.heading && fonts.body === fp.body;
 return (
 <button key={fp.name} type="button" onClick={() => changeFont2(fp.heading, fp.body)} className={`rounded-lg border px-3 py-2 text-left transition ${active ? "border-[#5D0F17] ring-1 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <span className="block truncate text-[15px] leading-tight text-stone-800" style={{ fontFamily: ff(fp.heading) }}>{fp.name}</span>
 <span className="block truncate text-[10px] text-stone-400" style={{ fontFamily: ff(fp.body) }}>{fp.heading} · {fp.body}</span>
 </button>
 );
 })}
 </div>
 <div className="mt-2.5 space-y-1.5">
 <label className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-1.5">
 <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-stone-400">Heading</span>
 <select value={fonts.heading} onChange={(e) => changeFont("heading", e.target.value)} className="flex-1 bg-transparent text-[13px] text-stone-700 outline-none">
 {HEADING_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
 </select>
 </label>
 <label className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-1.5">
 <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-stone-400">Body</span>
 <select value={fonts.body} onChange={(e) => changeFont("body", e.target.value)} className="flex-1 bg-transparent text-[13px] text-stone-700 outline-none">
 {BODY_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
 </select>
 </label>
 </div>

 </>)}

{/* Only offered once something has actually changed — a revert button that is always there invites
     the worry that something might have drifted. Reverts colours and fonts together, because a
     palette and the type it was chosen with are one decision. */}
 {lookChanged && (
 <button type="button" onClick={revertLook} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 py-2 text-[12px] font-medium text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]">
 <RotateCcw size={13} /> Revert colours &amp; fonts
 </button>
 )}
 <button type="button" onClick={() => setShowTemplates(true)} className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 py-2.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100"><LayoutTemplate size={13} /> Start from a full template</button>
 <p className="mt-2 text-center text-[11px] leading-snug text-stone-400">Change anything here, or switch to <button type="button" onClick={() => setRailTab("assist")} className="font-semibold text-[#5D0F17] underline">Assist</button> and just describe it.</p>
 </div>
 ) : railTab === "sections" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[17px] font-semibold tracking-tight text-stone-800">Add a layout</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Click a layout to drop it at the bottom of {activeTitle}. You can change its layout later without losing the content.</p>

 {/* Search first: with this many layouts, typing "carousel" or "reviews" beats scrolling. Matches
     the layout name, the section name, and the description, so either vocabulary finds it. */}
 {/* Search and category on ONE row. Ten categories as chips wrapped to three rows and read as
     clutter above a list that already labels every category; a select says the same thing in a
     line, and matches the native selects the Style panel already uses. */}
 {/* Matches the panel (#fbf9f5), not white — a white strip behind a sticky bar reads as a band
     across the panel rather than as the panel's own header. */}
 <div className="sticky top-0 z-10 -mx-4 mb-3 flex gap-1.5 bg-[#fbf9f5]/95 px-4 pb-2 backdrop-blur">
 <div className="relative min-w-0 flex-1">
 <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
 <input value={secQuery} onChange={(e) => setSecQuery(e.target.value)} placeholder="Search layouts…" className="w-full rounded-lg border border-black/10 bg-white py-2 pl-8 pr-7 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 {secQuery && <button type="button" onClick={() => setSecQuery("")} className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-stone-400 hover:bg-stone-100"><X size={12} /></button>}
 </div>
 <select
 value={secCat}
 onChange={(e) => setSecCat(e.target.value as SectionCategory | "all")}
 aria-label="Filter by category"
 className={cn("shrink-0 rounded-lg border bg-white px-2 text-[12px] outline-none focus:border-[#5D0F17]/50", secCat === "all" ? "border-black/10 text-stone-600" : "border-[#5D0F17]/50 font-medium text-[#5D0F17]")}
 >
 <option value="all">All layouts</option>
 {SECTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
 </select>
 </div>

 {(() => {
 // One entry per LAYOUT, not per section type — that's the thing a merchant is actually choosing.
 const q = secQuery.trim().toLowerCase();
 const entries = VARIANTS.flatMap((g) => {
 const def = blockDef(g.type);
 return g.variants.map((v) => ({ type: g.type, typeLabel: def?.label || g.type, variant: v.id, label: v.label, description: v.description, category: g.category }));
 }).filter((e) => (secCat === "all" || e.category === secCat)
  && (!q || `${e.label} ${e.typeLabel} ${e.description}`.toLowerCase().includes(q)));
 if (!entries.length) return <p className="py-10 text-center text-[12px] text-stone-400">No layouts match “{secQuery}”.</p>;
 // Two levels: the CATEGORY is the divider ("Content"), the SECTION is the heading under it
 // ("Columns"), and its layouts are the cards. The category tells you which neighbourhood you're in;
 // the section is the thing you're actually looking for. A category chip already names the
 // neighbourhood, so its divider is dropped while one is selected. Searching collapses to a flat
 // list — a search is its own filter, and headings there would just be noise.
 const bySection = (list: typeof entries) =>
  VARIANTS.map((g) => [blockDef(g.type)?.label || g.type, list.filter((e) => e.type === g.type)] as [string, typeof entries])
   .filter(([, l]) => l.length);
 const card = (e: typeof entries[number], showType: boolean) => (
 <button key={`${e.type}/${e.variant}`} type="button" onClick={() => addSection(e.type, e.variant)} title={e.description} className="group flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white text-left transition hover:-translate-y-px hover:border-[#5D0F17]/40 hover:shadow-[0_10px_26px_-14px_rgba(43,36,29,0.5)]">
 <div className="h-[68px] w-full border-b border-black/5 bg-gradient-to-b from-white to-stone-50"><SectionThumb type={e.type} variant={e.variant} /></div>
 <span className="flex flex-col gap-0.5 px-2.5 py-2">
 <span className="flex items-center gap-1">
 <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800">{e.label}</span>
 <Plus size={12} className="shrink-0 text-stone-300 transition group-hover:text-[#5D0F17]" />
 </span>
 {showType && <span className="truncate text-[10.5px] text-stone-400">{e.typeLabel}</span>}
 </span>
 </button>
 );
 const grid = (list: typeof entries, showType = false) => <div className="grid grid-cols-2 gap-2">{list.map((e) => card(e, showType))}</div>;
 if (q) return grid(entries, true);
 return SECTION_CATEGORIES.map((c) => {
 const inCat = entries.filter((e) => e.category === c);
 if (!inCat.length) return null;
 // Filtered to one category, or searching → no point collapsing a list of one thing.
 const collapsible = secCat === "all";
 const open = !collapsible || openCats.has(c);
 const count = inCat.length;
 return (
 <div key={c} className="mb-2">
 {collapsible && (
 <button
  type="button"
  onClick={() => setOpenCats((prev) => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; })}
  className="flex w-full items-center gap-1.5 border-b border-black/[0.07] py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 transition hover:text-stone-800"
 >
  <ChevronDown size={12} className={`transition ${open ? "" : "-rotate-90"}`} />
  <span className="flex-1">{c}</span>
  <span className="text-[10px] font-medium tracking-normal text-stone-400">{count}</span>
 </button>
 )}
 {open && (
 <div className="pt-2">
 {bySection(inCat).map(([name, list]) => (
 <div key={name} className="mb-3">
 <p className="mb-1.5 text-[12px] font-semibold text-stone-700">{name}</p>
 {grid(list)}
 </div>
 ))}
 </div>
 )}
 </div>
 );
 });
 })()}
 <button type="button" onClick={() => setShowTemplates(true)} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 py-2.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100"><LayoutTemplate size={13} /> Start from a full template</button>
 </div>
 ) : railTab === "elements" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Drop onto {selBlock ? "the selected section" : "the last section"}, then drag it anywhere. It scales with the layout and stacks neatly on mobile.</p>
 <p className="mb-1.5 text-[17px] font-semibold tracking-tight text-stone-800">Elements</p>
 <div className="mb-4 grid grid-cols-3 gap-2">
 {([["button", "Button", MousePointerClick], ["image", "Image", ImageIcon]] as const).map(([kind, label, Icon]) => (
 <button key={kind} type="button" onClick={() => addElement(kind)} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <Icon size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">{label}</span>
 </button>
 ))}
 {/* A badge and a text link are a button with different clothes — same element, different defaults.
     Presets rather than new element types: nothing in the renderer, the sanitizer, or the saved
     data has to learn about them, and a seller can still restyle either into the other. */}
 <button type="button" onClick={() => addElement("button", { label: "One of one", href: "", bg: colors.accent, color: "#ffffff" })} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <Sparkles size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">Badge</span>
 </button>
 <button type="button" onClick={() => addElement("button", { label: "Read more", href: "", bg: "transparent", color: colors.accent })} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <LinkIcon size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">Text link</span>
 </button>
 {/* A real form, not a decoration — it posts to the store on the live site. The seller names it,
     and that name rides along with the message so enquiries don't all arrive looking alike. */}
 <button type="button" onClick={() => addElement("form", { title: "Enquire", topic: "Enquiry", cta: "Send", note: "" })} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <Type size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">Form</span>
 </button>
 </div>
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Shapes</p>
 <div className="grid grid-cols-3 gap-2">
 {([["rect", "Rectangle", Square], ["circle", "Circle", Circle], ["triangle", "Triangle", Shapes], ["line", "Line", Minus]] as const).map(([kind, label, Icon]) => (
 <button key={kind} type="button" onClick={() => addElement(kind)} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <Icon size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">{label}</span>
 </button>
 ))}
 </div>
 </div>
 ) : railTab === "text" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <button type="button" onClick={() => addElement("text", { text: "Your text here", size: "md", color: colors.text, font: fonts.body })} className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D0F17] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]"><Type size={14} /> Add a text box</button>
 <p className="mb-2 text-[17px] font-semibold tracking-tight text-stone-800">Text styles</p>
 <div className="space-y-2">
 <button type="button" onClick={() => addElement("text", { text: "Add a heading", size: "xl", color: colors.text, font: fonts.heading })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[22px] font-bold leading-tight text-stone-800" style={{ fontFamily: ff(fonts.heading) }}>Add a heading</span></button>
 <button type="button" onClick={() => addElement("text", { text: "Add a subheading", size: "lg", color: colors.text, font: fonts.heading })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[16px] font-semibold text-stone-800" style={{ fontFamily: ff(fonts.heading) }}>Add a subheading</span></button>
 <button type="button" onClick={() => addElement("text", { text: "Add a little bit of body text", size: "sm", color: colors.text, font: fonts.body })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[13px] text-stone-600">Add a little bit of body text</span></button>
 {/* A pull quote and an eyebrow are the two bits of type a storefront reaches for that neither a
     heading nor body text covers — one wants scale and a serif, the other wants to be small and
     spaced out. Both are the same text element, seeded differently. */}
 <button type="button" onClick={() => addElement("text", { text: "“Every piece has a past.”", size: "lg", color: colors.text, font: fonts.heading })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[17px] italic leading-snug text-stone-700" style={{ fontFamily: ff(fonts.heading) }}>“Add a pull quote”</span></button>
 <button type="button" onClick={() => addElement("text", { text: "NEW IN", size: "sm", color: colors.accent, font: fonts.body })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Add an eyebrow label</span></button>
 </div>
 <p className="mt-4 text-[12px] leading-snug text-stone-400">Each drops a text box onto {selBlock ? "the selected section" : "the last section"} — then drag it anywhere and format it inline.</p>
 </div>
 ) : railTab === "uploads" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <label className="mb-4 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#5D0F17] px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">{assetsBusy ? "Uploading…" : (<><UploadIcon size={14} /> Upload a photo</>)}<input type="file" accept="image/*" className="hidden" disabled={assetsBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadToLibrary(f); }} /></label>
 <p className="mb-1 text-[17px] font-semibold tracking-tight text-stone-800">Your uploads</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Click a photo to add it to {selBlock ? "the selected section" : "the last section"}, then drag it anywhere.</p>
 {assets.length === 0 ? (
 <p className="text-[12px] leading-relaxed text-stone-400">{assetsBusy ? "Loading…" : "No uploads yet — add photos and they'll live here, reusable across your whole site."}</p>
 ) : (
 <div className="grid grid-cols-3 gap-1.5">
 {assets.map(({ url }) => (
 // eslint-disable-next-line @next/next/no-img-element
 <button key={url} type="button" onClick={() => addElement("image", { src: url })} className="aspect-square overflow-hidden rounded-md border border-black/10 transition hover:ring-2 hover:ring-[#5D0F17]/40"><img src={url} alt="" className="h-full w-full object-cover" /></button>
 ))}
 </div>
 )}
 </div>
 ) : null}
 </div>
 )}
 </div>

 {/* Tight padding — every pixel spent on chrome here is a pixel of the seller's page they can't see. */}
 <div className="flex min-w-0 flex-1 flex-col items-center overflow-hidden px-5 pb-2 pt-3">
 <div className="mb-2 flex items-center gap-2 text-[12px] text-stone-500">
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" />
 Tell VYA what to build — or click any text on the page to edit it yourself
 </div>

 {loading ? (
 <div className="mt-24 text-[13px] text-stone-400">Loading your store…</div>
 ) : (
 <div className="flex min-h-0 w-full flex-1 flex-col">
 <div
  ref={viewportRef}
  // Clicking the empty workspace around the page dismisses whatever is selected — the same
  // "click away to put it down" gesture as Escape. A click that landed inside a page frame is
  // left alone (sections own their own selection), and so is one on a floating toolbar: those
  // are position:fixed but still DOM children here, so their clicks bubble through.
  onPointerDown={(e) => {
   const t = e.target as HTMLElement;
   if (t.closest("[data-page], [data-studio-bar]")) return;
   setSelBlock(null); setSelOverlay(null); setSelFree(null); setFreeEditing(null);
   setTextFocus(null); setSelChrome(null); setFmtBar(null); setEditingId(null);
  }}
  className="relative min-h-0 flex-1 overflow-auto"
 >
 {/* Spacer carries the SCALED footprint so the workspace scrolls and centres correctly; the page
     inside keeps its true pixel size and is drawn scaled. Two elements, because a transform
     doesn't change layout — without the spacer a zoomed-in page would have nowhere to scroll. */}
 <div className="flex min-h-full w-full p-4">
 {/* `m-auto` (not items-center) centres the page on both axes AND keeps it fully reachable when
     zoomed past the workspace — flex centring would clip the top edge out of scroll range. */}
 {/* Hidden for the single frame before the workspace has been measured — otherwise the page paints
     once at 100% (overflowing) and then snaps to its fitted size, which reads as a glitch. */}
 <div className={`m-auto shrink-0${avail.w ? "" : " invisible"}`} style={{ width: baseW * z, height: (contentH || baseH) * z }}>
 {/* The document: every page stacked in order. The scale lives here so one transform covers the
     whole stack — that's what makes zooming out an overview of the site, not of one page. */}
 <div ref={frameRef} className="flex flex-col gap-10" style={{ width: baseW, transform: `scale(${z})`, transformOrigin: "top left" }}>
 {allPages.slice(0, activeIdx).map(pagePreview)}
 <div data-page={activeSlug} className="flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-24px_rgba(43,36,29,0.4)] ring-1 ring-black/10" style={{ minHeight: baseH, maxHeight: MAX_PAGE_H }}>
 {/* browser chrome + page-switcher dropdown */}
 <div className="relative flex h-9 shrink-0 items-center gap-2 border-b border-black/[0.07] bg-[#f4f1ec] px-3">
 <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /></div>
 <div className="relative">
 <button type="button" onClick={() => setDdOpen((o) => !o)} className={`flex h-6 items-center gap-1.5 rounded-md border bg-white px-2 text-[11px] font-semibold transition ${ddOpen ? "border-[#5D0F17] text-[#5D0F17]" : "border-black/10 text-stone-700 hover:border-black/20"}`}>
 {activeTitle} <ChevronDown size={11} className={`transition ${ddOpen ? "rotate-180" : ""}`} />
 </button>
 {ddOpen && (
 <>
 <button type="button" aria-label="Close" className="fixed inset-0 z-[68] cursor-default" onClick={() => setDdOpen(false)} />
 <div className="absolute left-0 top-8 z-[70] w-52 rounded-xl border border-black/10 bg-white p-1 shadow-[0_18px_44px_-12px_rgba(43,36,29,0.45)]">
 {pageList.map((p) => (
 <div key={p.slug} className="group/pg flex items-center">
 <button type="button" onClick={() => switchPage(p.slug)} className={`flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-stone-100 ${p.slug === activeSlug ? "font-semibold text-[#5D0F17]" : "text-stone-700"}`}>
 <Check size={13} className={p.slug === activeSlug ? "text-[#5D0F17]" : "invisible"} />
 <span className="flex-1 truncate">{p.title}</span>
 <span className="text-[10px] text-stone-400">{p.n}</span>
 </button>
 {p.slug !== "home" && p.slug !== "shop" && (
 <button type="button" onClick={() => deletePage(p.slug)} title="Delete page" className="mr-1 hidden h-6 w-6 place-items-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600 group-hover/pg:grid"><X size={13} /></button>
 )}
 </div>
 ))}
 <div className="my-1 h-px bg-black/[0.07]" />
 <button type="button" onClick={addPage} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-[#5D0F17] transition hover:bg-stone-100"><Plus size={13} /> New page</button>
 </div>
 </>
 )}
 </div>
 <div className="ml-auto flex h-5 items-center rounded-md bg-white px-2 text-[11px] text-stone-400"><span className="text-stone-600">{handle || "your-store"}</span>.getvya.ai{activeSlug !== "home" ? `/${activeSlug}` : ""}</div>
 </div>

 {/* editable canvas */}
 {/* Runs to its full height so the WORKSPACE scrolls it — that's what makes zooming out show more
     of the design. Only once a page passes MAX_PAGE_H does it scroll within its own frame. */}
 <div ref={canvasRef} onDragOver={onCanvasDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDrag(false); }} onDrop={onCanvasDrop} className="relative min-h-0 flex-1 overflow-y-auto" style={{ background: colors.bg }}>
 {fileDrag && (
 <div className="pointer-events-none absolute inset-0 z-40 m-2 flex items-center justify-center rounded-lg border-2 border-dashed border-[#5D0F17] bg-[#5D0F17]/[0.06]">
 <span className="rounded-full bg-[#5D0F17] px-4 py-1.5 text-[12px] font-semibold text-white shadow">Drop a photo onto a section to set its background</span>
 </div>
 )}
 {customCss && <style dangerouslySetInnerHTML={{ __html: stripThemeBackgroundOverrides(customCss) }} />}
 {/* Persistent site chrome — the header + footer wrap every page (same as the live storefront). */}
 <div style={{ fontFamily: ff(fonts.body), color: colors.text }}>
 {/* Clicking the chrome selects it — the same gesture as clicking a section. A click that landed on
     a nav link or button is left alone, so navigating never doubles as selecting. */}
 <div
  onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input")) return; setSelChrome("header"); setSelBlock(null); setSelOverlay(null); setPanelOpen(true); }}
  className={`relative cursor-pointer transition-shadow ${selChrome === "header" ? "shadow-[inset_0_0_0_2px_#5D0F17]" : "hover:shadow-[inset_0_0_0_2px_rgba(93,15,23,0.45)]"}`}
 >
 <StoreHeader layout={headerLayout} storeName={storeName} logo={logo || null} nav={headerChromeNav} colors={colors} headingFontFamily={ff(fonts.heading)} onNav={(item) => item.slug ? switchPage(item.slug) : item.href && window.open(item.href, "_blank")} search={<Search size={16} strokeWidth={1.8} />} />
 </div>
 {curBlocks.length > 0 ? (
 <Blocks blocks={curBlocks} colors={colors} fonts={fonts} radius={radius} products={products} collections={collections} onSelect={(id) => { setSelBlock(id); setSelOverlay(null); setTextFocus(null); setSelFree(null); setFreeEditing(null); setSelChrome(null); setPanelOpen(true); }} selectedId={selOverlay ? null : selBlock} edit onEditField={editField} reorder={canvasReorder} overlayEdit={overlayEdit} freeEdit={freeEdit} onContentDragStart={onHeroContentDragStart} onFaqOp={faqOp} faqDnd={faqDnd} onFieldFocus={(blockId, key) => { setSelBlock(blockId); setSelOverlay(null); setTextFocus({ blockId, key }); setPanelOpen(true); }} onResizeSectionStart={onSectionResizeStart} onPickImage={pickAndUpload} onDropImage={dropAndUpload} skin={skin || undefined} />
 ) : activeSlug === "shop" ? null : (
 <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-8 py-20 text-center">
 <p className="text-[14px] text-stone-400" style={{ fontFamily: ff(fonts.body) }}>This page is empty.</p>
 <p className="text-[13px] text-stone-400">Add one from the <button type="button" onClick={() => setRailTab("sections")} className="font-semibold text-[#5D0F17] underline">Layout</button> panel, or ask VYA to build it.</p>
 </div>
 )}
 {/* Shop page: the product grid auto-lists your live inventory (same as the storefront) — shown here so the page reads true. */}
 {activeSlug === "shop" && shopGrid}
 {/* Clicking the chrome selects it — the same gesture as clicking a section. A click that landed on
     a nav link or button is left alone, so navigating never doubles as selecting. */}
 <div
  onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input")) return; setSelChrome("footer"); setSelBlock(null); setSelOverlay(null); setPanelOpen(true); }}
  className={`relative cursor-pointer transition-shadow ${selChrome === "footer" ? "shadow-[inset_0_0_0_2px_#5D0F17]" : "hover:shadow-[inset_0_0_0_2px_rgba(93,15,23,0.45)]"}`}
 >
 <StoreFooter storeName={storeName} logo={logo || null} nav={footerChromeNav} tagline={settings?.tagline ?? null} colors={colors} headingFontFamily={ff(fonts.heading)} year={new Date().getFullYear()} socials={socials} footerAbout={footerAbout} newsletter={<FooterEmailPreview accent={colors.accent} />} onNav={(item) => item.slug ? switchPage(item.slug) : item.href && window.open(item.href, "_blank")} />
 </div>
 </div>
 </div>
 </div>
 {allPages.slice(activeIdx + 1).map(pagePreview)}
 </div>
 </div>
 </div>
 </div>
 {/* Canva-style Pages strip — visual page tiles below the canvas (click to switch, + to add) */}
 {/* Pages on the left, zoom on the right — both are "where am I in the document" controls, so they
     belong on the same rail. The page tiles scroll; the zoom stays put rather than scrolling away. */}
 <div className="mt-2 flex w-full items-end gap-3">
 <div className="flex min-w-0 flex-1 items-end gap-2 overflow-x-auto px-1 pb-0.5">
 {pageList.map((p) => (
 <div key={p.slug} className="group/pt flex shrink-0 flex-col items-center gap-1.5">
 {/* Tile + delete are SIBLINGS in a relative wrapper — a <button> can't nest inside a <button>. */}
 <div className="relative">
 <button type="button" onClick={() => switchPage(p.slug)} title={p.title} className={`relative grid h-[46px] w-[36px] place-items-center overflow-hidden rounded-md border bg-white shadow-sm transition ${p.slug === activeSlug ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <div className="absolute inset-0 flex flex-col gap-0.5 p-1">
 <div className="h-1 w-3/4 rounded-full bg-stone-200" />
 <div className="h-[3px] w-full rounded-full bg-stone-100" />
 <div className="h-[3px] w-5/6 rounded-full bg-stone-100" />
 <div className="mt-auto h-2 w-full rounded-sm bg-stone-100" />
 </div>
 </button>
 {p.slug !== "home" && p.slug !== "shop" && (
 <button type="button" onClick={(e) => { e.stopPropagation(); deletePage(p.slug); }} title="Delete page" className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 place-items-center rounded-full bg-white text-stone-400 shadow ring-1 ring-black/10 hover:text-red-600 group-hover/pt:grid"><X size={10} /></button>
 )}
 </div>
 <span className={`max-w-[52px] truncate text-[9px] ${p.slug === activeSlug ? "font-semibold text-[#5D0F17]" : "text-stone-500"}`}>{p.n}. {p.title}</span>
 </div>
 ))}
 <div className="flex shrink-0 flex-col items-center gap-1.5">
 <button type="button" onClick={addPage} title="Add page" className="grid h-[46px] w-[36px] place-items-center rounded-md border border-dashed border-black/20 text-stone-400 transition hover:border-[#5D0F17] hover:text-[#5D0F17]"><Plus size={16} /></button>
 <span className="text-[9px] text-stone-400">Add page</span>
 </div>
 </div>
 {/* Clicking the percentage clears the manual zoom, dropping back to the size that fits. */}
 <div className="mb-1 flex shrink-0 items-center gap-1 rounded-full border border-black/10 bg-white px-1.5 py-1 shadow-sm">
 <button type="button" title="Zoom out" onClick={() => zoomTo(z - 0.1)} className="grid h-6 w-6 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"><Minus size={13} /></button>
 <input type="range" min={10} max={200} step={5} value={Math.round(z * 100)} onChange={(e) => zoomTo(Number(e.target.value) / 100)} aria-label="Zoom" className="h-1 w-24 cursor-pointer accent-[#5D0F17]" />
 <button type="button" title="Zoom in" onClick={() => zoomTo(z + 0.1)} className="grid h-6 w-6 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"><Plus size={13} /></button>
 <button type="button" title="Fit to workspace" onClick={() => setZoom(null)} className="min-w-[42px] rounded-full px-1.5 text-[11px] font-semibold tabular-nums text-stone-600 transition hover:bg-stone-100">{Math.round(z * 100)}%</button>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Floating text-format toolbar */}
 {fmtBar && (
 <div style={{ position: "fixed", top: fmtBar.top - 44, left: fmtBar.left, transform: "translateX(-50%)", zIndex: 60 }} className="flex items-center gap-0.5 rounded-lg bg-[#211a15] p-1 shadow-[0_10px_26px_-8px_rgba(0,0,0,0.65)]">
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("bold"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Bold"><span className="text-[15px] font-bold">B</span></button>
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("italic"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Italic"><span className="font-serif text-[15px] italic">I</span></button>
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("underline"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Underline"><span className="text-[15px] underline">U</span></button>
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("strikeThrough"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Strikethrough"><span className="text-[15px] line-through">S</span></button>
 <span className="mx-0.5 h-4 w-px bg-white/20" />
 <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-md hover:bg-white/15" title="Text colour">
 <span className="h-4 w-4 rounded-full border border-white/60" style={{ background: colors.accent }} />
 <input type="color" defaultValue={colors.accent} onChange={(e) => fmtCmd("foreColor", e.target.value)} className="absolute h-0 w-0 opacity-0" />
 </label>
 <span className="mx-0.5 h-4 w-px bg-white/20" />
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("justifyLeft"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Align left"><AlignLeft size={14} /></button>
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("justifyCenter"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Align centre"><AlignCenter size={14} /></button>
 <button type="button" onMouseDown={(e) => { e.preventDefault(); fmtCmd("justifyRight"); }} className="grid h-7 w-7 place-items-center rounded-md text-[#e9e3d8] hover:bg-white/15" title="Align right"><AlignRight size={14} /></button>
 </div>
 )}

 {/* Alignment guides — thin accent lines that appear where a dragged/resized element snaps */}
 {guides && (
 <>
 {guides.v != null && <div style={{ position: "fixed", left: guides.v, top: guides.top, height: guides.height, width: 1, background: "#5D0F17", zIndex: 70, pointerEvents: "none" }} />}
 {guides.h != null && <div style={{ position: "fixed", top: guides.h, left: guides.left, width: guides.width, height: 1, background: "#5D0F17", zIndex: 70, pointerEvents: "none" }} />}
 </>
 )}

 {/* Selected free-form element — contextual toolbar, floating just above it (Canva-style) */}
 {selOverlayObj && selOverlay && anchor && !ovlDragging && (() => {
 const { blockId, overlayId } = selOverlay;
 const p = selOverlayObj.props || {};
 const swatch = (val: string, onChange: (v: string) => void, title: string) => <ColorDot value={val} onChange={onChange} title={title} />;
 const inp = "rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 const fontSel = (val: string, onChange: (v: string) => void) => (
 <select value={val} title="Font" onChange={(e) => onChange(e.target.value)} className={`shrink-0 max-w-[9rem] ${inp}`} style={{ fontFamily: val ? ff(val) : undefined }}>
 <option value="">Default font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 );
 // w-max (not a fixed width): the bar hugs however wide its actual controls are — a short set (like
 // the now-trimmed button bar) stays on one row; flex-wrap only kicks in as a fallback once content
 // genuinely can't fit within max-w, e.g. a kind with many controls on a narrow device preview.
 return (
 <div data-studio-bar ref={overlayBarRef} style={{ position: "fixed", top: anchor.top, left: anchor.left, transform: "translateX(-50%)", zIndex: 65 }} className="flex w-max max-w-[92vw] flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]">
 <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 capitalize">{selOverlayObj.kind}</span>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {selOverlayObj.kind === "button" && (
 // Trimmed to the fast, look-at-it-and-click edits. Label/link/font/corners/outline/border/hover
 // now live in the side panel this element opens on select (left rail) — a real docked panel, not
 // another popover, so the toolbar itself stays short.
 <>
 {swatch(p.bg || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { bg: v }), p.outline === "1" ? "Outline colour" : "Fill")}
 {swatch(p.color || "#ffffff", (v) => patchOverlayProps(blockId, overlayId, { color: v }), "Text colour")}
 <ToolbarDropdown key={`${overlayId}-size`} label="Size" options={OVL_BTN_SIZE_OPTIONS} labels={OVL_BTN_SIZE_LABEL} value={p.size || "md"} onChange={(s) => patchOverlayProps(blockId, overlayId, { size: s })} width="w-32" />
 </>
 )}
 {selOverlayObj.kind === "text" && (
 <>
 <input value={p.text || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { text: e.target.value })} placeholder="Text" className={`w-40 ${inp}`} />
 {fontSel(p.font || "", (v) => patchOverlayProps(blockId, overlayId, { font: v }))}
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => patchOverlayProps(blockId, overlayId, { bold: p.bold === "1" ? "" : "1" })} title="Bold" className={`w-7 py-1 text-[13px] font-bold transition ${p.bold === "1" ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>B</button>
 <button type="button" onClick={() => patchOverlayProps(blockId, overlayId, { italic: p.italic === "1" ? "" : "1" })} title="Italic" className={`w-7 py-1 font-serif text-[13px] italic transition ${p.italic === "1" ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>I</button>
 <button type="button" onClick={() => patchOverlayProps(blockId, overlayId, { underline: p.underline === "1" ? "" : "1" })} title="Underline" className={`w-7 py-1 text-[13px] underline transition ${p.underline === "1" ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>U</button>
 </div>
 {/* Numeric size (px) — writes the same fontPx a corner-drag already sets, just directly typeable.
 Falls back to this preset's real rendered size (matches OVL_TEXT_SIZE in Blocks.tsx), so it shows the
 truthful current size for text placed before this control existed, instead of jumping on first touch. */}
 <div className="flex shrink-0 items-center gap-1">
 <input
 type="number"
 min={8}
 max={200}
 title="Font size (px)"
 value={p.fontPx ? Number(p.fontPx) : OVL_SIZE_PX[p.size || "md"]}
 onChange={(e) => patchOverlayProps(blockId, overlayId, { fontPx: e.target.value ? String(Math.max(8, Math.min(200, Number(e.target.value)))) : "" })}
 className="w-14 rounded-md border border-black/10 bg-white px-1.5 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50"
 />
 <span className="text-[10px] text-stone-400">px</span>
 </div>
 {swatch(p.color || "#ffffff", (v) => patchOverlayProps(blockId, overlayId, { color: v }), "Text colour")}
 </>
 )}
 {selOverlayObj.kind === "image" && (
 <>
 {p.src
 ? <span className="h-7 w-7 shrink-0 rounded-md bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${p.src.replace(/"/g, "%22")}")` }} />
 : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-400"><ImageIcon size={13} /></span>}
 <button type="button" disabled={uploading} onClick={() => pickAndUpload((url) => patchOverlayProps(blockId, overlayId, { src: url }))} className="shrink-0 rounded-md bg-[#5D0F17] px-3 py-1 text-[12px] font-medium text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{uploading ? "Uploading…" : p.src ? "Replace" : "Upload"}</button>
 <input value={p.alt || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { alt: e.target.value })} placeholder="Alt text" title="Alt text (for SEO & accessibility)" className={`w-32 ${inp}`} />
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Opacity</span>
 <input type="range" min={10} max={100} value={Number(p.opacity ?? 100)} onChange={(e) => patchOverlayProps(blockId, overlayId, { opacity: e.target.value })} className="w-20 accent-[#5D0F17]" />
 </div>
 <span className="shrink-0 text-[10px] italic text-stone-400">drag corners to resize</span>
 </>
 )}
 {(selOverlayObj.kind === "rect" || selOverlayObj.kind === "circle") && (
 <>
 {swatch(p.fill || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { fill: v }), "Fill")}
 {selOverlayObj.kind === "rect" && (
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Round</span>
 <input type="range" min={0} max={80} value={Number(p.radius ?? 10)} onChange={(e) => patchOverlayProps(blockId, overlayId, { radius: e.target.value })} className="w-20 accent-[#5D0F17]" />
 </div>
 )}
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Opacity</span>
 <input type="range" min={10} max={100} value={Number(p.opacity ?? 100)} onChange={(e) => patchOverlayProps(blockId, overlayId, { opacity: e.target.value })} className="w-20 accent-[#5D0F17]" />
 </div>
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Border</span>
 <input type="range" min={0} max={12} value={Number(p.border ?? 0)} onChange={(e) => patchOverlayProps(blockId, overlayId, { border: e.target.value })} className="w-16 accent-[#5D0F17]" />
 </div>
 {Number(p.border ?? 0) > 0 && swatch(p.borderColor || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { borderColor: v }), "Border colour")}
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 {([["", "None"], ["sm", "S"], ["md", "M"], ["lg", "L"]] as const).map(([s, lab]) => (
 <button key={s} type="button" onClick={() => patchOverlayProps(blockId, overlayId, { shadow: s })} className={`px-2 py-1 text-[11px] font-medium transition ${(p.shadow || "") === s ? "bg-[#5D0F17] text-white" : "text-stone-500 hover:bg-stone-100"}`}>{lab}</button>
 ))}
 </div>
 </>
 )}
 {selOverlayObj.kind === "line" && (
 <>
 {swatch(p.color || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { color: v }), "Colour")}
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Weight</span>
 <input type="range" min={1} max={30} value={Number(p.thickness ?? 2)} onChange={(e) => patchOverlayProps(blockId, overlayId, { thickness: e.target.value })} className="w-24 accent-[#5D0F17]" />
 </div>
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 {([["solid", "—"], ["dashed", "--"], ["dotted", "···"]] as const).map(([s, glyph]) => (
 <button key={s} type="button" title={s} onClick={() => patchOverlayProps(blockId, overlayId, { dash: s })} className={`w-8 py-1 text-[11px] font-medium transition ${(p.dash || "solid") === s ? "bg-[#5D0F17] text-white" : "text-stone-500 hover:bg-stone-100"}`}>{glyph}</button>
 ))}
 </div>
 </>
 )}
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {/* Align within the section — one-shot commands (reposition once), not a persistent style, so
 nothing is ever shown as "selected" in this dropdown; picking an option just fires it. */}
 <ToolbarDropdown key={`${overlayId}-align`} label="Align" options={OVL_ALIGN_OPTIONS} labels={OVL_ALIGN_LABEL} value={undefined} onChange={(v) => alignOverlay(v)} width="w-36" />
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <ToolbarDropdown key={`${overlayId}-position`} label="Position" options={OVL_POSITION_OPTIONS} labels={OVL_POSITION_LABEL} value={undefined} onChange={(v) => reorderOverlay(blockId, overlayId, v)} width="w-40" />
 <button type="button" onClick={() => duplicateOverlay(blockId, overlayId)} title="Duplicate (⌘D)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><Copy size={14} /></button>
 <button type="button" onClick={() => removeOverlay(blockId, overlayId)} title="Delete element (⌫)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 {/* VYA sits on this bar too — an element you dragged onto a section is still part of that section,
     and "universally" has to mean every bar or merchants learn it's only on some of them. */}
 {(() => { const ob = curBlocks.find((x) => x.id === blockId); return ob ? <button type="button" onClick={() => askVya(ob)} title="Ask VYA about this section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#5D0F17] transition hover:bg-[#5D0F17]/[0.08]"><Sparkles size={14} /></button> : null; })()}
 </div>
 );
 })()}

 {/* Selected section — contextual toolbar floating just above it (background incl. photo, text, align, spacing) */}
 {selBlockObj && anchor && !ovlDragging && (() => {
 const b = selBlockObj, st = b.style || {};
 const bid = b.id;
 const chip = (on: boolean) => `rounded-md px-2 py-1 text-[11px] font-medium transition ${on ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`;
 // Reorder/duplicate/delete apply to the whole section regardless of which bar is showing, so both
 // the Background and Text bars end with the same tail.
 const tail = (() => { const idx = curBlocks.findIndex((x) => x.id === bid); return (
 <>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" disabled={idx <= 0} onClick={() => moveBlock(bid, "up")} title="Move section up" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-25"><ChevronUp size={15} /></button>
 <button type="button" disabled={idx < 0 || idx >= curBlocks.length - 1} onClick={() => moveBlock(bid, "down")} title="Move section down" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-25"><ChevronDown size={15} /></button>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => duplicateBlock(bid)} title="Duplicate section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"><Copy size={14} /></button>
 <button type="button" onClick={() => removeBlock(bid)} title="Delete section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </>
 ); })();
 // `sectionTail` is what scopes the bar to what's actually selected. Move-up/down, duplicate, and
 // delete act on the WHOLE section — correct when the section is what you picked, wrong when you
 // picked a heading inside it and the arrow silently reordered the page instead. So a field/button
 // bar drops them (and already carries its own delete): to move the section, select the section.
 // VYA, on every bar. The assistant was only reachable by leaving the canvas for the Assist rail and
 // then describing which section you meant — so the fastest way to fix a section was never to ask.
 // This opens Assist with the question already addressed to the section you're looking at.
 const vyaBtn = (
 <button type="button" onClick={() => askVya(b)} title="Ask VYA about this section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#5D0F17] transition hover:bg-[#5D0F17]/[0.08]"><Sparkles size={14} /></button>
 );
 const wrap = (label: string, body: React.ReactNode, sectionTail = true) => (
 <div data-studio-bar key={`${bid}-${label}`} style={{ position: "fixed", top: anchor.top, left: anchor.left, transform: "translateX(-50%)", zIndex: 65 }} className="flex max-w-[94vw] items-center gap-2 overflow-x-auto rounded-xl border border-black/10 bg-white px-3 py-2 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]">
 <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {body}
 {sectionTail ? tail : null}
 {vyaBtn}
 </div>
 );
 // Focused inside a text field in THIS section → its own bar: colour, alignment, and (heading only)
 // font + size. Otherwise → the section's background bar. Both write the same BlockStyle — this is a
 // UI split, not a data split, so switching bars never loses anything.
 // A built-in text field is ACTIVE when it's focused (being typed into) OR just selected on the canvas —
 // either way it gets the Text toolbar, never the section's background bar.
 const activeKey = (textFocus && textFocus.blockId === bid) ? textFocus.key : (selFree && selFree.blockId === bid) ? selFree.key : null;
 if (activeKey === "image") {
 // A photo's own bar. Without this the generic text bar takes over and its first control is an
 // input bound to props[key] — which for a photo is the image URL, offered as if it were copy.
 const z = Math.min(400, Math.max(100, Number(b.props?.imageZoom) || 100));
 const fv: FreeStyle = st.free?.image || {};
 const framed = fv.x != null || fv.w != null || fv.h != null;
 return wrap("Photo", (
 <>
 <button type="button" disabled={uploading} onClick={() => pickAndUpload((url) => editField(bid, "image", url))} className="shrink-0 rounded-md bg-[#5D0F17] px-3 py-1 text-[12px] font-medium text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{uploading ? "…" : "Replace"}</button>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Zoom</span>
 <input type="range" min={100} max={400} step={5} value={z} onChange={(e) => editField(bid, "imageZoom", e.target.value === "100" ? "" : e.target.value)} className="w-20 accent-[#5D0F17]" />
 <span className="w-9 text-right font-mono text-[11px] tabular-nums text-stone-500">{z}%</span>
 </div>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {/* "Fully across", in one click. Dragging a frame to exactly full width is a game of pixels, and
     it's the shape most of these layouts want anyway. Clears the position too: a full-width band
     that's also floating somewhere isn't a thing anyone means. */}
 <button type="button" onClick={() => resetPhotoFrame(bid)} title="Back to the layout's own full-width frame" className="shrink-0 rounded-md border border-black/10 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-stone-100">{framed ? "Reset to layout" : "Full width"}</button>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => removePhoto(bid)} title="Remove the photo (⌫)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </>
 ), false);
 }
 if (activeKey) {
 const key = activeKey;
 // The built-in button ("cta") isn't running text like the others — it needs its own dedicated
 // controls (fill/outline, shape, hover, full width), not the generic colour/align/B-I-U bar.
 // Mirrors the sidebar's "Button" style group, just reachable without leaving the canvas.
 if (key === "cta") {
 // Trimmed to the fast, look-at-it-and-click edits — same split as the free-floating button:
 // Corners/Outline/Border/Hover/Full-width now live in the section's side panel (left rail),
 // opened automatically when this field is focused.
 return wrap("Button", (
 <>
 <ColorDot value={st.ctaOutline ? (st.ctaBorderColor || st.ctaBg || "#5D0F17") : (st.ctaBg || "#5D0F17")} onChange={(v) => setBlockStyle(bid, st.ctaOutline ? "ctaBorderColor" : "ctaBg", v)} title={st.ctaOutline ? "Outline colour" : "Fill"} />
 <ColorDot value={st.ctaColor || "#ffffff"} onChange={(v) => setBlockStyle(bid, "ctaColor", v)} title="Text colour" />
 <ToolbarDropdown key={`${bid}-cta-size`} label="Size" options={OVL_BTN_SIZE_OPTIONS} labels={OVL_BTN_SIZE_LABEL} value={st.ctaSize || "md"} onChange={(s) => setBlockStyle(bid, "ctaSize", s)} width="w-32" />
 {!st.ctaFullWidth && <ToolbarDropdown key={`${bid}-cta-align`} label="Align" options={ALIGN_OPTIONS} labels={ALIGN_LABEL} value={st.ctaAlign} onChange={(a) => setBlockStyle(bid, "ctaAlign", st.ctaAlign === a ? undefined : a)} width="w-28" />}
 </>
 ), false);
 }
 const fieldLabel = FIELD_LABEL[key] || (key.charAt(0).toUpperCase() + key.slice(1));
 // Every built-in text field now carries its OWN styling in style.free[key] — font, size, weight, colour,
 // alignment, etc. all independent per field (heading can be bold + gold while subtext stays plain).
 const fv: FreeStyle = st.free?.[key] || {};
 const fallbackPx = key === "heading" ? HEAD_SCALE_PX[st.headingSize || "lg"] : key === "subtext" ? 15 : 16;
 return wrap(fieldLabel, (
 <>
 <input value={b.props?.[key] ?? ""} onChange={(e) => editField(bid, key, e.target.value)} placeholder={`Add ${fieldLabel.toLowerCase()}`} className="w-44 shrink-0 rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <ColorDot value={fv.color || st.textColor || effectiveSectionColors(st, colors).text} onChange={(v) => patchFree(bid, key, { color: v })} title="Text colour" />
 <ToolbarDropdown key={`${bid}-${key}-align`} label="Align" options={ALIGN_OPTIONS} labels={ALIGN_LABEL} value={fv.align} onChange={(a) => patchFree(bid, key, { align: fv.align === a ? undefined : (a as FreeStyle["align"]) })} width="w-28" />
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => patchFree(bid, key, { bold: !fv.bold })} title="Bold" className={`${chip(!!fv.bold)} font-bold`}>B</button>
 <button type="button" onClick={() => patchFree(bid, key, { italic: !fv.italic })} title="Italic" className={`${chip(!!fv.italic)} italic`}>I</button>
 <button type="button" onClick={() => patchFree(bid, key, { underline: !fv.underline })} title="Underline" className={`${chip(!!fv.underline)} underline`}>U</button>
 </div>
 <select value={fv.font || ""} title="Font" onChange={(e) => patchFree(bid, key, { font: e.target.value || undefined })} className="shrink-0 max-w-[9rem] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50">
 <option value="">Default font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
 </select>
 <div className="flex shrink-0 items-center gap-1">
 <input type="number" min={8} max={200} title="Font size (px)" value={fv.fontPx ?? fallbackPx} onChange={(e) => patchFree(bid, key, { fontPx: e.target.value ? Math.max(8, Math.min(200, Number(e.target.value))) : undefined })} className="w-14 rounded-md border border-black/10 bg-white px-1.5 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 <span className="text-[10px] text-stone-400">px</span>
 </div>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => { setSelFree(null); setTextFocus(null); removeFreeField(bid, key); }} title="Delete (⌫)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </>
 ), false);
 }
 // Show each swatch's real current colour (Page default → theme bg, accent/dark → their colour), not a fixed fallback.
 const eff = effectiveSectionColors(st, colors);
 const bgUrl = sectionBgUrl(b);
 const media = b.style?.bgMedia;
 const allowMedia = b.type !== "image"; // video/embed backgrounds everywhere except the in-flow image block
 const hasBg = !!bgUrl || !!media;
 const bar = wrap(b.type.replace(/[-_]/g, " "), (
 <>
 <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone-400">Bg</span>
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => { setBlockStyle(bid, "bg", undefined); setSectionBgMedia(b, undefined); }} className={chip(!st.bg && !st.bgImage && !media)}>Page</button>
 <button type="button" onClick={() => setBlockStyle(bid, "bg", "accent")} className={chip(st.bg === "accent")}>Accent</button>
 <button type="button" onClick={() => setBlockStyle(bid, "bg", "dark")} className={chip(st.bg === "dark")}>Dark</button>
 </div>
 <ColorDot value={eff.bg} onChange={(v) => setBlockStyle(bid, "bg", v)} title="Custom colour" />
 {/* Background media — photo/GIF, video, or an embedded link. Opens the popover below. */}
 <button type="button" disabled={uploading}
 onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setEmbedInput(""); setEmbedErr(false); setBgMenu(bgMenu?.bid === bid ? null : { bid, top: r.bottom + 8, left: r.left }); }}
 className="flex shrink-0 items-center gap-1.5 rounded-md border border-black/10 px-2.5 py-1 text-[12px] font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50">
 {bgUrl
 ? <span className="h-4 w-4 rounded bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${bgUrl.replace(/"/g, "%22")}")` }} />
 : media?.kind === "video" ? <Film size={13} className="text-stone-500" />
 : media?.kind === "embed" ? <LinkIcon size={13} className="text-stone-500" />
 : <ImageIcon size={13} className="text-stone-500" />}
 Background
 <ChevronDown size={12} className="text-stone-400" />
 </button>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <ToolbarDropdown key={bid} label="Space" options={SPACE_OPTIONS} labels={SPACE_LABEL} value={st.space} onChange={(s) => setBlockStyle(bid, "space", st.space === s ? undefined : s)} width="w-32" />
 {/* Edge to edge. An image section's framing is a choice, and this is where you make it — one
     click, rather than finding Spacing in the panel and dragging two sliders to zero. */}
 {b.type === "image" && (
 <button type="button" onClick={() => editField(bid, "fill", b.props?.fill === "1" ? "" : "1")} title="Fill — edge to edge, no margin around the photo" aria-pressed={b.props?.fill === "1"} className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${b.props?.fill === "1" ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-black/10 text-stone-600 hover:bg-stone-100"}`}>Fill</button>
 )}
 {/* Zoom — for whichever photo this section actually has.
     A hero, split or spotlight paints props.image; every other section paints a full-bleed background
     photo. Both are now real <img> layers that drag to reposition, so both take the same control —
     it just writes a different key. Zoom scales about the focal point the drag stores, so the two
     compose: pan to the part you want, then magnify it. */}
 {(() => {
 const zoomKey = b.props?.image ? "imageZoom" : bgUrl ? "bgZoom" : null;
 if (!zoomKey) return null;
 const z = Math.min(400, Math.max(100, Number(b.props?.[zoomKey]) || 100));
 return (
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Zoom</span>
 <input type="range" min={100} max={400} step={5} value={z} onChange={(e) => editField(bid, zoomKey, e.target.value === "100" ? "" : e.target.value)} title="Zoom into the photo — drag the photo itself to choose which part" className="w-24 accent-[#5D0F17]" />
 <span className="w-9 text-right font-mono text-[11px] tabular-nums text-stone-500">{z}%</span>
 {z > 100 && <button type="button" onClick={() => editField(bid, zoomKey, "")} title="Reset zoom" className="text-stone-300 hover:text-stone-500"><X size={12} /></button>}
 </div>
 );
 })()}
 {b.type === "hero" && b.props?.image && (b.props?.cx || b.props?.cy) && (
 <button type="button" onClick={() => updateCur((bs) => bs.map((x) => (x.id === bid ? { ...x, props: { ...(x.props || {}), cx: "", cy: "" } } : x)))} title="Recenter the content" className="shrink-0 rounded-md border border-black/10 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-stone-100">Recenter</button>
 )}
 </>
 ));
 return (
 <>
 {bar}
 {bgMenu && bgMenu.bid === bid && (
 <>
 <button type="button" aria-label="Close background menu" className="fixed inset-0 z-[79] cursor-default" onClick={() => setBgMenu(null)} />
 <div className="fixed z-[80] w-64 rounded-xl border border-black/10 bg-white p-1.5 shadow-[0_18px_44px_-12px_rgba(43,36,29,0.45)]" style={{ top: bgMenu.top, left: typeof window !== "undefined" ? Math.min(bgMenu.left, window.innerWidth - 268) : bgMenu.left }}>
 <button type="button" disabled={uploading} onClick={() => { pickAndUpload((url) => setSectionBgImage(b, url)); setBgMenu(null); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-700 transition hover:bg-stone-100 disabled:opacity-50">
 <ImageIcon size={15} className="shrink-0 text-stone-400" /><span className="flex-1">Photo or GIF</span><span className="text-[11px] text-stone-400">Upload</span>
 </button>
 {allowMedia && (
 <button type="button" disabled={uploading} onClick={() => { pickAndUpload((url) => setSectionBgMedia(b, { kind: "video", url }), "video/mp4,video/webm,video/quicktime"); setBgMenu(null); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-700 transition hover:bg-stone-100 disabled:opacity-50">
 <Film size={15} className="shrink-0 text-stone-400" /><span className="flex-1">Video</span><span className="text-[11px] text-stone-400">Upload</span>
 </button>
 )}
 {allowMedia && (
 <div className="mt-1 border-t border-black/5 px-1 pt-2">
 <span className="mb-1 flex items-center gap-2 px-1.5 text-[12px] font-medium text-stone-600"><LinkIcon size={13} className="text-stone-400" />Embed a video link</span>
 <div className="flex items-center gap-1.5 px-1.5">
 <input value={embedInput} onChange={(ev) => { setEmbedInput(ev.target.value); setEmbedErr(false); }} onKeyDown={(ev) => { if (ev.key === "Enter") { if (backgroundEmbedSrc(embedInput)) { setSectionBgMedia(b, { kind: "embed", url: embedInput.trim() }); setBgMenu(null); setEmbedInput(""); } else setEmbedErr(true); } }} placeholder="YouTube or Vimeo URL" className="min-w-0 flex-1 rounded-md border border-black/10 px-2 py-1 text-[12px] outline-none focus:border-[#5D0F17]/50" />
 <button type="button" onClick={() => { if (backgroundEmbedSrc(embedInput)) { setSectionBgMedia(b, { kind: "embed", url: embedInput.trim() }); setBgMenu(null); setEmbedInput(""); } else setEmbedErr(true); }} className="shrink-0 rounded-md bg-[#5D0F17] px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-[#4a0c12]">Use</button>
 </div>
 {embedErr ? <p className="mt-1 px-1.5 text-[11px] text-red-600">Paste a YouTube or Vimeo link.</p> : <p className="mt-1 px-1.5 text-[11px] leading-snug text-stone-400">Plays muted &amp; looping behind the section. YouTube &amp; Vimeo work best.</p>}
 </div>
 )}
 {hasBg && (
 <button type="button" onClick={() => { setSectionBgMedia(b, undefined); setSectionBgImage(b, undefined); setBgMenu(null); }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-black/5 px-2.5 py-2 text-left text-[13px] text-stone-500 transition hover:bg-stone-100 hover:text-red-600">
 <X size={15} className="shrink-0 text-stone-400" />Remove background
 </button>
 )}
 </div>
 </>
 )}
 </>
 );
 })()}

 {/* Layers panel (Figma/Canva-style) — the selected section's elements, front→back, click to select + reorder */}
 {(() => {
 const layerSec = selBlock ? curBlocks.find((b) => b.id === selBlock) : null;
 const layerOverlays = layerSec?.overlays || [];
 if (!selBlock || layerOverlays.length === 0 || ovlDragging || editingId) return null;
 return (
 <div style={{ position: "fixed", right: 20, top: 148, zIndex: 60 }} className="w-56 overflow-hidden rounded-xl border border-black/10 bg-white/95 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)] backdrop-blur">
 <div className="flex items-center gap-1.5 border-b border-black/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500"><Layers size={12} /> Layers <span className="ml-auto font-normal normal-case text-stone-400">front → back</span></div>
 <div className="max-h-[50vh] overflow-y-auto p-1.5">
 {[...layerOverlays].reverse().map((o) => {
 const Ic = OverlayIcon(o);
 const isSel = selOverlay?.overlayId === o.id;
 return (
 <div key={o.id} onClick={() => { setSelBlock(selBlock); setSelOverlay({ blockId: selBlock, overlayId: o.id }); setEditingId(null); }} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition ${isSel ? "bg-[#5D0F17]/10 text-[#5D0F17]" : "text-stone-600 hover:bg-stone-100"}`}>
 <Ic size={13} className="shrink-0" strokeWidth={1.8} />
 <span className="flex-1 truncate text-[12px]">{overlayLabel(o)}</span>
 <button type="button" title="Bring forward" onClick={(e) => { e.stopPropagation(); reorderOverlay(selBlock, o.id, "forward"); }} className="grid h-5 w-5 place-items-center rounded text-stone-400 opacity-0 transition hover:bg-black/5 hover:text-stone-700 group-hover:opacity-100"><ChevronUp size={13} /></button>
 <button type="button" title="Send backward" onClick={(e) => { e.stopPropagation(); reorderOverlay(selBlock, o.id, "backward"); }} className="grid h-5 w-5 place-items-center rounded text-stone-400 opacity-0 transition hover:bg-black/5 hover:text-stone-700 group-hover:opacity-100"><ChevronDown size={13} /></button>
 </div>
 );
 })}
 </div>
 </div>
 );
 })()}

 {/* Template picker — pick a vibe; restyles + lays out a fresh home page */}
 {showTemplates && (
 <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" onClick={() => setShowTemplates(false)}>
 <div className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
 <div className="mb-4 flex items-start justify-between">
 <div>
 <h2 className="text-[17px] font-semibold text-stone-900">Pick a template</h2>
 <p className="mt-0.5 text-[12px] text-stone-500">A whole starting store — palette, type, a laid-out home page, the Shop grid, and its own pages. Change anything after, or ask VYA.</p>
 </div>
 <button type="button" onClick={() => setShowTemplates(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"><X size={18} /></button>
 </div>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
 {STOREFRONT_TEMPLATES.map((t) => (
 <button key={t.id} type="button" onClick={() => applyTemplate(t)} title={t.signature} className="group overflow-hidden rounded-xl border border-stone-200 text-left transition hover:border-[#5D0F17] hover:shadow-md">
 {/* The swatch shows the template's REAL catalogue density at its real card shape, because a
     seller choosing Vitrine over The Index is choosing 2-up over 5-up — that's the decision,
     and a name plus three colour dots doesn't show it. */}
 <div className="flex h-28 flex-col justify-between px-3.5 pb-3 pt-3.5" style={{ background: t.colors.bg }}>
 <span className="text-[17px] leading-none" style={{ fontFamily: ff(t.fonts.heading), color: t.colors.text }}>{t.name}</span>
 <div className="flex gap-[3px]" style={{ gap: t.grid.gutter === "tight" ? 2 : t.grid.gutter === "wide" ? 6 : 4 }}>
 {Array.from({ length: t.grid.cols }).map((_, i) => (
 <span
 key={i}
 className="flex-1"
 style={{
 aspectRatio: t.grid.ratio.replace("/", " / "),
 background: `${t.colors.text}1a`,
 borderRadius: t.radius === "round" ? 8 : t.radius === "soft" ? 3 : 0,
 }}
 />
 ))}
 </div>
 </div>
 <div className="border-t border-stone-100 p-3">
 <p className="text-[13px] font-semibold text-stone-900">{t.name}</p>
 <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-500">{t.bestFor}</p>
 <p className="mt-1.5 text-[10px] uppercase tracking-[0.1em] text-stone-400">
 {t.grid.cols}-up · {t.layout.length} sections · {t.pages.length} pages
 </p>
 <span className="mt-2 inline-block text-[11px] font-semibold text-[#5D0F17] opacity-0 transition group-hover:opacity-100">Use this template →</span>
 </div>
 </button>
 ))}
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
