"use client";

import { useEffect, useState, useRef } from "react";
import Blocks from "@/app/s/Blocks";
import Sidekick from "../Sidekick";
import { useStoreBase } from "../nav-base";
import { RotateCw, Globe, ChevronDown, ChevronLeft, ChevronRight, Home as HomeIcon, Copy, Check, ExternalLink, SlidersHorizontal, GripVertical, ChevronUp, X as XIcon, Plus, Monitor, Tablet, Smartphone, AlignLeft, AlignCenter, AlignRight, Palette, Sparkles, Undo2, Redo2, Trash2, Layers, Shapes, Type, Upload as UploadIcon, Image as ImageIcon, Minus, MousePointerClick } from "lucide-react";
import { makeBlock, pageSlugify, type Block, type BlockDef, type BlockType, type BlockStyle, type BlockScale, type StorePage } from "@/app/lib/storefront-blocks";
import { parseDesign, buildDesignCss, type DesignSettings, type Radius } from "@/app/lib/captured-design";
import { STOREFRONT_PALETTES, RADIUS_OPTIONS } from "@/app/lib/storefront-templates";
import { ColorSwatch, ColorDot } from "@/app/store/storefront/ColorPicker";
import SectionThumb from "@/app/store/storefront/SectionThumb";

type Template = { id: string; name: string; description: string; colors: { bg: string; text: string; accent: string }; fonts: { heading: string; body: string }; heroStyle: string };
type Colors = { bg: string; text: string; accent: string };
type Fonts = { heading: string; body: string };
type Product = { title: string; price: number | null; currency: string; image: string };
type DnsRecord = { type: string; name: string; value: string };
type DomainStatus = { domain: string; verified: boolean; misconfigured: boolean; records: DnsRecord[]; verification: { type: string; domain: string; value: string }[] };
// One editable field in a selected captured-page section (reported from the preview iframe).
type PanelField =
 | { kind: "text"; eid: number; value: string; tag: string }
 | { kind: "image"; id: number; src: string }
 | { kind: "link"; id: number; href: string; label: string };

const SERIFS = new Set(["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces", "Source Serif 4"]);
const ff = (name: string) => `'${name}', ${SERIFS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;
// Same curated pairings + corner previews as the studio, so the captured Design tab is 1:1.
const FONT_PAIRS: { name: string; heading: string; body: string }[] = [
 { name: "Editorial", heading: "Playfair Display", body: "Inter" },
 { name: "High Contrast", heading: "Bodoni Moda", body: "DM Sans" },
 { name: "Contemporary", heading: "Bricolage Grotesque", body: "Inter" },
 { name: "Warm Serif", heading: "Fraunces", body: "Source Serif 4" },
 { name: "Literary", heading: "Newsreader", body: "Newsreader" },
 { name: "Romantic", heading: "Cormorant Garamond", body: "Poppins" },
 { name: "Modern", heading: "Space Grotesk", body: "Inter" },
];
const RADIUS_PREVIEW: Record<string, string> = { sharp: "0", soft: "6px", round: "9999px" };
const money = (c: number | null, cur: string) => (c == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(c / 100));

export default function StorefrontEditor() {
 const base = useStoreBase();
 const [loading, setLoading] = useState(true);
 const [tab, setTab] = useState<"design" | "sections" | "assets" | "details" | "domain">("sections");
 const [storeName, setStoreName] = useState("Your Store");
 const [capTab, setCapTab] = useState<"design" | "sections" | "elements" | "text" | "uploads" | "assist">("design"); // captured-mode left rail — 1:1 with the from-scratch studio
 const [capPanelOpen, setCapPanelOpen] = useState(true); // collapse the side panel (Canva-style), keeping the icon rail
 const [showControls, setShowControls] = useState(true); // block-mode: the Customize slide-over
 const [copiedUrl, setCopiedUrl] = useState(false);
 const liveUrl = (sub: string) => `${handle || "your-store"}.getvya.ai${sub}`;
 const [selBlock, setSelBlock] = useState<string | null>(null); // block-mode: section selected from the preview
 // Click a section in the live preview → open its editor in the Customize panel.
 function selectBlock(id: string) {
 setSelBlock(id);
 setTab("sections");
 setShowControls(true);
 setTimeout(() => document.getElementById(`ed-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
 }

 // Design
 const [templates, setTemplates] = useState<Template[]>([]);
 const [headingFonts, setHeadingFonts] = useState<string[]>([]);
 const [bodyFonts, setBodyFonts] = useState<string[]>([]);
 const [template, setTemplate] = useState<string | null>(null);
 const [colors, setColors] = useState<Colors>({ bg: "#FFFDF8", text: "#1a1a1a", accent: "#5D0F17" });
 const [fonts, setFonts] = useState<Fonts>({ heading: "Playfair Display", body: "Inter" });
 const [products, setProducts] = useState<Product[]>([]);
 const [blocks, setBlocks] = useState<Block[]>([]);
 const [extraPages, setExtraPages] = useState<StorePage[]>([]);
 const [activeSlug, setActiveSlug] = useState("home"); // which page the Sections tab edits ("home", "shop", or an extra page slug)
 const [shopBlocks, setShopBlocks] = useState<Block[]>([]); // editable intro content above the Shop grid
 const [blockTypes, setBlockTypes] = useState<BlockDef[]>([]);
 const [dragIdx, setDragIdx] = useState<number | null>(null);
 const [canvasOver, setCanvasOver] = useState<number | null>(null); // canvas drag: which section shows the drop line
 const canvasRef = useRef<HTMLDivElement>(null); // the live preview, for the text-selection toolbar
 const [fmtBar, setFmtBar] = useState<{ top: number; left: number } | null>(null);
 const [device, setDevice] = useState<"desktop" | "tablet" | "phone">("desktop"); // Framer-style responsive preview
 const deviceW = device === "phone" ? "24rem" : device === "tablet" ? "40rem" : "100%";

 // Details
 const [handle, setHandle] = useState("");
 const [enabled, setEnabled] = useState(false);
 const [delBusy, setDelBusy] = useState(false);
 const [tagline, setTagline] = useState("");
 const [heroImage, setHeroImage] = useState("");
 const [about, setAbout] = useState("");

 // Domain
 const [dom, setDom] = useState<{ configured: boolean; domain: string | null; status: DomainStatus | null }>({ configured: false, domain: null, status: null });
 const [domInput, setDomInput] = useState("");
 const [domBusy, setDomBusy] = useState(false);
 const [domErr, setDomErr] = useState<string | null>(null);
 // Buy a domain through VYA (Vercel registrar)
 const [dsearch, setDsearch] = useState("");
 const [dres, setDres] = useState<{ domain: string; available: boolean; priceCents: number | null } | null>(null);
 const [dsBusy, setDsBusy] = useState(false);
 const [showBuy, setShowBuy] = useState(false);
 const [buyForm, setBuyForm] = useState({ firstName: "", lastName: "", email: "", phone: "", address1: "", city: "", state: "", zip: "", country: "US" });
 const [buyBusy, setBuyBusy] = useState(false);
 const [buyMsg, setBuyMsg] = useState<string | null>(null);

 // Media library
 const [assets, setAssets] = useState<{ url: string }[]>([]);
 const [assetBusy, setAssetBusy] = useState(false);
 const [dragHero, setDragHero] = useState(false);

 const [busy, setBusy] = useState(false);
 const [saved, setSaved] = useState(false);
 const [err, setErr] = useState<string | null>(null);

 // Captured site (a seller who brought their own site over): they edit THAT, not blocks.
 const [captured, setCaptured] = useState<{ count: number; url: string | null; slug: string | null; origin: string | null; pages: string[] } | null>(null);
 const [isAdmin, setIsAdmin] = useState(false); // owner-only: the reset/wipe action
 const [isPlatformAdmin, setIsPlatformAdmin] = useState(false); // platform admin login only: delete storefront
 const [selPath, setSelPath] = useState("/");
 const [syncBusy, setSyncBusy] = useState(false);
 const [syncMsg, setSyncMsg] = useState<string | null>(null);
 const [previewKey, setPreviewKey] = useState(0); // bump to reload the preview iframe
 const [genBusy, setGenBusy] = useState(false); // "build my storefront with VYA"
 const [genErr, setGenErr] = useState<string | null>(null);

 // Section edit panel: click a section in the preview → edit its fields here (no hunting on canvas).
 const [panel, setPanel] = useState<{ index: number; fields: PanelField[] } | null>(null);
 const [panelDirty, setPanelDirty] = useState(false);
 const [panelSaving, setPanelSaving] = useState(false);
 const editIframe = useRef<HTMLIFrameElement>(null);
 // Click an image on the captured site → select it here, then swap it from the asset library (Canva-style).
 const [selImg, setSelImg] = useState<{ id: number; src: string } | null>(null);
 const [assetsBusy, setAssetsBusy] = useState(false);
 const [capStatus, setCapStatus] = useState<"saved" | "unsaved" | "saving">("saved"); // captured-editor save state (from the iframe)
 const [secStyle, setSecStyle] = useState<{ bg?: string; color?: string; align?: string }>({}); // selected captured section's style
 const [secRect, setSecRect] = useState<{ top: number; cx: number } | null>(null); // selected section position (iframe coords) → floating bar
 const capturedRef = useRef<typeof captured>(null);
 capturedRef.current = captured; // live ref for the (deps:[]) postMessage handler

 // Global design for a captured site: accent + fonts, layered over the theme via custom CSS.
 const [design, setDesign] = useState<DesignSettings>({ accent: null, heading: null, body: null, bg: null, text: null, radius: null });
 const [designRest, setDesignRest] = useState(""); // any other custom CSS (e.g. VYA-assistant-added) to preserve
 const [designLoaded, setDesignLoaded] = useState(false); // guard: don't auto-save until the server design is in
 const [customCss, setCustomCss] = useState(""); // block-mode: raw custom CSS (AI- or hand-written), layered over the theme
 const [cssBusy, setCssBusy] = useState(false);
 const [cssSaved, setCssSaved] = useState(false);
 const [designSaved, setDesignSaved] = useState(false);

 useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const [meR, sfR, dsR, domR, asR, capR, cssR] = await Promise.all([
 fetch("/api/store/me"),
 fetch("/api/store/storefront"),
 fetch("/api/store/storefront/design"),
 fetch("/api/store/domain"),
 fetch("/api/store/assets"),
 fetch("/api/store/capture"),
 fetch("/api/store/capture/css"),
 ]);
 if (cancelled) return;
 if (capR.ok) { const c = await capR.json(); setIsAdmin(!!c.isAdmin); if (c.captured > 0) setCaptured({ count: c.captured, url: c.url, slug: c.slug || null, origin: c.origin, pages: c.pages || [] }); }
 if (cssR.ok) { const { css } = await cssR.json(); const { settings, rest } = parseDesign(css || ""); setDesign(settings); setDesignRest(rest); }
 setDesignLoaded(true);
 if (asR.ok) { const a = await asR.json(); setAssets(a.assets || []); }
 if (meR.ok) { const m = await meR.json(); setStoreName(m.storeName || "Your Store"); }
 if (sfR.ok) {
 const d = await sfR.json();
 setHandle(d.settings.handle || ""); setEnabled(!!d.settings.enabled);
 setTagline(d.settings.tagline || ""); setHeroImage(d.settings.heroImage || ""); setAbout(d.settings.about || "");
 setIsPlatformAdmin(!!d.admin);
 }
 if (dsR.ok) {
 const d = await dsR.json();
 setTemplates(d.templates || []); setHeadingFonts(d.headingFonts || []); setBodyFonts(d.bodyFonts || []);
 setTemplate(d.template); setColors(d.colors); setFonts(d.fonts); setProducts(d.products || []);
 setBlocks(d.blocks || []); setShopBlocks(d.shopBlocks || []); setExtraPages(d.extraPages || []); setBlockTypes(d.blockTypes || []); setCustomCss(d.customCss || "");
 const fams = [...new Set([...(d.headingFonts || []), ...(d.bodyFonts || [])])].map((f: string) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
 const link = document.createElement("link"); link.rel = "stylesheet"; link.href = `https://fonts.googleapis.com/css2?${fams}&display=swap`; document.head.appendChild(link);
 }
 if (domR.ok) { const d = await domR.json(); setDom({ configured: !!d.configured, domain: d.domain || null, status: d.status || null }); }
 } catch { /* leave defaults */ }
 if (!cancelled) setLoading(false);
 })();
 return () => { cancelled = true; };
 }, []);

 // The Sidekick can change the design — refresh the editor + preview when it does.
 useEffect(() => {
 function onUpdate() {
 setPreviewKey((k) => k + 1); // reload the captured-site preview after a VYA edit
 (async () => {
 try {
 const [sfR, dsR] = await Promise.all([fetch("/api/store/storefront"), fetch("/api/store/storefront/design")]);
 if (sfR.ok) { const d = await sfR.json(); setTagline(d.settings.tagline || ""); setHeroImage(d.settings.heroImage || ""); }
 if (dsR.ok) { const d = await dsR.json(); setTemplate(d.template); setColors(d.colors); setFonts(d.fonts); setBlocks(d.blocks || []); setShopBlocks(d.shopBlocks || []); setExtraPages(d.extraPages || []); setCustomCss(d.customCss || ""); }
 } catch { /* ignore */ }
 })();
 }
 window.addEventListener("vya:store-updated", onUpdate);
 return () => window.removeEventListener("vya:store-updated", onUpdate);
 }, []);

 function applyTemplate(t: Template) { setTemplate(t.id); setColors({ ...t.colors }); setFonts({ ...t.fonts }); setSaved(false); }

 // Build-from-scratch sellers: VYA designs a full storefront from their products.
 async function generateStorefront() {
 setGenBusy(true); setGenErr(null);
 try {
 const r = await fetch("/api/store/storefront/generate", { method: "POST" });
 const d = await r.json();
 if (!r.ok) { setGenErr(d.error || "Couldn’t generate — try again."); setGenBusy(false); return; }
 const dsR = await fetch("/api/store/storefront/design");
 if (dsR.ok) { const ds = await dsR.json(); setTemplate(ds.template); setColors(ds.colors); setFonts(ds.fonts); setBlocks(ds.blocks || []); setExtraPages(ds.extraPages || []); setActiveSlug("home"); }
 setSaved(false);
 } catch { setGenErr("Couldn’t generate — try again."); }
 setGenBusy(false);
 }

 // Re-pull the seller's live site so the hosted copy reflects their latest changes.
 async function reSync() {
 if (!captured?.origin) { setSyncMsg("We don't have your original site URL — bring it over again from “Bring your site.”"); return; }
 setSyncBusy(true); setSyncMsg(null);
 try {
 const r = await fetch("/api/store/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: captured.origin }) });
 const d = await r.json();
 if (!r.ok) setSyncMsg(d.error || "Re-sync failed.");
 else { setCaptured((c) => (c ? { ...c, count: d.pages ?? c.count } : c)); setSyncMsg(`✓ Synced — ${d.pages} pages now up to date.`); setPreviewKey((k) => k + 1); }
 } catch { setSyncMsg("Re-sync failed."); }
 setSyncBusy(false);
 }

 // Apply the global design (accent + fonts) to the captured site's custom-CSS layer,
 // preserving any other custom CSS, then reload the preview to show it.
 // Live design like the studio: the moment a colour/font/corner changes, inject it into the preview
 // instantly (postMessage → a <style> in the iframe) AND auto-save (debounced) — no Apply button, no reload.
 const designSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 useEffect(() => {
 if (!captured || !designLoaded) return; // never auto-save the empty mount state over the server's design
 const css = buildDesignCss(design, designRest);
 postToPreview({ vya: "css", css });
 setDesignSaved(false);
 if (designSaveTimer.current) clearTimeout(designSaveTimer.current);
 designSaveTimer.current = setTimeout(() => {
 fetch("/api/store/capture/css", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ css }) }).then(() => setDesignSaved(true)).catch(() => {});
 }, 650);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [design, designRest, captured, designLoaded]);
 // Undo/redo shortcuts for the captured editor — forwarded into the preview iframe. (When you're typing
 // in the iframe the browser handles ⌘Z natively; this covers the rest + the top-bar buttons.)
 useEffect(() => {
 if (!captured) return;
 const onKey = (e: KeyboardEvent) => {
 if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
 const t = e.target as HTMLElement | null;
 if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
 e.preventDefault();
 postToPreview({ vya: e.shiftKey ? "redo" : "undo" });
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [captured]);
 // Studio-parity Design handlers, wired to the captured CSS layer.
 const setDesignField = (patch: Partial<DesignSettings>) => { setDesign((d) => ({ ...d, ...patch })); setDesignSaved(false); };
 const applyCapPalette = (c: { bg: string; text: string; accent: string }) => setDesignField({ bg: c.bg, text: c.text, accent: c.accent });
 const capPaletteActive = (c: { bg: string; text: string; accent: string }) => design.bg === c.bg && design.text === c.text && design.accent === c.accent;

 // Live bridge to the preview iframe: it reports a clicked section's fields; we send edits back.
 useEffect(() => {
 function onMsg(e: MessageEvent) {
 const d = e.data as { vya?: string; index?: number; fields?: PanelField[]; path?: string; id?: number; src?: string; style?: { bg?: string; color?: string; align?: string }; rect?: { top: number; cx: number } };
 if (!d || !d.vya) return;
 if (d.vya === "section") { setPanel({ index: d.index ?? -1, fields: d.fields || [] }); setSelImg(null); setSecStyle(d.style || {}); setSecRect(d.rect || null); setPanelDirty(false); setPanelSaving(false); }
 else if (d.vya === "secrect") setSecRect({ top: (d as { top: number }).top, cx: (d as { cx: number }).cx });
 else if (d.vya === "imgsel" && typeof d.id === "number") { setSelImg({ id: d.id, src: d.src || "" }); setPanel(null); }
 else if (d.vya === "navigate" && typeof d.path === "string") {
 // Clicked an internal link on the site → switch the editor to that page.
 const pages = capturedRef.current?.pages || [];
 const p = d.path;
 const match = pages.find((x) => x === p || x.replace(/\/$/, "") === p.replace(/\/$/, "")) || (p === "/" ? "/" : null);
 if (match) { setSelPath(match); setPanel(null); setSelImg(null); setPreviewKey((k) => k + 1); }
 }
 else if (d.vya === "unsaved") { setPanelDirty(true); setCapStatus("unsaved"); }
 else if (d.vya === "saved") { setPanelDirty(false); setPanelSaving(false); setCapStatus("saved"); }
 else if (d.vya === "status") { const s = (d as { text?: string }).text; setCapStatus(s === "Saving…" ? "saving" : s === "Unsaved changes" ? "unsaved" : "saved"); }
 }
 window.addEventListener("message", onMsg);
 return () => window.removeEventListener("message", onMsg);
 }, []);

 const postToPreview = (msg: unknown) => editIframe.current?.contentWindow?.postMessage(msg, "*");
 // Asset library (Canva-style uploads) — the store's own photos, reusable across the whole site.
 async function loadAssets() {
 setAssetsBusy(true);
 const r = await fetch("/api/store/assets").then((x) => (x.ok ? x.json() : null)).catch(() => null);
 setAssets(r?.assets || []);
 setAssetsBusy(false);
 }
 async function uploadAsset(file: File): Promise<string | null> {
 setAssetsBusy(true);
 const fd = new FormData(); fd.append("file", file);
 const r = await fetch("/api/store/assets", { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 setAssetsBusy(false);
 if (r?.url) { const url = r.url as string; setAssets((a) => [{ url }, ...a.filter((x) => x.url !== url)]); return url; }
 return null;
 }
 // Swap the selected image on the canvas for a library asset (live) + mark it for save.
 function applyImage(src: string) {
 if (!selImg) return;
 postToPreview({ vya: "set", kind: "image", id: selImg.id, src });
 setSelImg((s) => (s ? { ...s, src } : s));
 setPanelDirty(true);
 }
 // Style the selected captured section (background / text colour / alignment) — live + tracked for save.
 function setSec(prop: "bg" | "color" | "align", value: string) {
 const css = prop === "bg" ? "background-color" : prop === "color" ? "color" : "text-align";
 postToPreview({ vya: "secstyle", prop: css, value });
 setSecStyle((s) => ({ ...s, [prop]: value }));
 }
 function setSecPhoto(url: string) {
 postToPreview({ vya: "secstyle", prop: "background-image", value: `url("${url}")` });
 postToPreview({ vya: "secstyle", prop: "background-size", value: "cover" });
 postToPreview({ vya: "secstyle", prop: "background-position", value: "center" });
 setSecStyle((s) => ({ ...s, bg: "" }));
 }
 function setSecSpace(px: string) {
 postToPreview({ vya: "secstyle", prop: "padding-top", value: px });
 postToPreview({ vya: "secstyle", prop: "padding-bottom", value: px });
 }
 // eslint-disable-next-line react-hooks/rules-of-hooks
 useEffect(() => { if (captured) loadAssets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [!!captured]);
 function updatePanelField(i: number, patch: Record<string, unknown>) {
 setPanel((p) => (p ? { ...p, fields: p.fields.map((f, idx) => (idx === i ? ({ ...f, ...patch } as PanelField) : f)) } : p));
 setPanelDirty(true);
 }
 async function replacePanelImage(i: number, file: File) {
 const f = panel?.fields[i]; if (!f || f.kind !== "image") return;
 const fd = new FormData(); fd.append("file", file);
 try { const r = await fetch("/api/store/assets", { method: "POST", body: fd }); if (r.ok) { const { url } = await r.json(); updatePanelField(i, { src: url }); postToPreview({ vya: "set", kind: "image", id: f.id, src: url }); } } catch { /* ignore */ }
 }
 function savePanel() { setPanelSaving(true); postToPreview({ vya: "save" }); }
 const fieldLabel = (tag: string): string => (({ h1: "Heading", h2: "Heading", h3: "Heading", h4: "Subheading", h5: "Subheading", h6: "Subheading", p: "Text", li: "List item", a: "Link text", button: "Button", blockquote: "Quote", label: "Label", span: "Text" }) as Record<string, string>)[tag] || "Text";

 // The sections being edited belong to the active page (home or an extra page).
 const curBlocks = activeSlug === "home" ? blocks : activeSlug === "shop" ? shopBlocks : extraPages.find((p) => p.slug === activeSlug)?.blocks ?? [];
 function updateCur(fn: (bs: Block[]) => Block[]) {
 if (activeSlug === "home") setBlocks(fn);
 else if (activeSlug === "shop") setShopBlocks(fn);
 else setExtraPages((ps) => ps.map((p) => (p.slug === activeSlug ? { ...p, blocks: fn(p.blocks) } : p)));
 setSaved(false);
 }
 // Canva-style: text typed directly on the canvas syncs back to the block's prop on blur.
 function editField(id: string, key: string, value: string) {
 updateCur((bs) => bs.map((b) => (b.id === id ? { ...b, props: { ...(b.props || {}), [key]: value } } : b)));
 }
 function addBlock(type: BlockType) { updateCur((bs) => [...bs, makeBlock(type)]); }
 function removeBlock(id: string) { updateCur((bs) => bs.filter((b) => b.id !== id)); }
 function moveBlock(i: number, dir: -1 | 1) { updateCur((bs) => { const to = i + dir; if (to < 0 || to >= bs.length) return bs; const next = [...bs]; [next[i], next[to]] = [next[to], next[i]]; return next; }); }
 function setBlockProp(id: string, key: string, val: string) { updateCur((bs) => bs.map((b) => (b.id === id ? { ...b, props: { ...b.props, [key]: val } } : b))); }
 // Merge one visual override into a section's style; empty/undefined values clear that key.
 function patchBlockStyle(id: string, patch: Partial<BlockStyle>) {
 updateCur((bs) => bs.map((b) => {
 if (b.id !== id) return b;
 const merged: BlockStyle = { ...(b.style || {}), ...patch };
 (Object.keys(merged) as (keyof BlockStyle)[]).forEach((k) => { if (!merged[k]) delete merged[k]; });
 return { ...b, style: Object.keys(merged).length ? merged : undefined };
 }));
 }
 function setBlockBg(id: string, bg: string) { patchBlockStyle(id, { bg: bg || undefined }); }
 function reorderTo(to: number) { if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; } const from = dragIdx; updateCur((bs) => { const next = [...bs]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; }); setDragIdx(null); }
 // Drag a section by its grip on the canvas → reorder, with a drop line (shared drag state with the panel).
 const canvasReorder = {
 dragIndex: dragIdx,
 overIndex: canvasOver,
 onStart: (i: number) => setDragIdx(i),
 onOver: (i: number) => setCanvasOver((c) => (c === i ? c : i)),
 onEnd: () => { setDragIdx(null); setCanvasOver(null); },
 onDrop: (i: number) => { reorderTo(i); setCanvasOver(null); },
 };

 // Floating format toolbar: when the owner selects text inside an editable element on the canvas,
 // pop a small bar (bold / italic / underline / colour) above the selection — Canva-style.
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

 function addPage() {
 const title = window.prompt("Page name (e.g. About, FAQ, Shipping)");
 if (!title || !title.trim()) return;
 let slug = pageSlugify(title);
 const taken = new Set(["home", "shop", ...extraPages.map((p) => p.slug)]);
 if (taken.has(slug)) slug = `${slug}-${extraPages.length + 1}`;
 setExtraPages((ps) => [...ps, { slug, title: title.trim().slice(0, 60), blocks: [] }]);
 setActiveSlug(slug); setSaved(false);
 }
 function deletePage(slug: string) {
 if (!window.confirm("Delete this page?")) return;
 setExtraPages((ps) => ps.filter((p) => p.slug !== slug));
 if (activeSlug === slug) setActiveSlug("home");
 setSaved(false);
 }
 async function saveBlocks() {
 setBusy(true); setSaved(false); setErr(null);
 try { const r = await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks, shopBlocks, extraPages }) }); if (!r.ok) setErr("Couldn’t save."); else setSaved(true); } catch { setErr("Couldn’t save."); }
 setBusy(false);
 }

 async function saveDesign() {
 setBusy(true); setSaved(false); setErr(null);
 try {
 const r = await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template, colors, fonts }) });
 if (!r.ok) setErr("Couldn’t save the design."); else setSaved(true);
 } catch { setErr("Couldn’t save the design."); }
 setBusy(false);
 }

 // Live on/off — persists immediately (used by the top-bar toggle in both editor modes).
 async function toggleLive() {
 const next = !enabled;
 setEnabled(next);
 await fetch("/api/store/storefront", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, enabled: next, tagline, accentColor: colors.accent, heroImage, about }) }).catch(() => setEnabled(!next));
 }

 // Admin-only: wipe this storefront entirely (settings, design, pages, public URL) and reopen blank.
 async function removeStorefront() {
 if (!confirm("DELETE STOREFRONT: wipes this store’s storefront — settings, design, pages, and its public URL. This can’t be undone. Continue?")) return;
 setDelBusy(true);
 const r = await fetch("/api/store/storefront", { method: "DELETE" }).catch(() => null);
 if (r && r.ok) { window.location.reload(); return; }
 setDelBusy(false);
 }

 async function saveDetails() {
 setBusy(true); setSaved(false); setErr(null);
 try {
 const r = await fetch("/api/store/storefront", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, enabled, tagline, accentColor: colors.accent, heroImage, about }) });
 const d = await r.json();
 if (!r.ok) setErr(d.error || "Save failed."); else { setHandle(d.settings.handle); setSaved(true); }
 } catch { setErr("Save failed."); }
 setBusy(false);
 }

 async function connectDomain() {
 setDomBusy(true); setDomErr(null);
 try {
 const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: domInput }) });
 const d = await r.json();
 if (!r.ok) setDomErr(d.error || "Couldn’t connect that domain."); else { setDom({ configured: true, domain: d.domain, status: d.status }); setDomInput(""); }
 } catch { setDomErr("Couldn’t connect that domain."); }
 setDomBusy(false);
 }
 async function recheckDomain() {
 setDomBusy(true); setDomErr(null);
 try { const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify" }) }); const d = await r.json(); if (r.ok) setDom((x) => ({ ...x, status: d.status })); else setDomErr(d.error || "Check failed."); } catch { setDomErr("Check failed."); }
 setDomBusy(false);
 }
 async function disconnectDomain() { if (!confirm("Disconnect this domain?")) return; setDomBusy(true); await fetch("/api/store/domain", { method: "DELETE" }); setDom((x) => ({ ...x, domain: null, status: null })); setDomBusy(false); }
 async function searchDomain() {
 const q = dsearch.trim(); if (!q) return;
 setDsBusy(true); setDres(null); setShowBuy(false); setBuyMsg(null);
 try { const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search", domain: q }) }); const d = await r.json(); if (r.ok) setDres({ domain: d.domain, available: d.available, priceCents: d.priceCents }); else setBuyMsg(d.error || "Search failed."); } catch { setBuyMsg("Search failed."); }
 setDsBusy(false);
 }
 async function buyDomainNow() {
 if (!dres) return;
 setBuyBusy(true); setBuyMsg(null);
 try { const r = await fetch("/api/store/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy", domain: dres.domain, contact: buyForm }) }); const d = await r.json(); if (r.ok) { setDom((x) => ({ ...x, domain: d.domain, status: d.status })); setDres(null); setShowBuy(false); } else setBuyMsg(d.error || "Purchase failed."); } catch { setBuyMsg("Purchase failed."); }
 setBuyBusy(false);
 }

 async function uploadAssets(files: FileList | File[]) {
 const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
 if (!imgs.length) return;
 setAssetBusy(true);
 for (const f of imgs) {
 const fd = new FormData(); fd.append("file", f);
 try { const r = await fetch("/api/store/assets", { method: "POST", body: fd }); if (r.ok) { const d = await r.json(); setAssets((a) => [{ url: d.url }, ...a]); } } catch { /* skip */ }
 }
 setAssetBusy(false);
 }
 async function deleteAsset(url: string) {
 setAssets((a) => a.filter((x) => x.url !== url));
 await fetch(`/api/store/assets?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {});
 }
 // Place a photo as the hero and persist immediately. If the home page has a hero SECTION, set its
 // image (the modern block model); otherwise fall back to the legacy storefront hero image.
 async function setHero(url: string) {
 const heroBlock = blocks.find((b) => b.type === "hero");
 if (heroBlock) {
 const next = blocks.map((b) => (b.id === heroBlock.id ? { ...b, props: { ...b.props, image: url } } : b));
 setBlocks(next); setSaved(false);
 await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks: next, shopBlocks, extraPages }) }).catch(() => {});
 return;
 }
 setHeroImage(url);
 await fetch("/api/store/storefront", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, enabled, tagline, accentColor: colors.accent, heroImage: url, about }) }).catch(() => {});
 }

 const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/[0.06]";
 const label = "block text-[12px] font-medium text-stone-500 mb-2";

 if (loading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-400 text-sm">Loading…</div>;

 // A seller who brought their own site over edits THAT site (live preview + re-sync
 // + conversational edits via VYA), not the block builder.
 if (captured) {
 const pageLabel = (p: string) => {
 if (p === "/") return "Home";
 const seg = p.split("/").filter(Boolean).pop() || p;
 return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
 };
 // Edit preview must be SAME-ORIGIN so it loads the captured pages on whatever host the editor is on
 // (localhost, getvya.ai). captured.url is an absolute public URL (prod / custom domain) — wrong for the
 // iframe. Build a relative /site/{slug} path from the slug (falling back to the url's pathname).
 const sitePath = captured.slug ? `/site/${captured.slug}` : (() => { try { return new URL(captured.url || "").pathname; } catch { return ""; } })();
 const editSrc = `${sitePath}${selPath === "/" ? "" : selPath}?edit=1`;
 // Show the store's VYA address (matches the from-scratch studio), not the original captured host.
 const siteHost = `${handle || captured.slug || "your-store"}.getvya.ai`;
 const deviceMax = device === "phone" ? "390px" : device === "tablet" ? "834px" : "100%";
 const capDbtn = (d: "desktop" | "tablet" | "phone", Icon: typeof Monitor) => (
 <button type="button" onClick={() => setDevice(d)} aria-label={d} className={`grid h-7 w-9 place-items-center rounded-md transition ${device === d ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}><Icon size={15} strokeWidth={1.9} /></button>
 );
 return (
 <div className="fixed inset-0 z-[60] flex flex-col bg-[#fbf9f5] text-stone-900">
 <HideGlobalChat />
 {/* Top bar — matches the studio */}
 <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-[#fbf9f5] px-3">
 <div className="flex min-w-0 items-center gap-2.5">
 <a href={`${base}/home`} title="Back to admin" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/10 text-stone-500 transition hover:bg-stone-100"><ChevronDown size={16} className="rotate-90" /></a>
 <span className="truncate text-[15px] font-semibold tracking-tight">{storeName}</span>
 <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${enabled ? "bg-emerald-500/[0.12] text-emerald-700" : "bg-black/[0.06] text-stone-500"}`}>{enabled ? "Live" : "Draft"}</span>
 <span className="hidden shrink-0 rounded-full bg-[#5D0F17]/[0.07] px-2 py-0.5 text-[10px] font-semibold text-[#5D0F17] sm:inline">Imported site</span>
 <span className="mx-0.5 h-5 w-px bg-black/10" />
 <div className="flex overflow-hidden rounded-lg border border-black/10 bg-[#f4f1ec]">
 <button type="button" onClick={() => postToPreview({ vya: "undo" })} title="Undo (⌘Z)" aria-label="Undo" className="grid h-7 w-8 place-items-center text-stone-500 transition hover:bg-white hover:text-stone-800"><Undo2 size={15} strokeWidth={1.9} /></button>
 <span className="w-px bg-black/10" />
 <button type="button" onClick={() => postToPreview({ vya: "redo" })} title="Redo (⌘⇧Z)" aria-label="Redo" className="grid h-7 w-8 place-items-center text-stone-500 transition hover:bg-white hover:text-stone-800"><Redo2 size={15} strokeWidth={1.9} /></button>
 </div>
 </div>
 <div className="hidden rounded-lg border border-black/10 bg-[#f4f1ec] p-0.5 md:flex">{capDbtn("desktop", Monitor)}{capDbtn("tablet", Tablet)}{capDbtn("phone", Smartphone)}</div>
 <div className="flex shrink-0 items-center gap-2">
 {capStatus === "unsaved"
 ? <button type="button" onClick={() => postToPreview({ vya: "save" })} className="rounded-lg bg-[#5D0F17] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">Save</button>
 : <span className="hidden text-[11px] text-stone-400 sm:inline">{capStatus === "saving" ? "Saving…" : "All changes saved"}</span>}
 <button type="button" onClick={toggleLive} className="flex items-center gap-2 rounded-lg border border-black/15 px-3 py-1.5 transition hover:bg-stone-100" aria-pressed={enabled} title={enabled ? "Your store is live — click to unpublish" : "Your store is off — click to publish"}>
 <span className="text-[12px] font-medium text-stone-600">{enabled ? "Live" : "Off"}</span>
 <span className="relative h-4 w-7 rounded-full transition" style={{ background: enabled ? "#10b981" : "#d6d3d1" }}><span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all" style={{ left: enabled ? "14px" : "2px" }} /></span>
 </button>
 {captured.url && <a href={captured.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-[#5D0F17] px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]"><ExternalLink size={13} /><span className="hidden sm:inline">View live</span></a>}
 </div>
 </div>

 <div className="flex min-h-0 flex-1">
 {/* Canva-style shell: a vertical icon rail (always visible) + a collapsible content panel — 1:1 with the from-scratch studio */}
 <div className={`relative flex shrink-0 overflow-visible border-r border-black/10 bg-white transition-[width] duration-200 ${capPanelOpen ? "w-[430px]" : "w-[70px]"}`}>
 <button type="button" onClick={() => setCapPanelOpen((o) => !o)} title={capPanelOpen ? "Collapse panel" : "Expand panel"} className="absolute -right-3 top-1/2 z-30 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-black/10 bg-white text-stone-500 shadow-sm transition hover:text-[#5D0F17]">{capPanelOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}</button>
 {/* Vertical icon rail */}
 <div className="flex w-[70px] shrink-0 flex-col items-center gap-1 overflow-y-auto py-3">
 {([["design", "Design", Palette], ["sections", "Sections", Layers], ["elements", "Elements", Shapes], ["text", "Text", Type], ["uploads", "Uploads", UploadIcon], ["assist", "VYA", Sparkles]] as const).map(([id, label, Icon]) => (
 <button key={id} type="button" onClick={() => { if (!(selImg || panel) && capTab === id && capPanelOpen) { setCapPanelOpen(false); } else { setCapTab(id); setCapPanelOpen(true); } }} className={`flex w-[58px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition ${!(selImg || panel) && capTab === id && capPanelOpen ? "bg-[#5D0F17]/[0.08] text-[#5D0F17]" : "text-stone-500 hover:bg-stone-100"}`}>
 <Icon size={19} strokeWidth={1.8} />{label}
 </button>
 ))}
 </div>
 {/* Active panel — hidden when the side bar is collapsed */}
 {capPanelOpen && (
 <div className="flex min-h-0 flex-1 flex-col border-l border-black/10 bg-white">
 {(selImg || panel) ? (
 /* ── Contextual editor — selecting an image/section replaces the rail (like the studio) ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 {selImg ? (
 <>
 <div className="mb-3 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Replace image</p>
 <button onClick={() => setSelImg(null)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={selImg.src} alt="" className="mb-3 aspect-[4/3] w-full rounded-lg border border-black/10 object-cover" />
 <label className="mb-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#5D0F17] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">
 <Plus size={14} /> Upload a photo
 <input type="file" accept="image/*" className="hidden" disabled={assetsBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const url = await uploadAsset(f); if (url) applyImage(url); }} />
 </label>
 <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Your uploads</p>
 {assets.length === 0 ? (
 <p className="text-[12px] leading-relaxed text-stone-400">{assetsBusy ? "Loading…" : "No uploads yet — add photos and they'll live here, reusable across your whole site."}</p>
 ) : (
 <div className="grid grid-cols-3 gap-1.5">
 {assets.map(({ url }) => (
 // eslint-disable-next-line @next/next/no-img-element
 <button key={url} type="button" onClick={() => applyImage(url)} className={`aspect-square overflow-hidden rounded-md border transition hover:ring-2 hover:ring-[#5D0F17]/40 ${selImg.src === url ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/40" : "border-black/10"}`}><img src={url} alt="" className="h-full w-full object-cover" /></button>
 ))}
 </div>
 )}
 </>
 ) : panel ? (
 <>
 <div className="mb-3 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Edit section</p>
 <button onClick={() => setPanel(null)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 <div className="mb-4 flex gap-2">
 <button onClick={() => postToPreview({ vya: "dupsec" })} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"><Copy size={13} /> Duplicate</button>
 <button onClick={() => { postToPreview({ vya: "delsec" }); setPanel(null); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /> Delete</button>
 </div>
 {panel.fields.length === 0 && <p className="text-[12px] leading-relaxed text-stone-400">This section has no editable text or images — move, duplicate, or delete it, or ask VYA.</p>}
 <div className="space-y-4">
 {panel.fields.map((f, i) => (
 <div key={(f.kind === "text" ? "t" + f.eid : f.kind === "image" ? "i" + f.id : "l" + f.id) + "-" + i}>
 {f.kind === "text" && (
 <>
 <label className="mb-1 block text-[12px] font-medium text-stone-600">{fieldLabel(f.tag)}</label>
 <textarea value={f.value} onChange={(e) => { updatePanelField(i, { value: e.target.value }); postToPreview({ vya: "set", kind: "text", eid: f.eid, value: e.target.value }); }} className="min-h-[42px] w-full resize-y rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#5D0F17]/50" />
 </>
 )}
 {f.kind === "image" && (
 <>
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Image</label>
 <div className="flex items-center gap-2.5">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={f.src} alt="" className="h-12 w-12 rounded border border-stone-200 object-cover" />
 <label className="cursor-pointer text-[12px] text-[#5D0F17] underline hover:text-[#5D0F17]/80">Replace<input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) replacePanelImage(i, e.target.files[0]); e.target.value = ""; }} /></label>
 </div>
 </>
 )}
 {f.kind === "link" && (
 <>
 <label className="mb-1 block text-[12px] font-medium text-stone-600">Link{f.label ? ` — “${f.label}”` : ""}</label>
 <input value={f.href} onChange={(e) => { updatePanelField(i, { href: e.target.value }); postToPreview({ vya: "set", kind: "link", id: f.id, href: e.target.value }); }} placeholder="https://…  or  /page" className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#5D0F17]/50" />
 </>
 )}
 </div>
 ))}
 </div>
 <div className="mt-5 border-t border-black/10 pt-4">
 <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Section style</p>
 <div className="space-y-2">
 <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">Background</span>
 {secStyle.bg && <button onClick={() => setSec("bg", "")} title="Clear" className="text-[11px] text-stone-400 underline hover:text-[#5D0F17]">reset</button>}
 <ColorSwatch value={secStyle.bg || "#ffffff"} onChange={(v) => setSec("bg", v)} />
 </div>
 <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">Text</span>
 {secStyle.color && <button onClick={() => setSec("color", "")} title="Clear" className="text-[11px] text-stone-400 underline hover:text-[#5D0F17]">reset</button>}
 <ColorSwatch value={secStyle.color || "#1a1a1a"} onChange={(v) => setSec("color", v)} />
 </div>
 <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">Align</span>
 <div className="flex overflow-hidden rounded-md border border-black/10">
 {(["left", "center", "right"] as const).map((a) => (
 <button key={a} onClick={() => setSec("align", a)} className={`grid h-7 w-8 place-items-center transition ${secStyle.align === a ? "bg-[#5D0F17] text-white" : "text-stone-500 hover:bg-stone-100"}`}>{a === "left" ? <AlignLeft size={14} /> : a === "center" ? <AlignCenter size={14} /> : <AlignRight size={14} />}</button>
 ))}
 </div>
 </div>
 </div>
 </div>
 </>
 ) : null}
 </div>
 ) : (
 <>
 {capTab === "assist" ? (
 <div className="min-h-0 flex-1"><Sidekick docked /></div>
 ) : capTab === "sections" ? (
 /* ── Sections — drop a whole section onto the captured page (same gallery as the studio) ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Add a section</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Drops it at the bottom of your page — then click its text or images to edit, or drag it into place.</p>
 <div className="grid grid-cols-2 gap-2">
 {([["hero", "Hero"], ["announcement", "Announcement"], ["faq", "FAQ"], ["gallery", "Gallery"], ["split", "Split"], ["columns", "Columns"], ["testimonials", "Reviews"], ["blog", "Blog"], ["contact", "Contact"], ["statement", "Statement"], ["newsletter", "Newsletter"]] as const).map(([type, label]) => (
 <button key={type} type="button" onClick={() => postToPreview({ vya: "addblock", type })} title={label} className="group flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white text-left transition hover:-translate-y-px hover:border-[#5D0F17]/40 hover:shadow-[0_10px_26px_-14px_rgba(43,36,29,0.5)]">
 <div className="h-[58px] w-full border-b border-black/5 bg-gradient-to-b from-white to-stone-50"><SectionThumb type={type} /></div>
 <span className="flex items-center gap-1 px-2.5 py-1.5"><span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800">{label}</span><Plus size={12} className="shrink-0 text-stone-300 transition group-hover:text-[#5D0F17]" /></span>
 </button>
 ))}
 </div>
 <p className="mt-5 rounded-xl bg-stone-50 px-4 py-3 text-[12px] leading-relaxed text-stone-500">Want a live drop countdown or something custom? Ask <button type="button" onClick={() => setCapTab("assist")} className="font-semibold text-[#5D0F17] underline">VYA</button> to build it into your site.</p>
 </div>
 ) : capTab === "elements" ? (
 /* ── Elements — small building blocks dropped onto the page ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Elements</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Adds a block at the bottom of the page — then click it to edit, or drag it into place.</p>
 <div className="grid grid-cols-3 gap-2">
 {([["image", "Image", ImageIcon], ["button", "Button", MousePointerClick], ["divider", "Line", Minus]] as const).map(([type, label, Icon]) => (
 <button key={type} type="button" onClick={() => postToPreview({ vya: "addblock", type })} className="flex flex-col items-center gap-1.5 rounded-lg border border-black/10 bg-white py-3.5 text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]">
 <Icon size={17} strokeWidth={1.8} />
 <span className="text-[10px] font-semibold">{label}</span>
 </button>
 ))}
 </div>
 </div>
 ) : capTab === "text" ? (
 /* ── Text — drop a text block onto the page ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Text</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Adds a text block to the page — click it to edit, and use the floating toolbar to size, colour, and align it.</p>
 <div className="flex flex-col gap-2">
 {([["Heading", "text-[20px] font-semibold"], ["Paragraph", "text-[13px]"]] as const).map(([label, cls]) => (
 <button key={label} type="button" onClick={() => postToPreview({ vya: "addblock", type: "text" })} className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3.5 py-3 text-stone-700 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]">
 <span className={cls}>{label}</span><Plus size={14} className="text-stone-300" />
 </button>
 ))}
 </div>
 </div>
 ) : capTab === "uploads" ? (
 /* ── Uploads — the media library; click a photo to drop it onto the page ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <label className="mb-4 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#5D0F17] px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">{assetsBusy ? "Uploading…" : (<><UploadIcon size={14} /> Upload a photo</>)}<input type="file" accept="image/*" className="hidden" disabled={assetsBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadAsset(f); }} /></label>
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Your uploads</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Click a photo to drop it onto your page as an image, reusable across your whole site.</p>
 {assets.length === 0 ? (
 <p className="text-[12px] leading-relaxed text-stone-400">{assetsBusy ? "Loading…" : "No uploads yet — add photos and they'll live here."}</p>
 ) : (
 <div className="grid grid-cols-3 gap-1.5">
 {assets.map(({ url }) => (
 // eslint-disable-next-line @next/next/no-img-element
 <button key={url} type="button" onClick={() => postToPreview({ vya: "addblock", type: "image", src: url })} className="aspect-square overflow-hidden rounded-md border border-black/10 transition hover:ring-2 hover:ring-[#5D0F17]/40"><img src={url} alt="" className="h-full w-full object-cover" /></button>
 ))}
 </div>
 )}
 </div>
 ) : (
 /* ── Design tab — 1:1 with the studio: palettes / colours / corners / fonts ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <p className="mb-2 rounded-lg bg-[#5D0F17]/[0.05] px-3 py-2 text-[11px] leading-relaxed text-[#5D0F17]">Your imported site keeps its own layout — these set its palette, fonts and corners on top. <b>Apply</b> to preview.</p>

 <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Colour palette</p>
 <div className="grid grid-cols-3 gap-2">
 {STOREFRONT_PALETTES.map((p) => (
 <button key={p.id} type="button" onClick={() => applyCapPalette(p.colors)} title={p.name} className={`overflow-hidden rounded-lg border text-left transition ${capPaletteActive(p.colors) ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <div className="flex h-11" style={{ background: p.colors.bg }}>
 <span className="m-auto flex gap-1">
 <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: p.colors.text }} />
 <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: p.colors.accent }} />
 </span>
 </div>
 <p className="truncate px-1.5 py-1 text-[9px] font-medium text-stone-500">{p.name}</p>
 </button>
 ))}
 </div>

 <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Colours</p>
 <div className="space-y-1.5">
 {([["bg", "Background", "#FFFFFF"], ["text", "Text", "#1A1A1A"], ["accent", "Accent", "#5D0F17"]] as const).map(([key, label, fallback]) => (
 <div key={key} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">{label}</span>
 {design[key] && <button onClick={() => setDesignField({ [key]: null })} title="Keep original" className="text-[11px] text-stone-400 underline hover:text-[#5D0F17]">reset</button>}
 <ColorSwatch value={design[key] || fallback} onChange={(v) => setDesignField({ [key]: v })} />
 </div>
 ))}
 </div>

 <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Corners</p>
 <div className="grid grid-cols-3 gap-2">
 {RADIUS_OPTIONS.map((r) => (
 <button key={r.id} type="button" onClick={() => setDesignField({ radius: r.id as Radius })} className={`flex flex-col items-center gap-2 rounded-lg border py-3 transition ${design.radius === r.id ? "border-[#5D0F17] bg-[#5D0F17]/[0.05] ring-1 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <span className="h-7 w-7 border-2 border-stone-500" style={{ borderRadius: RADIUS_PREVIEW[r.id] }} />
 <span className="text-[11px] font-medium text-stone-600">{r.name}</span>
 </button>
 ))}
 </div>

 <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Fonts</p>
 <div className="grid grid-cols-2 gap-2">
 {FONT_PAIRS.map((fp) => (
 <button key={fp.name} type="button" onClick={() => setDesignField({ heading: fp.heading, body: fp.body })} className={`rounded-lg border px-3 py-2 text-left transition ${design.heading === fp.heading && design.body === fp.body ? "border-[#5D0F17] ring-1 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <span className="block truncate text-[15px] leading-tight text-stone-800" style={{ fontFamily: ff(fp.heading) }}>{fp.name}</span>
 <span className="block truncate text-[10px] text-stone-400" style={{ fontFamily: ff(fp.body) }}>{fp.heading} · {fp.body}</span>
 </button>
 ))}
 </div>
 {(design.heading || design.body) && <button onClick={() => setDesignField({ heading: null, body: null })} className="mt-2 text-[11px] text-stone-400 underline hover:text-[#5D0F17]">Keep original fonts</button>}

 <p className="mt-4 text-[11px] text-stone-400">{designSaved ? "All changes saved ✓ — live on your site" : "Changes apply live as you edit."}</p>

 <details className="mt-4">
 <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Custom CSS</summary>
 <p className="mb-1.5 mt-2 text-[12px] leading-snug text-stone-400">Advanced — layered over your site. Or just ask VYA.</p>
 <textarea value={designRest} onChange={(e) => { setDesignRest(e.target.value); setDesignSaved(false); }} spellCheck={false} placeholder=".site-header { background: #111; }" className="min-h-[100px] w-full resize-y rounded-lg border border-black/10 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-[#5D0F17]/50" />
 </details>

 {isAdmin && (
 <div className="mt-5 space-y-2 border-t border-black/10 pt-4">
 <button onClick={reSync} disabled={syncBusy} className="w-full rounded-lg border border-black/15 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:border-[#5D0F17] disabled:opacity-50">{syncBusy ? "Syncing…" : "Re-sync from live site (admin)"}</button>
 {(syncBusy || syncMsg) && <p className={`text-[11px] ${syncBusy ? "text-stone-400" : syncMsg!.startsWith("✓") ? "text-green-700" : "text-amber-700"}`}>{syncBusy ? "Re-crawling — a minute or two…" : syncMsg}</p>}
 <button onClick={async () => { if (!confirm("OWNER RESET: discards the captured site AND deletes all (non-sold) inventory, then switches to the simple design. This can’t be undone — continue?")) return; await fetch("/api/store/capture", { method: "DELETE" }).catch(() => {}); setCaptured(null); }} className="block text-[11px] text-stone-400 underline hover:text-[#5D0F17]">Use the simple design instead (owner)</button>
 </div>
 )}
 {isPlatformAdmin && (
 <div className="mt-4 space-y-1.5 border-t border-black/10 pt-4">
 <button onClick={removeStorefront} disabled={delBusy} className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{delBusy ? "Deleting…" : "Delete storefront"}</button>
 <p className="text-[10px] leading-tight text-stone-400">Platform admin only — wipes this storefront entirely.</p>
 </div>
 )}
 </div>
 )}
 </>
 )}
 </div>
 )}
 </div>

 {/* Canvas */}
 <div className="flex min-w-0 flex-1 flex-col">
 {/* Page selector chrome */}
 <div className="flex items-center gap-2 border-b border-black/10 bg-white px-3 py-2">
 <button onClick={() => setPreviewKey((k) => k + 1)} title="Reload preview" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"><RotateCw size={14} strokeWidth={2} /></button>
 <div className="relative shrink-0">
 <HomeIcon size={13} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
 <select value={selPath} onChange={(e) => { setSelPath(e.target.value); setPanel(null); setPreviewKey((k) => k + 1); }} className="cursor-pointer appearance-none rounded-lg border border-black/10 bg-white py-1.5 pl-8 pr-7 text-[12.5px] font-medium text-stone-700 transition hover:border-stone-300 focus:outline-none">
 {captured.pages.map((p) => <option key={p} value={p}>{pageLabel(p)}</option>)}
 </select>
 <ChevronDown size={13} strokeWidth={2.25} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
 </div>
 <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-black/10 bg-stone-50 px-2.5 py-1.5">
 <Globe size={12} strokeWidth={2} className="shrink-0 text-stone-400" />
 <span className="truncate text-[12px] text-stone-500">{siteHost}{selPath === "/" ? "" : selPath}</span>
 </div>
 </div>

 {/* Preview surface — the pixel-perfect captured site */}
 <div className="relative flex min-h-0 flex-1 justify-center bg-[#eeece7] p-4">
 <div className="h-full w-full transition-[max-width] duration-300" style={{ maxWidth: deviceMax }}>
 <iframe ref={editIframe} key={`${selPath}-${previewKey}-${device}`} src={editSrc} onLoad={() => { setPanel(null); setSelImg(null); setSecRect(null); }} className="h-full w-full rounded-lg border border-black/10 bg-white shadow-sm" title="Page editor" />
 </div>
 {/* Floating section bar — the SAME bar as the from-scratch builder, positioned over the selected section */}
 {panel && secRect && editIframe.current && (() => {
 const ir = editIframe.current.getBoundingClientRect();
 const top = Math.max(ir.top + 6, Math.min(ir.top + secRect.top + 6, ir.bottom - 54));
 const left = Math.min(Math.max(ir.left + secRect.cx, ir.left + 200), ir.right - 200);
 const accent = design.accent && /^#[0-9a-fA-F]{6}$/.test(design.accent) ? design.accent : "#5D0F17";
 const chip = (on: boolean) => `shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition ${on ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`;
 return (
 <div style={{ position: "fixed", top, left, transform: "translateX(-50%)", zIndex: 65 }} className="flex max-w-[94vw] items-center gap-2 overflow-x-auto rounded-xl border border-black/10 bg-white px-3 py-2 shadow-[0_16px_44px_-12px_rgba(43,36,29,0.5)]">
 <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone-400">Bg</span>
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 <button type="button" onClick={() => setSec("bg", "")} className={chip(!secStyle.bg)}>Page</button>
 <button type="button" onClick={() => setSec("bg", accent)} className={chip(secStyle.bg === accent)}>Accent</button>
 <button type="button" onClick={() => setSec("bg", "#1a1a1a")} className={chip(secStyle.bg === "#1a1a1a")}>Dark</button>
 </div>
 <ColorDot value={secStyle.bg && /^#/.test(secStyle.bg) ? secStyle.bg : "#ffffff"} onChange={(v) => setSec("bg", v)} title="Custom colour" />
 <label className="shrink-0 cursor-pointer rounded-md bg-[#5D0F17] px-3 py-1 text-[12px] font-medium text-white transition hover:bg-[#4a0c12]">{assetsBusy ? "Uploading…" : "Photo"}<input type="file" accept="image/*" className="hidden" disabled={assetsBusy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const url = await uploadAsset(f); if (url) setSecPhoto(url); }} /></label>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <ColorDot value={secStyle.color && /^#/.test(secStyle.color) ? secStyle.color : "#111111"} onChange={(v) => setSec("color", v)} title="Text colour" />
 <div className="flex shrink-0 overflow-hidden rounded-md border border-black/10">
 {(["left", "center", "right"] as const).map((a) => (
 <button key={a} type="button" onClick={() => setSec("align", secStyle.align === a ? "" : a)} className={chip(secStyle.align === a)}>{a[0].toUpperCase()}</button>
 ))}
 </div>
 <div className="flex shrink-0 items-center gap-1">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Space</span>
 <div className="flex overflow-hidden rounded-md border border-black/10">
 {([["sm", "24px"], ["md", "48px"], ["lg", "72px"], ["xl", "112px"]] as const).map(([lab, px]) => (
 <button key={lab} type="button" onClick={() => setSecSpace(px)} className={chip(false)}>{lab.toUpperCase()}</button>
 ))}
 </div>
 </div>
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => postToPreview({ vya: "movesec", dir: "up" })} title="Move up" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"><ChevronUp size={15} /></button>
 <button type="button" onClick={() => postToPreview({ vya: "movesec", dir: "down" })} title="Move down" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"><ChevronDown size={15} /></button>
 <button type="button" onClick={() => postToPreview({ vya: "dupsec" })} title="Duplicate" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><Copy size={14} /></button>
 <button type="button" onClick={() => { postToPreview({ vya: "delsec" }); setPanel(null); setSecRect(null); }} title="Delete" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
 </div>
 );
 })()}
 </div>
 {/* Canva-style Pages strip — the captured site's pages as thumbnails (click to switch) */}
 {captured.pages.length > 1 && (
 <div className="flex shrink-0 items-end gap-3 overflow-x-auto border-t border-black/10 bg-white px-4 py-3">
 {captured.pages.map((p) => (
 <div key={p} className="flex shrink-0 flex-col items-center gap-1.5">
 <button type="button" onClick={() => { setSelPath(p); setPanel(null); setSelImg(null); setPreviewKey((k) => k + 1); }} title={pageLabel(p)} className={`relative grid h-[68px] w-[52px] place-items-center overflow-hidden rounded-md border bg-white shadow-sm transition ${selPath === p ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"}`}>
 <div className="absolute inset-0 flex flex-col gap-1 p-1.5">
 <div className="h-1.5 w-3/4 rounded-full bg-stone-200" />
 <div className="h-1 w-full rounded-full bg-stone-100" />
 <div className="h-1 w-5/6 rounded-full bg-stone-100" />
 <div className="mt-auto h-3 w-full rounded-sm bg-stone-100" />
 </div>
 </button>
 <span className={`max-w-[60px] truncate text-[10px] ${selPath === p ? "font-semibold text-[#5D0F17]" : "text-stone-500"}`}>{pageLabel(p)}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 );
 }

 const heroProduct = products[0];
 const gridProducts = products.slice(0, 6);

 return (
 <div className="fixed inset-0 z-[60] flex flex-col bg-[#f4f4f5] text-stone-900">
 <HideGlobalChat />
 {/* Floating format toolbar — appears over a text selection on the canvas (Canva-style). */}
 {fmtBar && (
 <div
 style={{ position: "fixed", top: Math.max(8, fmtBar.top - 46), left: fmtBar.left, transform: "translateX(-50%)", zIndex: 90 }}
 className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-1 py-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
 onMouseDown={(e) => e.preventDefault()}
 >
 {[
 { key: "bold", label: "B", cls: "font-bold", run: () => fmtCmd("bold") },
 { key: "italic", label: "I", cls: "italic", run: () => fmtCmd("italic") },
 { key: "underline", label: "U", cls: "underline", run: () => fmtCmd("underline") },
 ].map((t) => (
 <button key={t.key} type="button" title={t.key} onClick={t.run} className={`grid h-7 w-7 place-items-center rounded-md text-[13px] text-stone-600 transition hover:bg-stone-100 ${t.cls}`}>{t.label}</button>
 ))}
 <span className="mx-0.5 h-5 w-px bg-stone-200" />
 {[colors.accent, "#1a1a1a", "#8a7d6b", "#b4453f", "#2f5d50"].map((c) => (
 <button key={c} type="button" title="Text colour" onClick={() => fmtCmd("foreColor", c)} className="h-5 w-5 rounded-full border border-black/10 transition hover:scale-110" style={{ background: c }} />
 ))}
 <span className="mx-0.5 h-5 w-px bg-stone-200" />
 <button type="button" title="Clear formatting" onClick={() => fmtCmd("removeFormat")} className="grid h-7 w-7 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100"><XIcon size={13} /></button>
 </div>
 )}
 {/* Top bar */}
 <header className="flex items-center justify-between gap-3 border-b border-stone-200/80 bg-white px-3 py-2">
 <div className="flex min-w-0 items-center gap-2">
 <a href={`${base}/home`} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-[13px] font-semibold text-stone-800 transition hover:bg-stone-50" title="Back to your store">
 <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#5D0F17] text-[11px] font-bold text-white">{(storeName || "V").slice(0, 1).toUpperCase()}</span>
 <span className="truncate">{storeName}</span>
 <span className="hidden text-[10px] font-normal uppercase tracking-[0.14em] text-stone-400 sm:inline">/ Builder</span>
 </a>
 </div>
 <div className="flex shrink-0 items-center gap-1.5">
 <button type="button" onClick={toggleLive} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-1.5 transition hover:bg-stone-50" aria-pressed={enabled} title={enabled ? "Your store is live — click to unpublish" : "Your store is off — click to publish"}>
 <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-stone-300"}`} />
 <span className="text-[12px] font-medium text-stone-600">{enabled ? "Live" : "Off"}</span>
 <span className="relative h-4 w-7 rounded-full transition" style={{ background: enabled ? "#10b981" : "#d6d3d1" }}><span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all" style={{ left: enabled ? "14px" : "2px" }} /></span>
 </button>
 <button onClick={() => setShowControls((v) => !v)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition ${showControls ? "border-[#5D0F17]/30 bg-[#5D0F17]/[0.04] text-[#5D0F17]" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}><SlidersHorizontal size={14} strokeWidth={2} /><span className="hidden sm:inline">Customize</span></button>
 {handle && <a href={`/s/${handle}?preview=1`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-[#5D0F17] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]"><ExternalLink size={14} strokeWidth={2.25} /><span className="hidden sm:inline">View live</span></a>}
 </div>
 </header>

 {/* Split: chat + preview + (customize slide-over) */}
 <div className="flex min-h-0 flex-1">
 <aside className="order-1 hidden w-[340px] shrink-0 border-r border-stone-200 sm:block"><Sidekick docked /></aside>
 {showControls && (
 <div className="order-3 w-[440px] shrink-0 overflow-y-auto border-l border-stone-200 bg-white">
 <div className="px-6 py-6">
 <div className="mb-5 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Customize</p>
 <button onClick={() => setShowControls(false)} className="text-[13px] text-stone-400 hover:text-[#5D0F17]">✕</button>
 </div>

 {/* Build with VYA — only when the store has no sections yet (else they edit by hand / ask VYA in chat) */}
 {blocks.length === 0 && (
 <div className="mb-6 rounded-xl border border-stone-300 bg-stone-50 p-4">
 <p className="text-[15px] font-semibold mb-1">Start in one click</p>
 <p className="text-xs text-stone-500 mb-3">Let VYA design a full storefront — homepage, About, FAQ &amp; shipping pages — from your products and brand. You can edit everything after.</p>
 <button onClick={generateStorefront} disabled={genBusy} className="w-full rounded-lg bg-[#5D0F17] text-white px-5 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{genBusy ? "VYA is designing your store…" : "Build my storefront with VYA ✨"}</button>
 {genBusy && <p className="mt-2 text-[11px] text-stone-400">Designing your homepage + pages — about 10–20 seconds.</p>}
 {genErr && <p className="mt-2 text-xs text-red-700">{genErr}</p>}
 </div>
 )}

 {/* Tabs */}
 <div className="flex gap-5 border-b border-stone-200 mb-6">
 {([["sections", "Sections"], ["design", "Design"], ["assets", "Photos"], ["details", "Details"], ["domain", "Domain"]] as const).map(([k, lbl]) => (
 <button key={k} onClick={() => { setTab(k); setSaved(false); }} className={`pb-2.5 text-[13px] font-medium -mb-px border-b-2 transition ${tab === k ? "border-[#5D0F17] text-[#5D0F17]" : "border-transparent text-stone-400 hover:text-stone-600"}`}>{lbl}</button>
 ))}
 </div>

 {/* ── Design tab ── */}
 {tab === "design" && (
 <div>
 <p className={label}>Template</p>
 <div className="grid grid-cols-2 gap-2.5 mb-7">
 {templates.map((t) => (
 <button key={t.id} onClick={() => applyTemplate(t)} className={`text-left rounded-xl border overflow-hidden transition ${template === t.id ? "border-[#5D0F17] ring-1 ring-[#5D0F17]" : "border-stone-200 hover:border-[#5D0F17]/40"}`}>
 <div className="h-16 flex items-center justify-center" style={{ background: t.colors.bg }}>
 <span className="text-base" style={{ color: t.colors.text, fontFamily: ff(t.fonts.heading) }}>{t.name}</span>
 </div>
 <div className="flex" style={{ height: 4 }}><span className="flex-1" style={{ background: t.colors.bg }} /><span className="flex-1" style={{ background: t.colors.text }} /><span className="flex-1" style={{ background: t.colors.accent }} /></div>
 </button>
 ))}
 </div>

 <p className={label}>Colors</p>
 <div className="space-y-2 mb-7">
 {([["bg", "Background"], ["text", "Text"], ["accent", "Accent"]] as const).map(([k, lbl]) => (
 <div key={k} className="flex items-center gap-3">
 <label className="relative h-9 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-stone-200" style={{ background: /^#[0-9a-fA-F]{6}$/.test(colors[k]) ? colors[k] : "#fff" }}>
 <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colors[k]) ? colors[k] : "#000000"} onChange={(e) => { setColors((c) => ({ ...c, [k]: e.target.value })); setSaved(false); }} className="absolute inset-0 cursor-pointer opacity-0" />
 </label>
 <input value={colors[k]} onChange={(e) => { setColors((c) => ({ ...c, [k]: e.target.value })); setSaved(false); }} className={`${input} w-24 font-mono text-xs`} />
 <span className="text-sm text-stone-500">{lbl}</span>
 </div>
 ))}
 </div>

 <p className={label}>Fonts</p>
 <div className="space-y-3 mb-8">
 {([["heading", "Headings"], ["body", "Body"]] as const).map(([k, lbl]) => (
 <div key={k}>
 <label className="block text-xs text-stone-500 mb-1">{lbl}</label>
 <div className="relative">
 <select value={fonts[k]} onChange={(e) => { setFonts((f) => ({ ...f, [k]: e.target.value })); setSaved(false); }} className={`${input} appearance-none pr-8`} style={{ fontFamily: ff(fonts[k]) }}>
 {(k === "heading" ? headingFonts : bodyFonts).map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 <ChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
 </div>
 {/* live preview of the chosen face */}
 <p className="mt-2 truncate rounded-lg bg-stone-50 px-3 py-2 text-stone-700" style={{ fontFamily: ff(fonts[k]), fontSize: k === "heading" ? "20px" : "14px" }}>{k === "heading" ? storeName : "Curated vintage, one-of-one — shop the edit."}</p>
 </div>
 ))}
 </div>

 <div className="flex items-center gap-4">
 <button onClick={saveDesign} disabled={busy} className="rounded-lg bg-[#5D0F17] text-white px-6 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{busy ? "Saving…" : "Save design"}</button>
 {saved && <span className="text-xs text-green-700">Saved ✓</span>}
 {err && <span className="text-xs text-red-700">{err}</span>}
 </div>

 {/* Custom CSS — full control; also where you can see what VYA wrote. */}
 <div className="mt-8 border-t border-stone-200 pt-6">
 <p className={label}>Custom CSS</p>
 <p className="-mt-2 mb-2 text-xs text-stone-400">Advanced — layered over your theme site-wide. Target the storefront classes: <code className="rounded bg-stone-100 px-1">.vya-hero</code>, <code className="rounded bg-stone-100 px-1">.vya-heading</code>, <code className="rounded bg-stone-100 px-1">.vya-cta</code>, <code className="rounded bg-stone-100 px-1">.vya-featured</code>… Or just tell VYA what you want and it writes this for you.</p>
 <textarea value={customCss} onChange={(e) => { setCustomCss(e.target.value); setCssSaved(false); }} spellCheck={false} placeholder=".vya-hero .vya-hero-inner { align-items: flex-start; text-align: left; }" className={`${input} min-h-[140px] resize-y font-mono text-[12px] leading-relaxed`} />
 <div className="mt-3 flex items-center gap-3">
 <button onClick={async () => { setCssBusy(true); setCssSaved(false); const r = await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customCss }) }).catch(() => null); setCssBusy(false); if (r && r.ok) setCssSaved(true); }} disabled={cssBusy} className="rounded-lg bg-[#5D0F17] text-white px-5 py-2.5 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{cssBusy ? "Applying…" : "Apply CSS"}</button>
 {cssSaved && <span className="text-xs text-green-700">Applied ✓ — live on your site</span>}
 </div>
 </div>
 </div>
 )}

 {/* ── Sections tab ── */}
 {tab === "sections" && (
 <div>
 <p className="text-xs text-stone-500 mb-3">Build each page from sections — add, reorder, edit. Or ask VYA to build a whole page.</p>
 {/* Page switcher */}
 <div className="mb-4 flex flex-wrap items-center gap-1.5">
 {[{ slug: "home", title: "Home" } as StorePage, { slug: "shop", title: "Shop" } as StorePage, ...extraPages].map((p) => (
 <span key={p.slug} className={`inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] ${activeSlug === p.slug ? "border-[#5D0F17] bg-stone-50 text-[#5D0F17]" : "border-stone-200 text-stone-500"}`}>
 <button onClick={() => setActiveSlug(p.slug)}>{p.title}</button>
 {p.slug !== "home" && p.slug !== "shop" && <button onClick={() => deletePage(p.slug)} className="text-stone-300 hover:text-red-700" title="Delete page">×</button>}
 </span>
 ))}
 <button onClick={addPage} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2.5 py-1 text-[11px] text-stone-500 transition hover:border-[#5D0F17]/45 hover:text-[#5D0F17]"><Plus size={12} strokeWidth={2.5} />New page</button>
 </div>
 {activeSlug === "shop" && <p className="mb-4 rounded-md bg-stone-50 px-3 py-2 text-[11px] text-stone-500">These sections show <b>above</b> your product grid on the Shop page — add a heading, intro text, or images. Your products list automatically below.</p>}
 <div className="space-y-2.5 mb-5">
 {curBlocks.map((b, i) => {
 const def = blockTypes.find((d) => d.type === b.type);
 const curBg = b.style?.bg || "";
 const st = b.style || {};
 const hasHeading = ["hero", "featured", "text", "newsletter"].includes(b.type);
 const textish = ["announcement", "hero", "featured", "text", "newsletter"].includes(b.type);
 const canBg = b.type !== "announcement" && b.type !== "hero";
 return (
 <div key={b.id} id={`ed-${b.id}`} onDragOver={(e) => { if (dragIdx !== null) e.preventDefault(); }} onDrop={() => reorderTo(i)} className={`overflow-hidden rounded-xl border bg-white transition ${dragIdx === i ? "border-[#5D0F17] opacity-50" : selBlock === b.id ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/15" : "border-stone-200"}`}>
 <div draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} className="flex cursor-grab items-center justify-between border-b border-stone-100 bg-stone-50/70 px-3 py-2 active:cursor-grabbing">
 <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500"><GripVertical size={13} className="text-stone-300" />{def?.label || b.type}</span>
 <div className="flex items-center gap-0.5 text-stone-400">
 <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="grid h-6 w-6 place-items-center rounded-md transition hover:bg-stone-200/60 hover:text-[#5D0F17] disabled:opacity-25 disabled:hover:bg-transparent"><ChevronUp size={14} /></button>
 <button onClick={() => moveBlock(i, 1)} disabled={i === curBlocks.length - 1} className="grid h-6 w-6 place-items-center rounded-md transition hover:bg-stone-200/60 hover:text-[#5D0F17] disabled:opacity-25 disabled:hover:bg-transparent"><ChevronDown size={14} /></button>
 <button onClick={() => removeBlock(b.id)} className="grid h-6 w-6 place-items-center rounded-md transition hover:bg-red-50 hover:text-red-600"><XIcon size={13} /></button>
 </div>
 </div>
 <div className="space-y-2 p-3">
 {def?.fields.map((f) => (
 <div key={f.key}>
 <label className="mb-1 block text-[11px] text-stone-500">{f.label}</label>
 {f.kind === "textarea" ? (
 <textarea value={b.props[f.key] || ""} onChange={(e) => setBlockProp(b.id, f.key, e.target.value)} className={`${input} min-h-[60px] resize-y`} />
 ) : (
 <input value={b.props[f.key] || ""} onChange={(e) => setBlockProp(b.id, f.key, e.target.value)} placeholder={f.kind === "image" ? "Image URL (or use the Photos tab)" : ""} className={input} />
 )}
 </div>
 ))}
 {(canBg || textish || hasHeading) && (
 <div className="mt-1 space-y-3 rounded-lg bg-stone-50/70 p-2.5">
 <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-400">Design</p>

 {canBg && (
 <div>
 <label className="mb-1 block text-[11px] text-stone-500">Background</label>
 <div className="flex items-center gap-1.5">
 {([["", "Default"], ["accent", "Accent"], ["dark", "Dark"]] as const).map(([val, lbl]) => (
 <button key={lbl} onClick={() => setBlockBg(b.id, val)} className={`rounded-md border px-2.5 py-1 text-[11px] transition ${curBg === val || (val === "" && !curBg) ? "border-[#5D0F17] bg-white text-[#5D0F17]" : "border-stone-200 text-stone-400 hover:text-stone-600"}`}>{lbl}</button>
 ))}
 <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-stone-200" title="Custom colour" style={{ background: /^#[0-9a-fA-F]{6}$/.test(curBg) ? curBg : "#ffffff" }}>
 <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(curBg) ? curBg : "#000000"} onChange={(e) => setBlockBg(b.id, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
 {!/^#[0-9a-fA-F]{6}$/.test(curBg) && <Plus size={13} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-stone-400" />}
 </label>
 </div>
 </div>
 )}

 {textish && (
 <div>
 <label className="mb-1 block text-[11px] text-stone-500">Text colour</label>
 <div className="flex flex-wrap items-center gap-1.5">
 <button onClick={() => patchBlockStyle(b.id, { textColor: undefined })} className={`rounded-md border px-2.5 py-1 text-[11px] transition ${!st.textColor ? "border-[#5D0F17] bg-white text-[#5D0F17]" : "border-stone-200 text-stone-400 hover:text-stone-600"}`}>Default</button>
 {[colors.text, colors.accent, "#ffffff", "#111111", "#8a7d6b"].map((c) => (
 <button key={c} onClick={() => patchBlockStyle(b.id, { textColor: c })} title="Text colour" className={`h-6 w-6 rounded-full border transition hover:scale-110 ${st.textColor?.toLowerCase() === c.toLowerCase() ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10"}`} style={{ background: c }} />
 ))}
 <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-stone-200" title="Custom colour" style={{ background: st.textColor && ![colors.text, colors.accent, "#ffffff", "#111111", "#8a7d6b"].map((x) => x.toLowerCase()).includes(st.textColor.toLowerCase()) ? st.textColor : "#fff" }}>
 <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(st.textColor || "") ? st.textColor : "#111111"} onChange={(e) => patchBlockStyle(b.id, { textColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
 <Plus size={12} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-stone-400" />
 </label>
 </div>
 </div>
 )}

 {textish && (
 <div>
 <label className="mb-1 block text-[11px] text-stone-500">Alignment</label>
 <div className="flex items-center gap-1">
 {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([val, Icon]) => (
 <button key={val} onClick={() => patchBlockStyle(b.id, { align: st.align === val ? undefined : val })} title={val} className={`grid h-7 flex-1 place-items-center rounded-md border transition ${st.align === val ? "border-[#5D0F17] bg-white text-[#5D0F17]" : "border-stone-200 text-stone-400 hover:text-stone-600"}`}><Icon size={14} /></button>
 ))}
 </div>
 </div>
 )}

 {hasHeading && (
 <div>
 <label className="mb-1 block text-[11px] text-stone-500">Heading size</label>
 <div className="flex items-center gap-1">
 {([["sm", "S"], ["md", "M"], ["lg", "L"], ["xl", "XL"]] as const).map(([val, lbl]) => (
 <button key={val} onClick={() => patchBlockStyle(b.id, { headingSize: st.headingSize === val ? undefined : val })} className={`h-7 flex-1 rounded-md border text-[11px] font-medium transition ${st.headingSize === val ? "border-[#5D0F17] bg-white text-[#5D0F17]" : "border-stone-200 text-stone-400 hover:text-stone-600"}`}>{lbl}</button>
 ))}
 </div>
 </div>
 )}

 <div>
 <label className="mb-1 block text-[11px] text-stone-500">Spacing</label>
 <div className="flex items-center gap-1">
 {([["", "Default"], ["md", "Cozy"], ["lg", "Roomy"], ["xl", "Airy"]] as const).map(([val, lbl]) => (
 <button key={lbl} onClick={() => patchBlockStyle(b.id, { space: (val || undefined) as BlockScale | undefined })} className={`h-7 flex-1 rounded-md border text-[11px] transition ${(st.space || "") === val ? "border-[#5D0F17] bg-white text-[#5D0F17]" : "border-stone-200 text-stone-400 hover:text-stone-600"}`}>{lbl}</button>
 ))}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 );
 })}
 {curBlocks.length === 0 && (
 <div className="border border-dashed border-stone-300 bg-white px-4 py-6 text-center">
 <p className="mb-3 text-xs text-stone-400">No sections on this page yet — add one below, or let VYA build it for you.</p>
 <button onClick={() => window.dispatchEvent(new CustomEvent("vya:ask", { detail: activeSlug === "home" ? "Build my whole storefront for me." : `Build out my "${extraPages.find((p) => p.slug === activeSlug)?.title || activeSlug}" page.` }))} className="inline-flex items-center gap-1.5 bg-[#5D0F17] text-white px-4 py-2 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition">✨ Have VYA build it</button>
 </div>
 )}
 </div>

 <p className={label}>Add section</p>
 <div className="mb-6 grid grid-cols-2 gap-2">
 {blockTypes.map((d) => (
 <button key={d.type} onClick={() => addBlock(d.type)} className="group flex items-start gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:border-[#5D0F17]/40 hover:bg-[#5D0F17]/[0.02]">
 <Plus size={13} strokeWidth={2.5} className="mt-0.5 shrink-0 text-stone-300 transition group-hover:text-[#5D0F17]" />
 <span><span className="block text-xs font-medium text-[#5D0F17]">{d.label}</span><span className="text-[10px] leading-tight text-stone-400">{d.description}</span></span>
 </button>
 ))}
 </div>

 <div className="flex items-center gap-4">
 <button onClick={saveBlocks} disabled={busy} className="bg-[#5D0F17] text-white px-6 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{busy ? "Saving…" : "Save sections"}</button>
 {saved && <span className="text-xs text-green-700">Saved ✓</span>}
 {err && <span className="text-xs text-red-700">{err}</span>}
 </div>
 </div>
 )}

 {/* ── Photos tab ── */}
 {tab === "assets" && (
 <div>
 <p className="text-xs text-stone-500 mb-4">Your photo library — hero banners, lookbook shots, anything. Hover any photo to set it as your hero. To use one in a section, upload here and paste its link, or just ask VYA.</p>
 <label
 onDragOver={(e) => { e.preventDefault(); }}
 onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) uploadAssets(e.dataTransfer.files); }}
 className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-white py-8 text-center cursor-pointer hover:border-[#5D0F17]/40 transition mb-5"
 >
 <span className="text-sm text-stone-600">{assetBusy ? "Uploading…" : "Drop photos here or click to upload"}</span>
 <span className="text-[11px] text-stone-400">JPG / PNG, up to 15MB each</span>
 <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) uploadAssets(e.target.files); e.target.value = ""; }} />
 </label>
 {assets.length ? (
 <>
 <p className="text-[11px] text-stone-400 mb-2">{assets.length} photo{assets.length === 1 ? "" : "s"} · hover for options</p>
 <div className="grid grid-cols-3 gap-2">
 {assets.map((a) => (
 <div key={a.url} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.url); e.dataTransfer.effectAllowed = "copy"; }} className="group relative aspect-square overflow-hidden rounded-lg border border-stone-200 cursor-grab active:cursor-grabbing">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={a.url} alt="" className="h-full w-full object-cover pointer-events-none" />
 <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-1.5" style={{ background: "rgba(0,0,0,0.35)" }}>
 <button onClick={() => deleteAsset(a.url)} title="Delete photo" className="self-end grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[#5D0F17] text-xs leading-none">×</button>
 <button onClick={() => setHero(a.url)} className="rounded-md bg-white/90 text-[#5D0F17] py-1 text-[10px] font-medium uppercase tracking-[0.12em] hover:bg-white">Set as hero</button>
 </div>
 </div>
 ))}
 </div>
 </>
 ) : (
 <p className="text-xs text-stone-400 text-center py-6">No photos yet — upload your first above.</p>
 )}
 </div>
 )}

 {/* ── Details tab ── */}
 {tab === "details" && (
 <div>
 <div className="mb-5">
 <label className={label}>Storefront URL</label>
 <div className="flex items-stretch">
 <input className={`${input} rounded-none`} value={handle} onChange={(e) => { setHandle(e.target.value); setSaved(false); }} placeholder="your-store" />
 <span className="inline-flex items-center bg-stone-100 border border-l-0 border-stone-200 px-3 text-sm text-stone-400">.getvya.ai</span>
 </div>
 </div>
 <div className="mb-5">
 <label className={label}>Tagline</label>
 <input className={input} value={tagline} onChange={(e) => { setTagline(e.target.value); setSaved(false); }} placeholder="Curated vintage, one-of-one." maxLength={120} />
 </div>
 <div className="mb-5">
 <label className={label}>Fallback hero image <span className="text-stone-300">(optional)</span></label>
 <input className={input} value={heroImage} onChange={(e) => { setHeroImage(e.target.value); setSaved(false); }} placeholder="https://…/banner.jpg" />
 <p className="mt-1.5 text-[11px] text-stone-400">Shown only if your homepage has no hero section. Most stores set the hero from the Photos tab or a hero section instead.</p>
 </div>
 <div className="mb-7">
 <label className={label}>About <span className="text-stone-300">(optional)</span></label>
 <textarea className={`${input} min-h-[90px] resize-y`} value={about} onChange={(e) => { setAbout(e.target.value); setSaved(false); }} placeholder="A line or two about your store." maxLength={1000} />
 </div>
 <div className="flex items-center gap-4">
 <button onClick={saveDetails} disabled={busy} className="rounded-lg bg-[#5D0F17] text-white px-6 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
 {saved && <span className="text-xs text-green-700">Saved ✓</span>}
 {err && <span className="text-xs text-red-700">{err}</span>}
 </div>
 </div>
 )}

 {/* ── Domain tab ── */}
 {tab === "domain" && (
 <div>
 {/* Free VYA address — every store has one, no domain required */}
 <div className="mb-6 border border-stone-200 bg-white p-4">
 <p className="text-[12px] font-medium text-stone-400 mb-1.5">Your store is already live</p>
 <div className="flex items-center justify-between gap-3">
 <p className="font-mono text-sm truncate">{handle || "your-store"}.getvya.ai</p>
 {handle && <a href={`/s/${handle}?preview=1`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-stone-500 hover:text-[#5D0F17]">View ↗</a>}
 </div>
 <p className="mt-2 text-xs text-stone-400">No domain needed — share this link to start selling today.</p>
 </div>

 <p className="text-[12px] font-medium text-stone-400 mb-2">Custom domain <span className="opacity-50 normal-case tracking-normal">— optional</span></p>
 <p className="text-xs text-stone-500 mb-4">Prefer your own? Use a domain you already own, or buy one from any registrar (GoDaddy, Namecheap, etc.) and connect it here.</p>
 {!dom.configured ? (
 <p className="text-xs text-stone-400 bg-stone-100 px-3 py-2.5">Custom domains aren’t enabled on the server yet.</p>
 ) : dom.domain ? (
 <div className="border border-stone-200 bg-white p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm">{dom.domain}</p>
 <p className="text-xs mt-0.5" style={{ color: dom.status?.verified && !dom.status?.misconfigured ? "#15803d" : "#b45309" }}>{dom.status?.verified && !dom.status?.misconfigured ? "Connected ✓" : "Pending DNS — add the record below, then re-check"}</p>
 </div>
 <button onClick={disconnectDomain} disabled={domBusy} className="text-[13px] font-medium text-stone-400 hover:text-red-700">Disconnect</button>
 </div>
 {dom.status && (dom.status.misconfigured || !dom.status.verified) && (
 <div className="mt-3 border-t border-stone-200 pt-3">
 <p className="text-[12px] font-medium text-stone-400 mb-2">Set this DNS record at your registrar</p>
 {dom.status.records.map((rec, i) => <div key={i} className="font-mono text-xs bg-stone-100 px-3 py-2 mb-1">{rec.type} &nbsp; {rec.name} &nbsp;→&nbsp; {rec.value}</div>)}
 {dom.status.verification?.map((v, i) => <div key={`v${i}`} className="font-mono text-xs bg-stone-100 px-3 py-2 mb-1">{v.type} &nbsp; {v.domain} &nbsp;→&nbsp; {v.value}</div>)}
 <button onClick={recheckDomain} disabled={domBusy} className="mt-2 text-[13px] font-medium underline text-stone-600 hover:text-[#5D0F17]">{domBusy ? "Checking…" : "Re-check"}</button>
 </div>
 )}
 </div>
 ) : (
 <div className="flex items-stretch gap-2">
 <input className={input} value={domInput} onChange={(e) => setDomInput(e.target.value)} placeholder="shop.yourbrand.com" />
 <button onClick={connectDomain} disabled={domBusy || !domInput} className="shrink-0 bg-[#5D0F17] text-white px-4 text-[13px] font-medium hover:bg-[#5D0F17]/85 disabled:opacity-50">{domBusy ? "…" : "Connect"}</button>
 </div>
 )}
 {domErr && <p className="mt-2 text-xs text-red-700">{domErr}</p>}

 {/* Buy a new domain through VYA */}
 {dom.configured && !dom.domain && (
 <div className="mt-6 border-t border-stone-200 pt-5">
 <p className="text-[12px] font-medium text-stone-400 mb-1">Don’t have one? Buy a domain</p>
 <p className="text-xs text-stone-500 mb-3">Search, buy, and connect a brand-new domain without leaving VYA.</p>
 <div className="flex items-stretch gap-2">
 <input className={input} value={dsearch} onChange={(e) => setDsearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchDomain()} placeholder="yourbrand.com" />
 <button onClick={searchDomain} disabled={dsBusy || !dsearch.trim()} className="shrink-0 border border-stone-300 px-4 text-[13px] font-medium hover:border-[#5D0F17] disabled:opacity-50">{dsBusy ? "…" : "Search"}</button>
 </div>
 {dres && (
 <div className="mt-3 border border-stone-200 bg-white p-3">
 <div className="flex items-center justify-between gap-3">
 <p className="font-mono text-sm">{dres.domain}</p>
 {dres.available && dres.priceCents != null ? <span className="text-sm" style={{ color: "var(--accent)" }}>${(dres.priceCents / 100).toFixed(2)}/yr</span> : <span className="text-xs text-stone-400">Taken</span>}
 </div>
 {dres.available && dres.priceCents != null && !showBuy && (
 <button onClick={() => setShowBuy(true)} className="mt-3 w-full bg-[#5D0F17] text-white px-4 py-2.5 text-[13px] font-medium hover:bg-[#5D0F17]/85">Buy &amp; connect — ${(dres.priceCents / 100).toFixed(2)}</button>
 )}
 {showBuy && dres.priceCents != null && (
 <div className="mt-3 border-t border-stone-200 pt-3 space-y-2">
 <p className="text-[11px] text-stone-400">Registrant contact (required to register a domain). Charged to your card on file.</p>
 <div className="grid grid-cols-2 gap-2">
 <input className={input} placeholder="First name" value={buyForm.firstName} onChange={(e) => setBuyForm({ ...buyForm, firstName: e.target.value })} />
 <input className={input} placeholder="Last name" value={buyForm.lastName} onChange={(e) => setBuyForm({ ...buyForm, lastName: e.target.value })} />
 </div>
 <input className={input} placeholder="Email" value={buyForm.email} onChange={(e) => setBuyForm({ ...buyForm, email: e.target.value })} />
 <input className={input} placeholder="Phone (e.g. +13015551234)" value={buyForm.phone} onChange={(e) => setBuyForm({ ...buyForm, phone: e.target.value })} />
 <input className={input} placeholder="Street address" value={buyForm.address1} onChange={(e) => setBuyForm({ ...buyForm, address1: e.target.value })} />
 <div className="grid grid-cols-3 gap-2">
 <input className={input} placeholder="City" value={buyForm.city} onChange={(e) => setBuyForm({ ...buyForm, city: e.target.value })} />
 <input className={input} placeholder="State" value={buyForm.state} onChange={(e) => setBuyForm({ ...buyForm, state: e.target.value })} />
 <input className={input} placeholder="ZIP" value={buyForm.zip} onChange={(e) => setBuyForm({ ...buyForm, zip: e.target.value })} />
 </div>
 <input className={input} placeholder="Country (US)" value={buyForm.country} onChange={(e) => setBuyForm({ ...buyForm, country: e.target.value })} />
 <button onClick={buyDomainNow} disabled={buyBusy} className="w-full bg-[#5D0F17] text-white px-4 py-2.5 text-[13px] font-medium hover:bg-[#5D0F17]/85 disabled:opacity-50">{buyBusy ? "Registering your domain…" : `Confirm — buy for $${(dres.priceCents / 100).toFixed(2)}`}</button>
 </div>
 )}
 </div>
 )}
 {buyMsg && <p className="mt-2 text-xs text-red-700">{buyMsg}</p>}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 )}

 {/* ───── Live preview ───── */}
 <div className="order-2 flex-1 overflow-y-auto bg-[#f4f4f5] p-5 lg:p-8">
 <div className="mx-auto max-w-3xl">
 {/* Browser chrome / control bar */}
 <div className="mb-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
 <span className="hidden gap-1.5 pr-1 md:flex"><i className="h-3 w-3 rounded-full bg-stone-200" /><i className="h-3 w-3 rounded-full bg-stone-200" /><i className="h-3 w-3 rounded-full bg-stone-200" /></span>
 <button onClick={() => setPreviewKey((k) => k + 1)} title="Reload preview" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"><RotateCw size={14} strokeWidth={2} /></button>
 <div className="relative shrink-0">
 <HomeIcon size={13} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
 <select value={activeSlug} onChange={(e) => setActiveSlug(e.target.value)} className="cursor-pointer appearance-none rounded-lg border border-stone-200 bg-white py-1.5 pl-8 pr-7 text-[12.5px] font-medium text-stone-700 transition hover:border-stone-300 focus:outline-none">
 <option value="home">Home</option>
 <option value="shop">Shop</option>
 {extraPages.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
 </select>
 <ChevronDown size={13} strokeWidth={2.25} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
 </div>
 <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5">
 <Globe size={12} strokeWidth={2} className="shrink-0 text-stone-400" />
 <span className="truncate text-[12px] text-stone-500">{liveUrl(activeSlug !== "home" ? `/${activeSlug}` : "")}</span>
 <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{enabled ? "Live" : "Draft"}</span>
 <button onClick={() => { navigator.clipboard?.writeText(`https://${liveUrl(activeSlug !== "home" ? `/${activeSlug}` : "")}`).catch(() => {}); setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 1200); }} title="Copy link" className="shrink-0 text-stone-400 transition hover:text-stone-600">{copiedUrl ? <Check size={13} strokeWidth={2.5} className="text-emerald-500" /> : <Copy size={13} strokeWidth={2} />}</button>
 </div>
 {/* Responsive device preview — see the store at desktop, tablet, and phone widths. */}
 <div className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5 sm:flex">
 {([["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]] as const).map(([d, Icon]) => (
 <button key={d} onClick={() => setDevice(d)} title={d[0].toUpperCase() + d.slice(1)} className={`grid h-6 w-7 place-items-center rounded-md transition ${device === d ? "bg-white text-[#5D0F17] shadow-sm" : "text-stone-400 hover:text-stone-600"}`}><Icon size={13} strokeWidth={2} /></button>
 ))}
 </div>
 {handle && <a href={`/s/${handle}${activeSlug !== "home" ? `/${activeSlug}` : ""}?preview=1`} target="_blank" rel="noopener noreferrer" title="Open in new tab" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"><ExternalLink size={14} strokeWidth={2} /></a>}
 </div>

 {/* the storefront, live — resizes like a device on the stage */}
 <div className="mx-auto w-full" style={{ maxWidth: deviceW, transition: "max-width .4s cubic-bezier(.4,0,.2,1)" }}>
 <div ref={canvasRef} className="@container overflow-hidden rounded-xl border border-stone-200 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]" style={{ background: colors.bg, color: colors.text, fontFamily: ff(fonts.body) }}>
 {/* Store's custom CSS (AI- or hand-written), so the preview matches the live site. */}
 {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
 {/* header */}
 <div className="px-8 pt-7 pb-4 text-center" style={{ borderBottom: `1px solid ${colors.text}14` }}>
 <p className="text-2xl tracking-wide" style={{ fontFamily: ff(fonts.heading) }}>{storeName}</p>
 <div className="mt-2.5 flex flex-wrap justify-center gap-5 text-[10px] uppercase tracking-[0.18em]" style={{ opacity: 0.6 }}>
 <button onClick={() => setActiveSlug("home")} className={activeSlug === "home" ? "underline" : ""}>Home</button>
 <button onClick={() => setActiveSlug("shop")} className={activeSlug === "shop" ? "underline" : ""}>Shop</button>
 {extraPages.map((p) => <button key={p.slug} onClick={() => setActiveSlug(p.slug)} className={activeSlug === p.slug ? "underline" : ""}>{p.title}</button>)}
 </div>
 </div>

 {activeSlug === "shop" ? (
 <>
 {shopBlocks.length > 0 && <Blocks blocks={shopBlocks} colors={colors} fonts={fonts} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={selectBlock} selectedId={selBlock} edit onEditField={editField} reorder={canvasReorder} />}
 {/* the product grid (auto — your live catalogue) */}
 <div className="mx-auto max-w-6xl px-6 py-16">
 <div className="mb-8 text-center">
 <span className="mb-2 block text-[10px] uppercase tracking-[0.3em] opacity-40">Catalogue</span>
 <h2 className="text-3xl" style={{ fontFamily: ff(fonts.heading) }}>Shop</h2>
 </div>
 {products.length > 0 ? (
 <div className="grid grid-cols-2 gap-x-6 gap-y-10 @lg:grid-cols-3 @2xl:grid-cols-4">
 {products.slice(0, 8).map((p, i) => (
 <div key={i}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <div className="aspect-[4/5] w-full overflow-hidden bg-black/[0.06]">{p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}</div>
 <p className="mt-2 line-clamp-1 text-[11px] uppercase tracking-wide opacity-60">{p.title}</p>
 <p className="mt-1 text-[13px]" style={{ color: colors.accent }}>{money(p.price, p.currency)}</p>
 </div>
 ))}
 </div>
 ) : (
 <p className="py-16 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">Your products appear here automatically</p>
 )}
 </div>
 </>
 ) : curBlocks.length > 0 ? (
 <Blocks blocks={curBlocks} colors={colors} fonts={fonts} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={selectBlock} selectedId={selBlock} edit onEditField={editField} reorder={canvasReorder} />
 ) : (<>
 {/* hero — drop a photo from the library here to set it */}
 <div className="relative" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!dragHero) setDragHero(true); }} onDragLeave={() => setDragHero(false)} onDrop={(e) => { e.preventDefault(); setDragHero(false); const url = e.dataTransfer.getData("text/plain"); if (url) setHero(url); }}>
 {heroImage ? (
 // eslint-disable-next-line @next/next/no-img-element
 <div className="relative h-60 w-full overflow-hidden"><img src={heroImage} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ background: "rgba(0,0,0,0.25)" }}><p className="text-3xl text-white" style={{ fontFamily: ff(fonts.heading) }}>{tagline || "New Arrivals"}</p></div></div>
 ) : heroProduct ? (
 <div className="grid grid-cols-2 items-center">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={heroProduct.image} alt="" className="h-72 w-full object-cover" />
 <div className="px-8 text-center">
 <p className="text-3xl mb-3" style={{ fontFamily: ff(fonts.heading) }}>New Arrivals</p>
 <p className="text-xs mb-5" style={{ opacity: 0.7 }}>{tagline || "Curated vintage, one-of-one."}</p>
 <span className="inline-block px-7 py-2.5 text-[10px] uppercase tracking-[0.18em]" style={{ background: colors.accent, color: colors.bg }}>Shop now</span>
 </div>
 </div>
 ) : (
 <div className="px-8 py-14 text-center">
 <p className="text-4xl mb-3" style={{ fontFamily: ff(fonts.heading) }}>New Arrivals</p>
 <p className="text-xs mb-5" style={{ opacity: 0.7 }}>{tagline || "Curated vintage, one-of-one."}</p>
 <span className="inline-block px-7 py-2.5 text-[10px] uppercase tracking-[0.18em]" style={{ background: colors.accent, color: colors.bg }}>Shop now</span>
 </div>
 )}
 {dragHero && <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-white pointer-events-none" style={{ background: "rgba(93,15,23,0.45)" }}><span className="text-white text-xs uppercase tracking-[0.18em]">Drop to set as hero</span></div>}
 </div>

 {/* product grid */}
 <div className="px-8 py-9">
 <p className="text-center text-lg mb-6" style={{ fontFamily: ff(fonts.heading) }}>The Edit</p>
 {gridProducts.length ? (
 <div className="grid grid-cols-2 gap-x-4 gap-y-7 @lg:grid-cols-3">
 {gridProducts.map((p, i) => (
 <div key={i}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <div className="aspect-[3/4] overflow-hidden" style={{ background: `${colors.text}0d` }}><img src={p.image} alt="" className="h-full w-full object-cover" /></div>
 <p className="mt-2 text-[11px] leading-tight truncate">{p.title}</p>
 <p className="text-[11px]" style={{ color: colors.accent }}>{money(p.price, p.currency)}</p>
 </div>
 ))}
 </div>
 ) : (
 <div className="grid grid-cols-2 gap-4 @lg:grid-cols-3">
 {[0, 1, 2].map((i) => <div key={i}><div className="aspect-[3/4]" style={{ background: `${colors.text}10` }} /><p className="mt-2 text-[11px]" style={{ opacity: 0.7 }}>Vintage piece</p><p className="text-[11px]" style={{ color: colors.accent }}>$120</p></div>)}
 </div>
 )}
 </div>
 </>)}

 {/* footer */}
 <div className="px-8 py-6 text-center text-[10px] uppercase tracking-[0.18em]" style={{ borderTop: `1px solid ${colors.text}14`, opacity: 0.5 }}>{storeName} · Powered by VYA</div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}

// Hides the global floating chat launcher while the docked builder chat is on screen.
function HideGlobalChat() {
 useEffect(() => {
 window.dispatchEvent(new CustomEvent("vya:home-chat", { detail: true }));
 return () => { window.dispatchEvent(new CustomEvent("vya:home-chat", { detail: false })); };
 }, []);
 return null;
}
