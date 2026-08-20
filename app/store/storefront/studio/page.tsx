"use client";

// Chat-first storefront studio (tracks 1–3).
// The builder: describe it to VYA on the left; on the right, a LIVE, EDITABLE preview of the
// store. Text is click-to-edit inline, sections drag to reorder, and a page dropdown switches
// which page you're editing — all on the same canvas the assistant edits. Reuses the existing
// Blocks renderer (edit mode) + the design API. Every change autosaves; VYA's changes reload it.

import { useCallback, useEffect, useRef, useState } from "react";
import Sidekick from "../../Sidekick";
import Blocks, { decodeEntities } from "@/app/s/Blocks";
import { StoreHeader, StoreFooter, type ChromeNav } from "@/app/s/StoreChrome";
import { stripThemeBackgroundOverrides } from "@/app/lib/theme-css";
import { makeBlock, makeOverlay, newBlockId, pageSlugify, BLOCK_TYPES, blockDef, type Block, type BlockType, type BlockStyle, type Overlay, type OverlayKind, type StorePage } from "@/app/lib/storefront-blocks";
import { STOREFRONT_TEMPLATES, templateBlocks, STOREFRONT_PALETTES, RADIUS_OPTIONS, HEADING_FONTS, BODY_FONTS, SERIF_FONTS, ALL_STOREFRONT_FONTS, storefrontFontsHref, type StorefrontTemplate } from "@/app/lib/storefront-templates";
import { HexInput, ColorSwatch, ColorDot } from "@/app/store/storefront/ColorPicker";
import SectionThumb from "@/app/store/storefront/SectionThumb";
import { ChevronLeft, ChevronRight, Monitor, Tablet, Smartphone, ExternalLink, ChevronDown, ChevronUp, Plus, X, Check, LayoutTemplate, Palette, Layers, Sparkles, Type, Image as ImageIcon, MousePointerClick, Trash2, Copy, Square, Circle, Minus, BringToFront, SendToBack, Search, Undo2, Redo2, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Shapes, Upload as UploadIcon, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

type Colors = { bg: string; text: string; accent: string };
type Fonts = { heading: string; body: string };
type Radius = "sharp" | "soft" | "round";
type RailTab = "design" | "sections" | "elements" | "text" | "uploads" | "assist";
type Product = { title: string; price: number | null; currency: string; image: string };
type Device = "desktop" | "tablet" | "phone";
type Settings = { handle: string; enabled: boolean; tagline: string | null; accentColor: string | null; heroImage: string | null; about: string | null };

const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
const ff = (name?: string) => (name ? `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);
const money = (c: number | null, cur: string) => (c == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(c));

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
const RADIUS_PREVIEW: Record<Radius, string> = { sharp: "0px", soft: "6px", round: "12px" };

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
function SectionStyleInspector({ block, one, multi, pick, uploading }: { block: Block; one: (key: keyof BlockStyle, v: string | undefined) => void; multi: (patch: Partial<Record<keyof BlockStyle, string | undefined>>) => void; pick: (cb: (url: string) => void) => void; uploading: boolean }) {
 const st = (block.style || {}) as Record<string, string>;
 const n = (k: string) => (st[k] != null && st[k] !== "" ? Number(st[k]) : undefined);
 const swatch = (val: string, onChange: (v: string) => void) => <ColorSwatch value={val} onChange={onChange} />;
 const bgType: "theme" | "solid" | "gradient" | "photo" | "accent" | "dark" = st.bgImage ? "photo" : st.bgGradient ? "gradient" : st.bg === "dark" ? "dark" : st.bg === "accent" ? "accent" : /^#/.test(st.bg || "") ? "solid" : "theme";
 const grad = (st.bgGradient || "#F4F0E8|#E9E0CE|180").split("|");
 return (
 <div className="mt-1">
 <StyleGroup label="Background">
 <Seg options={[["theme", "Theme"], ["solid", "Solid"], ["gradient", "Gradient"], ["photo", "Photo"], ["accent", "Accent"], ["dark", "Dark"]] as const} value={bgType} onPick={(v) => {
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
 <StyleRow label="Align"><Seg options={[["left", "L"], ["center", "C"], ["right", "R"]] as const} value={(st.align as "left") || null} onPick={(v) => one("align", st.align === v ? undefined : v)} className="w-28" /></StyleRow>
 </StyleGroup>

 <StyleGroup label="Headings">
 <StyleRow label="Font">
 <select value={st.headingFont || ""} onChange={(e) => one("headingFont", e.target.value || undefined)} className="w-[140px] rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50" style={{ fontFamily: st.headingFont ? ff(st.headingFont) : undefined }}>
 <option value="">Theme font</option>
 {ALL_STOREFRONT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </StyleRow>
 <StyleRow label="Size"><Seg options={[["sm", "S"], ["md", "M"], ["lg", "L"], ["xl", "XL"]] as const} value={(st.headingSize as "md") || null} onPick={(v) => one("headingSize", st.headingSize === v ? undefined : v)} className="w-32" /></StyleRow>
 <StyleRow label="Spacing"><StyleSlider value={n("tracking") ?? 0} min={-8} max={30} suffix="" onChange={(x) => one("tracking", String(x))} onClear={() => one("tracking", "")} /></StyleRow>
 </StyleGroup>

 <StyleGroup label="Spacing">
 <StyleRow label="Vertical"><StyleSlider value={n("padY")} min={0} max={200} step={4} suffix="px" onChange={(x) => one("padY", String(x))} onClear={() => one("padY", "")} /></StyleRow>
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
 const [settings, setSettings] = useState<Settings | null>(null);
 const [storeName, setStoreName] = useState("Your store");
 const [colors, setColors] = useState<Colors>({ bg: "#FFFDF8", text: "#1a1a1a", accent: "#5D0F17" });
 const [fonts, setFonts] = useState<Fonts>({ heading: "Playfair Display", body: "Inter" });
 const [radius, setRadius] = useState<Radius>("sharp");
 const [railTab, setRailTab] = useState<RailTab>("design");
 const [panelOpen, setPanelOpen] = useState(true); // Canva-style: collapse the side panel to free up canvas space
 const [products, setProducts] = useState<Product[]>([]);
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
 const [faqDrag, setFaqDrag] = useState<{ blockId: string; index: number } | null>(null); // FAQ row being dragged
 const [faqOver, setFaqOver] = useState<{ blockId: string; index: number } | null>(null); // where it will drop
 const [fileDrag, setFileDrag] = useState(false); // an image file is being dragged over the canvas
 const [uploading, setUploading] = useState(false);
 const [dragIdx, setDragIdx] = useState<number | null>(null);
 const [canvasOver, setCanvasOver] = useState<number | null>(null);
 const [fmtBar, setFmtBar] = useState<{ top: number; left: number } | null>(null);
 const [device, setDevice] = useState<Device>("desktop");
 const [loading, setLoading] = useState(true);
 const [publishing, setPublishing] = useState(false);
 const [gateMsg, setGateMsg] = useState<string | null>(null); // "pick a plan to go live" prompt
 const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
 const [ddOpen, setDdOpen] = useState(false);
 const [showTemplates, setShowTemplates] = useState(false);
 const canvasRef = useRef<HTMLDivElement>(null);
 const loadedRef = useRef(false);
 const importedNameRef = useRef<string | null>(null); // brand name pulled from an imported site (wins over account name)
 const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 const loadDesign = useCallback(async () => {
 const r = await fetch("/api/store/storefront/design").catch(() => null);
 if (!r || !r.ok) return;
 const d = await r.json();
 if (d.storeName) { importedNameRef.current = d.storeName; setStoreName(d.storeName); }
 if (d.colors) setColors(d.colors);
 if (d.fonts) setFonts(d.fonts);
 if (d.radius === "sharp" || d.radius === "soft" || d.radius === "round") setRadius(d.radius);
 setProducts(d.products || []);
 setBlocks(d.blocks || []);
 setShopBlocks(d.shopBlocks || []);
 setExtraPages(d.extraPages || []);
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
 function switchPage(slug: string) { setActiveSlug(slug); setSelBlock(null); setSelOverlay(null); setFmtBar(null); setDdOpen(false); }
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

 // Pick a vibe: restyle (colors/fonts) + lay out a fresh home page from the template.
 async function applyTemplate(t: StorefrontTemplate) {
 if (!window.confirm(`Switch to “${t.name}”? This restyles your store and replaces the home page sections. Your other pages, products, and settings stay.`)) return;
 setColors(t.colors);
 setFonts(t.fonts);
 setBlocks(templateBlocks(t.id)); // the autosave effect persists the new sections
 setActiveSlug("home");
 setSelBlock(null);
 setShowTemplates(false);
 await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: t.id, colors: t.colors, fonts: t.fonts }) }).catch(() => {});
 }

 // ── Design panel: direct-manipulation colour / font / corner controls (the "Canva-easy" surface) ──
 // Tokens live on the theme, not the blocks, so they persist through their own debounced POST (the
 // blocks autosave effect only handles sections). Colour pickers fire rapidly while dragging, hence the
 // debounce; palette / font / corner clicks are discrete but ride the same path.
 const designTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const pushDesign = useCallback((patch: { colors?: Colors; fonts?: Fonts; radius?: Radius; customCss?: string; socials?: Record<string, string>; footerAbout?: string; navLinks?: NavLink[] }) => {
 if (designTimer.current) clearTimeout(designTimer.current);
 setSave("saving");
 designTimer.current = setTimeout(async () => {
 await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
 setSave("saved");
 }, 400);
 }, []);
 function applyPalette(c: Colors) { setColors(c); pushDesign({ colors: c }); }
 function changeColor(key: keyof Colors, val: string) { const next = { ...colors, [key]: val }; setColors(next); pushDesign({ colors: next }); }
 function changeFont(which: keyof Fonts, val: string) { const next = { ...fonts, [which]: val }; setFonts(next); pushDesign({ fonts: next }); }
 function changeFont2(heading: string, body: string) { const next = { heading, body }; setFonts(next); pushDesign({ fonts: next }); }
 function changeRadius(r: Radius) { setRadius(r); pushDesign({ radius: r }); }

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
 if (json === lastSnapRef.current) return;
 pastRef.current.push(lastSnapRef.current);
 if (pastRef.current.length > 200) pastRef.current.shift();
 futureRef.current = [];
 lastSnapRef.current = json;
 setHist({ u: pastRef.current.length, r: 0 });
 }, [blocks, shopBlocks, extraPages, colors, fonts, radius, customCss, socials, footerAbout, loading]);
 const restoreSnap = useCallback((json: string) => {
 const s = JSON.parse(json);
 applyingRef.current = true;
 setBlocks(s.blocks || []); setShopBlocks(s.shopBlocks || []); setExtraPages(s.extraPages || []);
 setColors(s.colors); setFonts(s.fonts); setRadius(s.radius); setCustomCss(s.customCss || "");
 setSocials(s.socials || {}); setFooterAbout(s.footerAbout || "");
 setSelBlock(null); setSelOverlay(null); setEditingId(null);
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
 updateCur((bs) => bs.map((b) => (b.id !== selOverlay.blockId ? b : { ...b, overlays: (b.overlays || []).map((ov) => (ov.id !== selOverlay.overlayId ? ov : { ...ov, x: Math.max(0, Math.min(98, (ov.x ?? 10) + dx)), y: Math.max(0, Math.min(98, (ov.y ?? 10) + dy)) })) })));
 return;
 }
 if (mod && k === "d") { // duplicate selection
 if (selOverlay) { e.preventDefault(); duplicateOverlay(selOverlay.blockId, selOverlay.overlayId); }
 else if (selBlock) { e.preventDefault(); duplicateBlock(selBlock); }
 return;
 }
 if (k === "delete" || k === "backspace") { // remove selection
 if (selOverlay) { e.preventDefault(); removeOverlay(selOverlay.blockId, selOverlay.overlayId); }
 else if (selBlock) { e.preventDefault(); removeBlock(selBlock); }
 return;
 }
 if (k === "escape") { setSelOverlay(null); setSelBlock(null); setEditingId(null); }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [undo, redo, selBlock, selOverlay]); // eslint-disable-line react-hooks/exhaustive-deps

 // Add a section to the current page (Canva's "Elements" analog for a section-based builder) and
 // select it so the seller can immediately edit it on the canvas.
 function addSection(type: BlockType) {
 const b = makeBlock(type);
 updateCur((bs) => [...bs, b]);
 setSelBlock(b.id);
 requestAnimationFrame(() => canvasRef.current?.scrollTo({ top: canvasRef.current.scrollHeight, behavior: "smooth" }));
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
 function removeBlock(id: string) {
 updateCur((bs) => bs.filter((b) => b.id !== id));
 setSelBlock(null); setSelOverlay(null);
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
 if (sectionUsesPropsImage(b.type)) {
 // These render props.image. Also drop any stale style.bgImage so a leftover full-bleed layer
 // (e.g. from an earlier attempt) can't linger behind — or reappear when the photo is removed.
 updateCur((bs) => bs.map((x) => {
 if (x.id !== b.id) return x;
 const style = { ...(x.style || {}) };
 delete style.bgImage;
 return { ...x, props: { ...x.props, image: url || "" }, style: Object.keys(style).length ? style : undefined };
 }));
 } else setBlockStyle(b.id, "bgImage", url);
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
 const overlayLabel = (o: Overlay) => o.kind === "text" ? (o.props?.text || "Text") : o.kind === "button" ? (o.props?.label || "Button") : o.kind === "image" ? "Image" : o.kind === "rect" ? "Rectangle" : o.kind === "circle" ? "Circle" : "Line";
 const OverlayIcon = (o: Overlay) => o.kind === "text" ? Type : o.kind === "button" ? MousePointerClick : o.kind === "image" ? ImageIcon : o.kind === "rect" ? Square : o.kind === "circle" ? Circle : Minus;
 // Add an element to the SELECTED section (fallback: the last section on the page), then select it.
 function addElement(kind: OverlayKind, extraProps?: Record<string, string>) {
 const targetId = selBlock && curBlocks.some((b) => b.id === selBlock) ? selBlock : curBlocks[curBlocks.length - 1]?.id;
 if (!targetId) { setRailTab("sections"); window.alert("Add a section first, then drop elements onto it."); return; }
 const o = makeOverlay(kind);
 if (extraProps) o.props = { ...(o.props || {}), ...extraProps };
 updateCur((bs) => bs.map((b) => (b.id === targetId ? { ...b, overlays: [...(b.overlays || []), o] } : b)));
 setSelBlock(targetId);
 setSelOverlay({ blockId: targetId, overlayId: o.id });
 }
 // Drag math (px → %) lives here because it needs the live section rect. Listeners close over the
 // current page state at drag-start — a drag is short-lived, so this stays correct without refs.
 const overlayEdit = {
 selectedId: selOverlay?.overlayId ?? null,
 editingId,
 onSelect: (blockId: string, overlayId: string) => { setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setEditingId(null); },
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
 const { xc, yc } = gatherSnap(sec, rect, overlayId);
 const thrX = (6 / rect.width) * 100, thrY = (6 / rect.height) * 100;
 setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setOvlDragging(true);
 el.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 let nx = Math.min(100, Math.max(0, ox + ((ev.clientX - sx) / rect.width) * 100));
 let ny = Math.min(100, Math.max(0, oy + ((ev.clientY - sy) / rect.height) * 100));
 // snap the element's left/centre/right (and top/centre/bottom) to the nearest guide
 const sX = snapAxis([nx, nx + ew / 2, nx + ew], xc, thrX);
 const sY = snapAxis([ny, ny + eh / 2, ny + eh], yc, thrY);
 nx = Math.min(100, Math.max(0, nx + sX.delta)); ny = Math.min(100, Math.max(0, ny + sY.delta));
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
 onResizeStart: (blockId: string, overlayId: string, handle: "nw" | "ne" | "sw" | "se" | "e" | "w", e: React.PointerEvent) => {
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
 const r1 = (n: number) => Math.round(n * 10) / 10;
 const { xc, yc } = gatherSnap(sec, rect, overlayId);
 const thrX = (6 / rect.width) * 100, thrY = (6 / rect.height) * 100;
 setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setOvlDragging(true);
 handleEl.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 const dx = ((ev.clientX - sx) / rect.width) * 100, dy = ((ev.clientY - sy) / rect.height) * 100;
 let x = startX, y = startY, w = startW, h = startH;
 if (right) w = Math.max(2, Math.min(100, startW + dx));
 if (left) { w = Math.max(2, Math.min(100, startW - dx)); x = Math.max(0, startX + (startW - w)); }
 if (bottom) h = Math.max(2, Math.min(100, startH + dy));
 if (top) { h = Math.max(2, Math.min(100, startH - dy)); y = Math.max(0, startY + (startH - h)); }
 // Snap the moving edge to a guide, adjusting the size (opposite edge stays put).
 let gv: number | null = null, gh: number | null = null;
 if (right) { const s = snapAxis([x + w], xc, thrX); if (s.guide != null) { w = Math.max(2, w + s.delta); gv = s.guide; } }
 else if (left) { const s = snapAxis([x], xc, thrX); if (s.guide != null) { x = Math.max(0, x + s.delta); w = Math.max(2, w - s.delta); gv = s.guide; } }
 if (bottom) { const s = snapAxis([y + h], yc, thrY); if (s.guide != null) { h = Math.max(2, h + s.delta); gh = s.guide; } }
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
 setSelBlock(blockId); setSelOverlay(null); setOvlDragging(true);
 grip.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 let nx = Math.min(100, Math.max(0, ox + ((ev.clientX - sx) / rect.width) * 100));
 let ny = Math.min(100, Math.max(0, oy + ((ev.clientY - sy) / rect.height) * 100));
 const sX = snapAxis([nx], cands, thrX), sY = snapAxis([ny], cands, thrY);
 nx = Math.min(100, Math.max(0, nx + sX.delta)); ny = Math.min(100, Math.max(0, ny + sY.delta));
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
 const el = (selOverlay ? c.querySelector(`[data-ovl="${selOverlay.overlayId}"]`) : c.querySelector(`.vya-b-${selBlock}`)) as HTMLElement | null;
 if (!el) { setAnchor(null); return; }
 const r = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
 const BAR = 46, GAP = 10;
 let top = r.top - GAP - BAR; // above the selection…
 if (top < cr.top + 6) top = cr.top + 6; // …unless it'd clip the canvas top, then pin near the top
 const left = Math.min(cr.right - 24, Math.max(cr.left + 24, r.left + r.width / 2));
 setAnchor({ top, left });
 };
 measure();
 canvas.addEventListener("scroll", measure, { passive: true });
 window.addEventListener("resize", measure);
 return () => { canvas.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
 }, [selBlock, selOverlay, blocks, shopBlocks, extraPages, activeSlug, device]);

 // ── Image upload + drag-and-drop (no more URL fields) ──
 async function uploadImage(file: File): Promise<string | null> {
 if (!file.type.startsWith("image/")) return null;
 const fd = new FormData(); fd.append("file", file);
 setUploading(true);
 try {
 const r = await fetch("/api/store/assets", { method: "POST", body: fd });
 if (!r.ok) return null;
 const d = await r.json().catch(() => null);
 return d?.url || null;
 } finally { setUploading(false); }
 }
 // Pick a file, upload it, and hand back the hosted URL (used by the toolbar "Upload" buttons).
 async function pickAndUpload(onUrl: (url: string) => void) {
 const inp = document.createElement("input");
 inp.type = "file"; inp.accept = "image/*";
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
 const deviceMax = device === "phone" ? "390px" : device === "tablet" ? "834px" : "100%";
 const pageList = [{ slug: "home", title: "Home", n: blocks.length }, { slug: "shop", title: "Shop", n: shopBlocks.length }, ...extraPages.map((p) => ({ slug: p.slug, title: p.title, n: p.blocks.length }))];
 const activeTitle = pageList.find((p) => p.slug === activeSlug)?.title || "Home";
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
 {/* Top bar */}
 <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-[#fbf9f5] px-3">
 <div className="flex items-center gap-2.5">
 <a href="/admin" title="Back to admin" className="grid h-7 w-7 place-items-center rounded-lg border border-black/10 text-stone-500 transition hover:bg-stone-100"><ChevronLeft size={16} /></a>
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
 {([["design", "Design", Palette], ["sections", "Sections", Layers], ["elements", "Elements", Shapes], ["text", "Text", Type], ["uploads", "Uploads", UploadIcon], ["assist", "VYA", Sparkles]] as const).map(([id, label, Icon]) => (
 <button key={id} type="button" onClick={() => { if (!selBlockObj && railTab === id && panelOpen) { setPanelOpen(false); } else { setRailTab(id); setPanelOpen(true); setSelBlock(null); setSelOverlay(null); } }} className={`flex w-[58px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition ${!selBlockObj && railTab === id && panelOpen ? "bg-[#5D0F17]/[0.08] text-[#5D0F17]" : "text-stone-500 hover:bg-stone-100"}`}>
 <Icon size={19} strokeWidth={1.8} />{label}
 </button>
 ))}
 </div>

 {/* Active panel — hidden when the side bar is collapsed */}
 {panelOpen && (
 <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
 {selBlockObj ? (
 // Select a section → edit ALL its content here (not just the inline text). This is what makes
 // list/URL fields — marquee names, gallery photos, a video link — actually editable.
 (() => {
 const def = blockDef(selBlockObj.type);
 const fields = def?.fields || [];
 const bp = selBlockObj.props || {};
 const inp = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 return (
 <div className="h-full overflow-y-auto px-4 py-4">
 <div className="mb-4 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Edit {def?.label || selBlockObj.type}</p>
 <button type="button" onClick={() => { setSelBlock(null); setSelOverlay(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 {selBlockObj.type === "collections" ? (
 <CollectionsEditor block={selBlockObj} onField={(key, value) => editField(selBlockObj.id, key, value)} pick={pickAndUpload} uploading={uploading} />
 ) : fields.length ? fields.map((f) => (
 <div key={f.key} className="mb-3.5">
 <label className="mb-1 block text-[12px] font-medium text-stone-600">{f.label}</label>
 {f.kind === "textarea" ? (
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
 ) : (
 <input value={bp[f.key] || ""} onChange={(e) => editField(selBlockObj.id, f.key, e.target.value)} className={inp} placeholder={def?.defaults?.[f.key] || ""} />
 )}
 </div>
 )) : <p className="text-[13px] leading-relaxed text-stone-400">This section has no text fields — its content comes from your products.</p>}

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
 <Sidekick docked />
 ) : railTab === "design" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 {/* Palettes */}
 <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Colour palette</p>
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
 <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Colours</p>
 <div className="space-y-1.5">
 {([["bg", "Background"], ["text", "Text"], ["accent", "Accent"]] as const).map(([key, label]) => (
 <div key={key} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">{label}</span>
 <ColorSwatch value={colors[key]} onChange={(v) => changeColor(key, v)} />
 </div>
 ))}
 </div>

 {/* Corners ("shapes") */}
 <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Corners</p>
 <div className="grid grid-cols-3 gap-2">
 {RADIUS_OPTIONS.map((r) => (
 <button key={r.id} type="button" onClick={() => changeRadius(r.id)} className={`flex flex-col items-center gap-2 rounded-lg border py-3 transition ${radius === r.id ? "border-[#5D0F17] bg-[#5D0F17]/[0.05] ring-1 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <span className="h-7 w-7 border-2 border-stone-500" style={{ borderRadius: RADIUS_PREVIEW[r.id] }} />
 <span className="text-[11px] font-medium text-stone-600">{r.name}</span>
 </button>
 ))}
 </div>

 {/* Fonts */}
 <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Fonts</p>
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

 {/* Footer — social links (shown as icons in the footer, site-wide) + a short about blurb */}
 <p className="mb-1 mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Footer & social links</p>
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Add your socials — they show as icons in the footer on every page. A short blurb sits beside them.</p>
 <div className="space-y-2">
 {([["instagram", "Instagram URL"], ["tiktok", "TikTok URL"], ["facebook", "Facebook URL"], ["youtube", "YouTube URL"], ["pinterest", "Pinterest URL"], ["email", "Contact email"]] as const).map(([key, label]) => (
 <input key={key} value={socials[key] || ""} onChange={(e) => { const next = { ...socials, [key]: e.target.value }; setSocials(next); pushDesign({ socials: next }); }} placeholder={label} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 ))}
 <textarea value={footerAbout} onChange={(e) => { setFooterAbout(e.target.value); pushDesign({ footerAbout: e.target.value }); }} rows={2} placeholder="A short line about your store (footer)" className="w-full resize-y rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] leading-relaxed text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 </div>

 {/* Custom header/footer links — add anything to the nav (an external link, a page, "Contact") */}
 <p className="mb-1 mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Header & footer links</p>
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Add your own links to the top nav and/or footer — a page, a policy, or an external URL.</p>
 <div className="space-y-2">
 {navLinks.map((l, i) => {
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
 <button type="button" onClick={() => { const next = [...navLinks, { label: "", href: "", place: "both" as const }]; setNavLinks(next); }} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/20 py-2 text-[12px] font-medium text-stone-500 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"><Plus size={13} /> Add a link</button>
 </div>

 <button type="button" onClick={() => setShowTemplates(true)} className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 py-2.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100"><LayoutTemplate size={13} /> Start from a full template</button>
 <p className="mt-2 text-center text-[11px] leading-snug text-stone-400">Change anything here, or switch to <button type="button" onClick={() => setRailTab("assist")} className="font-semibold text-[#5D0F17] underline">Assist</button> and just describe it.</p>
 </div>
 ) : railTab === "sections" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Add a section</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Full-width sections. Click one to drop it at the bottom of {activeTitle}.</p>
 <div className="grid grid-cols-2 gap-2">
 {BLOCK_TYPES.map((bt) => (
 <button key={bt.type} type="button" onClick={() => addSection(bt.type)} title={bt.description} className="group flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white text-left transition hover:-translate-y-px hover:border-[#5D0F17]/40 hover:shadow-[0_10px_26px_-14px_rgba(43,36,29,0.5)]">
 <div className="h-[68px] w-full border-b border-black/5 bg-gradient-to-b from-white to-stone-50"><SectionThumb type={bt.type} /></div>
 <span className="flex items-center gap-1 px-2.5 py-2">
 <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800">{bt.label}</span>
 <Plus size={12} className="shrink-0 text-stone-300 transition group-hover:text-[#5D0F17]" />
 </span>
 </button>
 ))}
 </div>
 <button type="button" onClick={() => setShowTemplates(true)} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 py-2.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100"><LayoutTemplate size={13} /> Start from a full template</button>
 </div>
 ) : railTab === "elements" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Drop onto {selBlock ? "the selected section" : "the last section"}, then drag it anywhere. It scales with the layout and stacks neatly on mobile.</p>
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Elements</p>
 <div className="mb-4 grid grid-cols-3 gap-2">
 {([["button", "Button", MousePointerClick], ["image", "Image", ImageIcon]] as const).map(([kind, label, Icon]) => (
 <button key={kind} type="button" onClick={() => addElement(kind)} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <Icon size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">{label}</span>
 </button>
 ))}
 </div>
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Shapes</p>
 <div className="grid grid-cols-3 gap-2">
 {([["rect", "Rectangle", Square], ["circle", "Circle", Circle], ["line", "Line", Minus]] as const).map(([kind, label, Icon]) => (
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
 <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Text styles</p>
 <div className="space-y-2">
 <button type="button" onClick={() => addElement("text", { text: "Add a heading", size: "xl", color: colors.text, font: fonts.heading })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[22px] font-bold leading-tight text-stone-800" style={{ fontFamily: ff(fonts.heading) }}>Add a heading</span></button>
 <button type="button" onClick={() => addElement("text", { text: "Add a subheading", size: "lg", color: colors.text, font: fonts.heading })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[16px] font-semibold text-stone-800" style={{ fontFamily: ff(fonts.heading) }}>Add a subheading</span></button>
 <button type="button" onClick={() => addElement("text", { text: "Add a little bit of body text", size: "sm", color: colors.text, font: fonts.body })} className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#5D0F17]/40"><span className="text-[13px] text-stone-600">Add a little bit of body text</span></button>
 </div>
 <p className="mt-4 text-[12px] leading-snug text-stone-400">Each drops a text box onto {selBlock ? "the selected section" : "the last section"} — then drag it anywhere and format it inline.</p>
 </div>
 ) : railTab === "uploads" ? (
 <div className="h-full overflow-y-auto px-4 py-4">
 <label className="mb-4 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#5D0F17] px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">{assetsBusy ? "Uploading…" : (<><UploadIcon size={14} /> Upload a photo</>)}<input type="file" accept="image/*" className="hidden" disabled={assetsBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadToLibrary(f); }} /></label>
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Your uploads</p>
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

 <div className="flex min-w-0 flex-1 flex-col items-center overflow-hidden p-5">
 <div className="mb-3 flex items-center gap-2 text-[12px] text-stone-500">
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" />
 Tell VYA what to build — or click any text on the page to edit it yourself
 </div>

 {loading ? (
 <div className="mt-24 text-[13px] text-stone-400">Loading your store…</div>
 ) : (
 <div className="flex min-h-0 w-full flex-1 justify-center">
 <div className="flex w-full flex-col transition-[max-width] duration-300" style={{ maxWidth: deviceMax }}>
 <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-24px_rgba(43,36,29,0.4)] ring-1 ring-black/10">
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
 <div ref={canvasRef} onDragOver={onCanvasDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDrag(false); }} onDrop={onCanvasDrop} className="relative min-h-0 flex-1 overflow-y-auto" style={{ background: colors.bg }}>
 {fileDrag && (
 <div className="pointer-events-none absolute inset-0 z-40 m-2 flex items-center justify-center rounded-lg border-2 border-dashed border-[#5D0F17] bg-[#5D0F17]/[0.06]">
 <span className="rounded-full bg-[#5D0F17] px-4 py-1.5 text-[12px] font-semibold text-white shadow">Drop a photo onto a section to set its background</span>
 </div>
 )}
 {customCss && <style dangerouslySetInnerHTML={{ __html: stripThemeBackgroundOverrides(customCss) }} />}
 {/* Persistent site chrome — the header + footer wrap every page (same as the live storefront). */}
 <div style={{ fontFamily: ff(fonts.body), color: colors.text }}>
 <StoreHeader storeName={storeName} logo={null} nav={headerChromeNav} colors={colors} headingFontFamily={ff(fonts.heading)} onNav={(item) => item.slug ? switchPage(item.slug) : item.href && window.open(item.href, "_blank")} search={<Search size={16} strokeWidth={1.8} />} />
 {curBlocks.length > 0 ? (
 <Blocks blocks={curBlocks} colors={colors} fonts={fonts} radius={radius} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={(id) => { setSelBlock(id); setSelOverlay(null); setPanelOpen(true); }} selectedId={selOverlay ? null : selBlock} edit onEditField={editField} reorder={canvasReorder} overlayEdit={overlayEdit} onContentDragStart={onHeroContentDragStart} onFaqOp={faqOp} faqDnd={faqDnd} />
 ) : activeSlug === "shop" ? null : (
 <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-8 py-20 text-center">
 <p className="text-[14px] text-stone-400" style={{ fontFamily: ff(fonts.body) }}>This page is empty.</p>
 <p className="text-[13px] text-stone-400">Add sections from the <button type="button" onClick={() => setRailTab("sections")} className="font-semibold text-[#5D0F17] underline">Sections</button> panel, or ask VYA to build it.</p>
 </div>
 )}
 {/* Shop page: the product grid auto-lists your live inventory (same as the storefront) — shown here so the page reads true. */}
 {activeSlug === "shop" && (
 <section className="mx-auto max-w-6xl px-6 py-16 sm:px-8">
 <p className="mb-8 text-center text-[10px] uppercase tracking-[0.28em] text-stone-400">Your products · auto-listed from live inventory</p>
 {products.length > 0 ? (
 <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
 {products.slice(0, 8).map((p, i) => (
 <div key={i}>
 <div className="aspect-[3/4] w-full bg-stone-100 bg-cover bg-center" style={{ backgroundImage: p.image ? `url("${p.image.replace(/"/g, "%22")}")` : undefined }} />
 <p className="mt-3 text-[12px] leading-snug" style={{ fontFamily: ff(fonts.body) }}>{p.title}</p>
 <p className="text-[12px] text-stone-500">{money(p.price, p.currency)}</p>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-center text-[13px] text-stone-400">Your products appear here once you have live listings.</p>
 )}
 </section>
 )}
 <StoreFooter storeName={storeName} logo={null} nav={footerChromeNav} tagline={settings?.tagline ?? null} colors={colors} headingFontFamily={ff(fonts.heading)} year={new Date().getFullYear()} socials={socials} footerAbout={footerAbout} newsletter={<FooterEmailPreview accent={colors.accent} />} onNav={(item) => item.slug ? switchPage(item.slug) : item.href && window.open(item.href, "_blank")} />
 </div>
 </div>
 </div>
 {/* Canva-style Pages strip — visual page tiles below the canvas (click to switch, + to add) */}
 <div className="mt-3 flex w-full items-end gap-3 overflow-x-auto px-1 pb-1">
 {pageList.map((p) => (
 <div key={p.slug} className="group/pt flex shrink-0 flex-col items-center gap-1.5">
 <button type="button" onClick={() => switchPage(p.slug)} title={p.title} className={`relative grid h-[68px] w-[52px] place-items-center overflow-hidden rounded-md border bg-white shadow-sm transition ${p.slug === activeSlug ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <div className="absolute inset-0 flex flex-col gap-1 p-1.5">
 <div className="h-1.5 w-3/4 rounded-full bg-stone-200" />
 <div className="h-1 w-full rounded-full bg-stone-100" />
 <div className="h-1 w-5/6 rounded-full bg-stone-100" />
 <div className="mt-auto h-3 w-full rounded-sm bg-stone-100" />
 </div>
 {p.slug !== "home" && p.slug !== "shop" && (
 <button type="button" onClick={(e) => { e.stopPropagation(); deletePage(p.slug); }} title="Delete page" className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-white text-stone-400 shadow ring-1 ring-black/10 hover:text-red-600 group-hover/pt:grid"><X size={10} /></button>
 )}
 </button>
 <span className={`max-w-[60px] truncate text-[10px] ${p.slug === activeSlug ? "font-semibold text-[#5D0F17]" : "text-stone-500"}`}>{p.n}. {p.title}</span>
 </div>
 ))}
 <div className="flex shrink-0 flex-col items-center gap-1.5">
 <button type="button" onClick={addPage} title="Add page" className="grid h-[68px] w-[52px] place-items-center rounded-md border border-dashed border-black/20 text-stone-400 transition hover:border-[#5D0F17] hover:text-[#5D0F17]"><Plus size={16} /></button>
 <span className="text-[10px] text-stone-400">Add page</span>
 </div>
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
 return (
 <div style={{ position: "fixed", top: anchor.top, left: anchor.left, transform: "translateX(-50%)", zIndex: 65 }} className="flex max-w-[92vw] items-center gap-2 overflow-x-auto rounded-xl border border-black/10 bg-white px-3 py-2 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]">
 <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 capitalize">{selOverlayObj.kind}</span>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {selOverlayObj.kind === "button" && (
 <>
 <input value={p.label || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { label: e.target.value })} placeholder="Label" className={`w-28 ${inp}`} />
 <input value={p.href || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { href: e.target.value })} placeholder="/shop or https://…" className={`w-40 ${inp}`} />
 {fontSel(p.font || "", (v) => patchOverlayProps(blockId, overlayId, { font: v }))}
 {swatch(p.bg || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { bg: v }), "Fill")}
 {swatch(p.color || "#ffffff", (v) => patchOverlayProps(blockId, overlayId, { color: v }), "Text colour")}
 </>
 )}
 {selOverlayObj.kind === "text" && (
 <>
 <input value={p.text || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { text: e.target.value })} placeholder="Text" className={`w-40 ${inp}`} />
 {fontSel(p.font || "", (v) => patchOverlayProps(blockId, overlayId, { font: v }))}
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => patchOverlayProps(blockId, overlayId, { bold: p.bold === "1" ? "" : "1" })} title="Bold" className={`w-7 py-1 text-[13px] font-bold transition ${p.bold === "1" ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>B</button>
 <button type="button" onClick={() => patchOverlayProps(blockId, overlayId, { italic: p.italic === "1" ? "" : "1" })} title="Italic" className={`w-7 py-1 font-serif text-[13px] italic transition ${p.italic === "1" ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>I</button>
 </div>
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 {(["sm", "md", "lg", "xl"] as const).map((s) => (
 <button key={s} type="button" onClick={() => patchOverlayProps(blockId, overlayId, { size: s })} className={`px-2 py-1 text-[11px] font-medium uppercase transition ${p.size === s || (!p.size && s === "md") ? "bg-[#5D0F17] text-white" : "text-stone-500 hover:bg-stone-100"}`}>{s}</button>
 ))}
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
 </>
 )}
 {selOverlayObj.kind === "line" && (
 <>
 {swatch(p.color || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { color: v }), "Colour")}
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Weight</span>
 <input type="range" min={1} max={30} value={Number(p.thickness ?? 2)} onChange={(e) => patchOverlayProps(blockId, overlayId, { thickness: e.target.value })} className="w-24 accent-[#5D0F17]" />
 </div>
 </>
 )}
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {/* Align within the section */}
 <button type="button" onClick={() => alignOverlay("left")} title="Align left" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignStartVertical size={14} /></button>
 <button type="button" onClick={() => alignOverlay("hcenter")} title="Align centre" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignCenterVertical size={14} /></button>
 <button type="button" onClick={() => alignOverlay("right")} title="Align right" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignEndVertical size={14} /></button>
 <button type="button" onClick={() => alignOverlay("top")} title="Align top" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignStartHorizontal size={14} /></button>
 <button type="button" onClick={() => alignOverlay("vmiddle")} title="Align middle" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignCenterHorizontal size={14} /></button>
 <button type="button" onClick={() => alignOverlay("bottom")} title="Align bottom" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><AlignEndHorizontal size={14} /></button>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => reorderOverlay(blockId, overlayId, "front")} title="Bring to front" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><BringToFront size={14} /></button>
 <button type="button" onClick={() => reorderOverlay(blockId, overlayId, "back")} title="Send to back" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><SendToBack size={14} /></button>
 <button type="button" onClick={() => duplicateOverlay(blockId, overlayId)} title="Duplicate (⌘D)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><Copy size={14} /></button>
 <button type="button" onClick={() => removeOverlay(blockId, overlayId)} title="Delete element (⌫)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </div>
 );
 })()}

 {/* Selected section — contextual toolbar floating just above it (background incl. photo, text, align, spacing) */}
 {selBlockObj && anchor && !ovlDragging && (() => {
 const b = selBlockObj, st = b.style || {};
 const bid = b.id;
 const bgUrl = sectionBgUrl(b);
 const chip = (on: boolean) => `rounded-md px-2 py-1 text-[11px] font-medium transition ${on ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`;
 return (
 <div style={{ position: "fixed", top: anchor.top, left: anchor.left, transform: "translateX(-50%)", zIndex: 65 }} className="flex max-w-[94vw] items-center gap-2 overflow-x-auto rounded-xl border border-black/10 bg-white px-3 py-2 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]">
 <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{b.type.replace(/[-_]/g, " ")}</span>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {/* Background */}
 <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone-400">Bg</span>
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => { setBlockStyle(bid, "bg", undefined); setBlockStyle(bid, "bgImage", undefined); }} className={chip(!st.bg && !st.bgImage)}>Page</button>
 <button type="button" onClick={() => setBlockStyle(bid, "bg", "accent")} className={chip(st.bg === "accent")}>Accent</button>
 <button type="button" onClick={() => setBlockStyle(bid, "bg", "dark")} className={chip(st.bg === "dark")}>Dark</button>
 </div>
 <ColorDot value={/^#/.test(st.bg || "") ? st.bg! : "#ffffff"} onChange={(v) => setBlockStyle(bid, "bg", v)} title="Custom colour" />
 {/* Background photo — upload or drag-drop (no URLs) */}
 <div className="flex shrink-0 items-center gap-1.5">
 {bgUrl
 ? <span className="h-7 w-7 rounded-md bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${bgUrl.replace(/"/g, "%22")}")` }} />
 : <span className="grid h-7 w-7 place-items-center rounded-md bg-stone-100 text-stone-400"><ImageIcon size={13} /></span>}
 <button type="button" disabled={uploading} onClick={() => pickAndUpload((url) => setSectionBgImage(b, url))} className="rounded-md bg-[#5D0F17] px-3 py-1 text-[12px] font-medium text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{uploading ? "Uploading…" : bgUrl ? "Replace photo" : "Photo"}</button>
 {bgUrl && <button type="button" onClick={() => setSectionBgImage(b, undefined)} title="Remove photo" className="grid h-6 w-6 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600"><X size={13} /></button>}
 </div>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {/* Text colour */}
 <ColorDot value={st.textColor || "#111111"} onChange={(v) => setBlockStyle(bid, "textColor", v)} title="Text colour" />
 {/* Alignment */}
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 {(["left", "center", "right"] as const).map((a) => (
 <button key={a} type="button" onClick={() => setBlockStyle(bid, "align", st.align === a ? undefined : a)} className={chip(st.align === a)}>{a[0].toUpperCase()}</button>
 ))}
 </div>
 {/* Spacing */}
 <div className="flex shrink-0 items-center gap-1">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Space</span>
 <div className="flex overflow-hidden rounded-md border border-black/10">
 {(["sm", "md", "lg", "xl"] as const).map((s) => (
 <button key={s} type="button" onClick={() => setBlockStyle(bid, "space", st.space === s ? undefined : s)} className={chip(st.space === s)}>{s.toUpperCase()}</button>
 ))}
 </div>
 </div>
 {b.type === "hero" && b.props?.image && (b.props?.cx || b.props?.cy) && (
 <button type="button" onClick={() => updateCur((bs) => bs.map((x) => (x.id === bid ? { ...x, props: { ...(x.props || {}), cx: "", cy: "" } } : x)))} title="Recenter the content" className="shrink-0 rounded-md border border-black/10 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-stone-100">Recenter</button>
 )}
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {(() => { const idx = curBlocks.findIndex((x) => x.id === bid); return (
 <>
 <button type="button" disabled={idx <= 0} onClick={() => moveBlock(bid, "up")} title="Move section up" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-25"><ChevronUp size={15} /></button>
 <button type="button" disabled={idx < 0 || idx >= curBlocks.length - 1} onClick={() => moveBlock(bid, "down")} title="Move section down" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-25"><ChevronDown size={15} /></button>
 </>
 ); })()}
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => duplicateBlock(bid)} title="Duplicate section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"><Copy size={14} /></button>
 <button type="button" onClick={() => removeBlock(bid)} title="Delete section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </div>
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
 <h2 className="text-[17px] font-semibold text-stone-900">Pick a vibe</h2>
 <p className="mt-0.5 text-[12px] text-stone-500">A full starting design — palette, type, and a laid-out home page. Change anything after, or ask VYA.</p>
 </div>
 <button type="button" onClick={() => setShowTemplates(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"><X size={18} /></button>
 </div>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
 {STOREFRONT_TEMPLATES.map((t) => (
 <button key={t.id} type="button" onClick={() => applyTemplate(t)} className="group overflow-hidden rounded-xl border border-stone-200 text-left transition hover:border-[#5D0F17] hover:shadow-md">
 <div className="flex h-28 flex-col justify-center gap-1.5 px-4" style={{ background: t.colors.bg }}>
 <span className="text-[19px] leading-none" style={{ fontFamily: ff(t.fonts.heading), color: t.colors.text }}>{t.name}</span>
 <span className="text-[11px] opacity-70" style={{ fontFamily: ff(t.fonts.body), color: t.colors.text }}>Curated vintage, one of one.</span>
 <div className="mt-1 flex gap-1">
 <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: t.colors.bg }} />
 <span className="h-3 w-3 rounded-full" style={{ background: t.colors.text }} />
 <span className="h-3 w-3 rounded-full" style={{ background: t.colors.accent }} />
 </div>
 </div>
 <div className="border-t border-stone-100 p-3">
 <p className="text-[13px] font-semibold text-stone-900">{t.name}</p>
 <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-500">{t.description}</p>
 <span className="mt-2 inline-block text-[11px] font-semibold text-[#5D0F17] opacity-0 transition group-hover:opacity-100">Use this vibe →</span>
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
