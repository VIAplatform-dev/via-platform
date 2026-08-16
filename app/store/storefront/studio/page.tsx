"use client";

// Chat-first storefront studio (tracks 1–3).
// The builder: describe it to VYA on the left; on the right, a LIVE, EDITABLE preview of the
// store. Text is click-to-edit inline, sections drag to reorder, and a page dropdown switches
// which page you're editing — all on the same canvas the assistant edits. Reuses the existing
// Blocks renderer (edit mode) + the design API. Every change autosaves; VYA's changes reload it.

import { useCallback, useEffect, useRef, useState } from "react";
import Sidekick from "../../Sidekick";
import Blocks from "@/app/s/Blocks";
import { makeBlock, makeOverlay, newBlockId, pageSlugify, BLOCK_TYPES, type Block, type BlockType, type BlockStyle, type Overlay, type OverlayKind, type StorePage } from "@/app/lib/storefront-blocks";
import { STOREFRONT_TEMPLATES, templateBlocks, STOREFRONT_PALETTES, RADIUS_OPTIONS, HEADING_FONTS, BODY_FONTS, SERIF_FONTS, ALL_STOREFRONT_FONTS, storefrontFontsHref, type StorefrontTemplate } from "@/app/lib/storefront-templates";
import { ChevronLeft, Monitor, Tablet, Smartphone, ExternalLink, ChevronDown, Plus, X, Check, LayoutTemplate, Palette, Layers, Sparkles, Type, Image as ImageIcon, MousePointerClick, Trash2, Copy } from "lucide-react";

type Colors = { bg: string; text: string; accent: string };
type Fonts = { heading: string; body: string };
type Radius = "sharp" | "soft" | "round";
type RailTab = "design" | "add" | "assist";
type Product = { title: string; price: number | null; currency: string; image: string };
type Device = "desktop" | "tablet" | "phone";
type Settings = { handle: string; enabled: boolean; tagline: string | null; accentColor: string | null; heroImage: string | null; about: string | null };

const ff = (name?: string) => (name ? `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);
const money = (c: number | null, cur: string) => (c == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(c));

// One-click font pairings for the Design panel (heading × body). Click sets both at once — the
// dropdowns below stay for anyone who wants to mix their own.
const FONT_PAIRS: { name: string; heading: string; body: string }[] = [
 { name: "Editorial", heading: "Playfair Display", body: "Inter" },
 { name: "Modern", heading: "Outfit", body: "Inter" },
 { name: "Literary", heading: "Newsreader", body: "Newsreader" },
 { name: "Bold", heading: "Archivo", body: "Inter" },
 { name: "Romantic", heading: "Cormorant Garamond", body: "Poppins" },
 { name: "Clean", heading: "Space Grotesk", body: "Work Sans" },
];
// The corner-preview curve for each shape option, so the segmented control shows what it does.
const RADIUS_PREVIEW: Record<Radius, string> = { sharp: "0px", soft: "6px", round: "12px" };

export default function StorefrontStudio() {
 const [settings, setSettings] = useState<Settings | null>(null);
 const [storeName, setStoreName] = useState("Your store");
 const [colors, setColors] = useState<Colors>({ bg: "#FFFDF8", text: "#1a1a1a", accent: "#5D0F17" });
 const [fonts, setFonts] = useState<Fonts>({ heading: "Playfair Display", body: "Inter" });
 const [radius, setRadius] = useState<Radius>("sharp");
 const [railTab, setRailTab] = useState<RailTab>("design");
 const [products, setProducts] = useState<Product[]>([]);
 const [blocks, setBlocks] = useState<Block[]>([]);
 const [shopBlocks, setShopBlocks] = useState<Block[]>([]);
 const [extraPages, setExtraPages] = useState<StorePage[]>([]);
 const [customCss, setCustomCss] = useState("");
 const [activeSlug, setActiveSlug] = useState("home");
 const [selBlock, setSelBlock] = useState<string | null>(null);
 const [selOverlay, setSelOverlay] = useState<{ blockId: string; overlayId: string } | null>(null);
 const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null); // where the floating toolbar sits (above the selection)
 const [ovlDragging, setOvlDragging] = useState(false); // hide the toolbar while dragging an element
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
 const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 const loadDesign = useCallback(async () => {
 const r = await fetch("/api/store/storefront/design").catch(() => null);
 if (!r || !r.ok) return;
 const d = await r.json();
 if (d.colors) setColors(d.colors);
 if (d.fonts) setFonts(d.fonts);
 if (d.radius === "sharp" || d.radius === "soft" || d.radius === "round") setRadius(d.radius);
 setProducts(d.products || []);
 setBlocks(d.blocks || []);
 setShopBlocks(d.shopBlocks || []);
 setExtraPages(d.extraPages || []);
 setCustomCss(d.customCss || "");
 }, []);

 useEffect(() => {
 (async () => {
 const [sf] = await Promise.all([
 fetch("/api/store/storefront").then((r) => (r.ok ? r.json() : null)).catch(() => null),
 loadDesign(),
 ]);
 if (sf?.settings) setSettings(sf.settings as Settings);
 if (sf?.store?.name) setStoreName(sf.store.name as string);
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
 function updateCur(fn: (bs: Block[]) => Block[]) {
 if (activeSlug === "home") setBlocks(fn);
 else if (activeSlug === "shop") setShopBlocks(fn);
 else setExtraPages((ps) => ps.map((p) => (p.slug === activeSlug ? { ...p, blocks: fn(p.blocks) } : p)));
 }
 function editField(id: string, key: string, value: string) {
 updateCur((bs) => bs.map((b) => (b.id === id ? { ...b, props: { ...(b.props || {}), [key]: value } } : b)));
 }
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
 const pushDesign = useCallback((patch: { colors?: Colors; fonts?: Fonts; radius?: Radius }) => {
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
 // Add an element to the SELECTED section (fallback: the last section on the page), then select it.
 function addElement(kind: OverlayKind) {
 const targetId = selBlock && curBlocks.some((b) => b.id === selBlock) ? selBlock : curBlocks[curBlocks.length - 1]?.id;
 if (!targetId) { setRailTab("add"); window.alert("Add a section first, then drop elements onto it."); return; }
 const o = makeOverlay(kind);
 updateCur((bs) => bs.map((b) => (b.id === targetId ? { ...b, overlays: [...(b.overlays || []), o] } : b)));
 setSelBlock(targetId);
 setSelOverlay({ blockId: targetId, overlayId: o.id });
 }
 // Drag math (px → %) lives here because it needs the live section rect. Listeners close over the
 // current page state at drag-start — a drag is short-lived, so this stays correct without refs.
 const overlayEdit = {
 selectedId: selOverlay?.overlayId ?? null,
 onSelect: (blockId: string, overlayId: string) => { setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); },
 onDragStart: (blockId: string, overlayId: string, e: React.PointerEvent) => {
 const el = e.currentTarget as HTMLElement;
 const sec = el.closest(".vya-sec") as HTMLElement | null;
 if (!sec) return;
 const rect = sec.getBoundingClientRect();
 if (!rect.width || !rect.height) return;
 const cur = curBlocks.find((b) => b.id === blockId)?.overlays?.find((o) => o.id === overlayId);
 const ox = cur?.x ?? 0, oy = cur?.y ?? 0, sx = e.clientX, sy = e.clientY;
 setSelBlock(blockId); setSelOverlay({ blockId, overlayId }); setOvlDragging(true);
 el.setPointerCapture?.(e.pointerId);
 const move = (ev: PointerEvent) => {
 const nx = Math.min(100, Math.max(0, ox + ((ev.clientX - sx) / rect.width) * 100));
 const ny = Math.min(100, Math.max(0, oy + ((ev.clientY - sy) / rect.height) * 100));
 patchOverlay(blockId, overlayId, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
 };
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setOvlDragging(false); };
 window.addEventListener("pointermove", move);
 window.addEventListener("pointerup", up);
 },
 };
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
 <div className="flex w-[380px] max-w-[42vw] shrink-0 flex-col overflow-hidden border-r border-black/10 bg-[#fbf9f5]">
 {/* Tab strip — direct-manipulation panels, with the AI assistant as one tab (not the whole side) */}
 <div className="flex shrink-0 gap-1 border-b border-black/10 p-1.5">
 {([["design", "Design", Palette], ["add", "Add section", Layers], ["assist", "Assist", Sparkles]] as const).map(([id, label, Icon]) => (
 <button key={id} type="button" onClick={() => setRailTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition ${railTab === id ? "bg-[#5D0F17] text-white shadow-sm" : "text-stone-600 hover:bg-stone-100"}`}>
 <Icon size={14} strokeWidth={2} /> <span className="hidden md:inline">{label}</span>
 </button>
 ))}
 </div>

 {/* Assist keeps the full-height chat; Design & Add are scrollable control panels */}
 <div className="min-h-0 flex-1 overflow-hidden">
 {railTab === "assist" ? (
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
 <label key={key} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md ring-1 ring-black/15" style={{ background: colors[key] }}>
 <input type="color" value={colors[key]} onChange={(e) => changeColor(key, e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
 </span>
 <span className="flex-1 text-[13px] text-stone-700">{label}</span>
 <span className="font-mono text-[11px] uppercase text-stone-400">{colors[key]}</span>
 </label>
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

 <button type="button" onClick={() => setShowTemplates(true)} className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 py-2.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100"><LayoutTemplate size={13} /> Start from a full template</button>
 <p className="mt-2 text-center text-[11px] leading-snug text-stone-400">Change anything here, or switch to <button type="button" onClick={() => setRailTab("assist")} className="font-semibold text-[#5D0F17] underline">Assist</button> and just describe it.</p>
 </div>
 ) : (
 <div className="h-full overflow-y-auto px-4 py-4">
 {/* Free-form elements — drop onto a section, then drag anywhere */}
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Elements</p>
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">Drop onto {selBlock ? "the selected section" : "the last section"}, then drag it anywhere. It scales with the layout and stacks neatly on mobile.</p>
 <div className="mb-6 grid grid-cols-3 gap-2">
 {([["button", "Button", MousePointerClick], ["text", "Text", Type], ["image", "Image", ImageIcon]] as const).map(([kind, label, Icon]) => (
 <button key={kind} type="button" onClick={() => addElement(kind)} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03] hover:text-[#5D0F17]">
 <Icon size={17} strokeWidth={1.8} />
 <span className="text-[11px] font-medium">{label}</span>
 </button>
 ))}
 </div>

 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Add to {activeTitle}</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Full-width sections. Click one to drop it at the bottom of the page.</p>
 <div className="space-y-1.5">
 {BLOCK_TYPES.map((bt) => (
 <button key={bt.type} type="button" onClick={() => addSection(bt.type)} className="group flex w-full items-start gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-left transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.03]">
 <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-500 group-hover:bg-[#5D0F17] group-hover:text-white"><Plus size={13} /></span>
 <span className="min-w-0">
 <span className="block text-[13px] font-semibold capitalize text-stone-800">{bt.label}</span>
 <span className="block text-[11px] leading-snug text-stone-400">{bt.description}</span>
 </span>
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
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
 <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setDdOpen(false)} />
 <div className="absolute left-0 top-8 z-20 w-52 rounded-xl border border-black/10 bg-white p-1 shadow-[0_18px_44px_-12px_rgba(43,36,29,0.45)]">
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
 <div className="ml-auto flex h-5 items-center rounded-md bg-white px-2 text-[11px] text-stone-400">vyaplatform.com/s/<span className="text-stone-600">{handle || "your-store"}</span>{activeSlug !== "home" ? `/${activeSlug}` : ""}</div>
 </div>

 {/* editable canvas */}
 <div ref={canvasRef} onDragOver={onCanvasDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDrag(false); }} onDrop={onCanvasDrop} className="relative min-h-0 flex-1 overflow-y-auto" style={{ background: colors.bg }}>
 {fileDrag && (
 <div className="pointer-events-none absolute inset-0 z-40 m-2 flex items-center justify-center rounded-lg border-2 border-dashed border-[#5D0F17] bg-[#5D0F17]/[0.06]">
 <span className="rounded-full bg-[#5D0F17] px-4 py-1.5 text-[12px] font-semibold text-white shadow">Drop a photo onto a section to set its background</span>
 </div>
 )}
 {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
 {curBlocks.length > 0 ? (
 <Blocks blocks={curBlocks} colors={colors} fonts={fonts} radius={radius} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={(id) => { setSelBlock(id); setSelOverlay(null); }} selectedId={selBlock} edit onEditField={editField} reorder={canvasReorder} overlayEdit={overlayEdit} />
 ) : (
 <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 px-8 text-center">
 <p className="text-[14px] text-stone-400" style={{ fontFamily: ff(fonts.body) }}>This page is empty.</p>
 <p className="text-[13px] text-stone-400">Ask VYA to build it — “design my {activeTitle.toLowerCase()} page” — and it appears here.</p>
 </div>
 )}
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
 <span className="mx-0.5 h-4 w-px bg-white/20" />
 <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-md hover:bg-white/15" title="Text colour">
 <span className="h-4 w-4 rounded-full border border-white/60" style={{ background: colors.accent }} />
 <input type="color" defaultValue={colors.accent} onChange={(e) => fmtCmd("foreColor", e.target.value)} className="absolute h-0 w-0 opacity-0" />
 </label>
 </div>
 )}

 {/* Selected free-form element — contextual toolbar, floating just above it (Canva-style) */}
 {selOverlayObj && selOverlay && anchor && !ovlDragging && (() => {
 const { blockId, overlayId } = selOverlay;
 const p = selOverlayObj.props || {};
 const swatch = (val: string, onChange: (v: string) => void, title: string) => (
 <label title={title} className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-md ring-1 ring-black/10" style={{ background: val }}>
 <input type="color" value={val} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
 </label>
 );
 const inp = "rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 return (
 <div style={{ position: "fixed", top: anchor.top, left: anchor.left, transform: "translateX(-50%)", zIndex: 65 }} className="flex max-w-[92vw] items-center gap-2 overflow-x-auto rounded-xl border border-black/10 bg-white px-3 py-2 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]">
 <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 capitalize">{selOverlayObj.kind}</span>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 {selOverlayObj.kind === "button" && (
 <>
 <input value={p.label || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { label: e.target.value })} placeholder="Label" className={`w-28 ${inp}`} />
 <input value={p.href || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { href: e.target.value })} placeholder="/shop or https://…" className={`w-40 ${inp}`} />
 {swatch(p.bg || "#1a1a1a", (v) => patchOverlayProps(blockId, overlayId, { bg: v }), "Fill")}
 {swatch(p.color || "#ffffff", (v) => patchOverlayProps(blockId, overlayId, { color: v }), "Text colour")}
 </>
 )}
 {selOverlayObj.kind === "text" && (
 <>
 <input value={p.text || ""} onChange={(e) => patchOverlayProps(blockId, overlayId, { text: e.target.value })} placeholder="Text" className={`w-44 ${inp}`} />
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
 <div className="flex shrink-0 items-center gap-1.5">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Size</span>
 <input type="range" min={8} max={100} value={selOverlayObj.w ?? 28} onChange={(e) => patchOverlay(blockId, overlayId, { w: Number(e.target.value) })} className="w-24 accent-[#5D0F17]" />
 </div>
 </>
 )}
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => removeOverlay(blockId, overlayId)} title="Delete element" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </div>
 );
 })()}

 {/* Selected section — contextual toolbar floating just above it (background incl. photo, text, align, spacing) */}
 {selBlockObj && anchor && (() => {
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
 <label title="Custom colour" className="relative grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-black/10" style={{ background: /^#/.test(st.bg || "") ? st.bg : "#ffffff" }}>
 <input type="color" value={/^#/.test(st.bg || "") ? st.bg! : "#ffffff"} onChange={(e) => setBlockStyle(bid, "bg", e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
 </label>
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
 <label title="Text colour" className="relative grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-black/10" style={{ background: st.textColor || "#111111" }}>
 <input type="color" value={st.textColor || "#111111"} onChange={(e) => setBlockStyle(bid, "textColor", e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
 </label>
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
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => duplicateBlock(bid)} title="Duplicate section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"><Copy size={14} /></button>
 <button type="button" onClick={() => removeBlock(bid)} title="Delete section" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
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
