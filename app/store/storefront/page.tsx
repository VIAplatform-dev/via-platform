"use client";

import { useEffect, useState, useRef } from "react";
import Blocks from "@/app/s/Blocks";
import Sidekick from "../Sidekick";
import { useStoreBase } from "../nav-base";
import { RotateCw, Globe, ChevronDown, Home as HomeIcon, Copy, Check, ExternalLink, SlidersHorizontal, GripVertical, ChevronUp, X as XIcon, Plus } from "lucide-react";
import { makeBlock, pageSlugify, type Block, type BlockDef, type BlockType, type StorePage } from "@/app/lib/storefront-blocks";
import { parseDesign, buildDesignCss, HEADING_FONTS, BODY_FONTS, type DesignSettings } from "@/app/lib/captured-design";

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

const SERIFS = new Set(["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces"]);
const ff = (name: string) => `'${name}', ${SERIFS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;
const money = (c: number | null, cur: string) => (c == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(c / 100));

export default function StorefrontEditor() {
 const base = useStoreBase();
 const [loading, setLoading] = useState(true);
 const [tab, setTab] = useState<"design" | "sections" | "assets" | "details" | "domain">("sections");
 const [storeName, setStoreName] = useState("Your Store");
 const [showDesign, setShowDesign] = useState(false); // captured-mode: design popover in the preview chrome
 const [showControls, setShowControls] = useState(true); // block-mode: the Customize slide-over
 const [copiedUrl, setCopiedUrl] = useState(false);
 const liveUrl = (sub: string) => `vyaplatform.com/s/${handle || "your-store"}${sub}`;
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

 // Details
 const [handle, setHandle] = useState("");
 const [enabled, setEnabled] = useState(false);
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
 const [captured, setCaptured] = useState<{ count: number; url: string | null; origin: string | null; pages: string[] } | null>(null);
 const [isAdmin, setIsAdmin] = useState(false); // owner-only: the reset/wipe action
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

 // Global design for a captured site: accent + fonts, layered over the theme via custom CSS.
 const [design, setDesign] = useState<DesignSettings>({ accent: null, heading: null, body: null });
 const [designRest, setDesignRest] = useState(""); // any other custom CSS (e.g. VYA-assistant-added) to preserve
 const [customCss, setCustomCss] = useState(""); // block-mode: raw custom CSS (AI- or hand-written), layered over the theme
 const [cssBusy, setCssBusy] = useState(false);
 const [cssSaved, setCssSaved] = useState(false);
 const [designBusy, setDesignBusy] = useState(false);
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
 if (capR.ok) { const c = await capR.json(); setIsAdmin(!!c.isAdmin); if (c.captured > 0) setCaptured({ count: c.captured, url: c.url, origin: c.origin, pages: c.pages || [] }); }
 if (cssR.ok) { const { css } = await cssR.json(); const { settings, rest } = parseDesign(css || ""); setDesign(settings); setDesignRest(rest); }
 if (asR.ok) { const a = await asR.json(); setAssets(a.assets || []); }
 if (meR.ok) { const m = await meR.json(); setStoreName(m.storeName || "Your Store"); }
 if (sfR.ok) {
 const d = await sfR.json();
 setHandle(d.settings.handle || ""); setEnabled(!!d.settings.enabled);
 setTagline(d.settings.tagline || ""); setHeroImage(d.settings.heroImage || ""); setAbout(d.settings.about || "");
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
 async function saveDesignCss() {
 setDesignBusy(true); setDesignSaved(false);
 try {
 const css = buildDesignCss(design, designRest);
 const r = await fetch("/api/store/capture/css", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ css }) });
 if (r.ok) { setDesignSaved(true); setPreviewKey((k) => k + 1); }
 } catch { /* leave unsaved */ }
 setDesignBusy(false);
 }

 // Live bridge to the preview iframe: it reports a clicked section's fields; we send edits back.
 useEffect(() => {
 function onMsg(e: MessageEvent) {
 const d = e.data as { vya?: string; index?: number; fields?: PanelField[] };
 if (!d || !d.vya) return;
 if (d.vya === "section") { setPanel({ index: d.index ?? -1, fields: d.fields || [] }); setPanelDirty(false); setPanelSaving(false); }
 else if (d.vya === "unsaved") setPanelDirty(true);
 else if (d.vya === "saved") { setPanel(null); setPanelDirty(false); setPanelSaving(false); }
 }
 window.addEventListener("message", onMsg);
 return () => window.removeEventListener("message", onMsg);
 }, []);

 const postToPreview = (msg: unknown) => editIframe.current?.contentWindow?.postMessage(msg, "*");
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
 function addBlock(type: BlockType) { updateCur((bs) => [...bs, makeBlock(type)]); }
 function removeBlock(id: string) { updateCur((bs) => bs.filter((b) => b.id !== id)); }
 function moveBlock(i: number, dir: -1 | 1) { updateCur((bs) => { const to = i + dir; if (to < 0 || to >= bs.length) return bs; const next = [...bs]; [next[i], next[to]] = [next[to], next[i]]; return next; }); }
 function setBlockProp(id: string, key: string, val: string) { updateCur((bs) => bs.map((b) => (b.id === id ? { ...b, props: { ...b.props, [key]: val } } : b))); }
 function setBlockBg(id: string, bg: string) { updateCur((bs) => bs.map((b) => (b.id === id ? { ...b, style: bg ? { bg } : undefined } : b))); }
 function reorderTo(to: number) { if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; } const from = dragIdx; updateCur((bs) => { const next = [...bs]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; }); setDragIdx(null); }

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
 // Place a photo as the hero and persist it immediately (drag-drop or click).
 async function setHero(url: string) {
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
 const editSrc = `${captured.url || ""}${selPath === "/" ? "" : selPath}?edit=1`;
 let siteHost = "your site";
 try { siteHost = new URL(captured.url || captured.origin || "").host || siteHost; } catch { /* ignore */ }
 return (
 <div className="fixed inset-0 z-[60] flex flex-col bg-[#f4f4f5] text-stone-900">
 <HideGlobalChat />
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
 <button onClick={() => { setShowDesign((v) => !v); setPanel(null); }} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition ${showDesign ? "border-[#5D0F17]/30 bg-[#5D0F17]/[0.04] text-[#5D0F17]" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}><SlidersHorizontal size={14} strokeWidth={2} /><span className="hidden sm:inline">Customize</span></button>
 {captured.url && <a href={captured.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-[#5D0F17] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]"><ExternalLink size={14} strokeWidth={2.25} /><span className="hidden sm:inline">View live</span></a>}
 </div>
 </header>

 {/* Split: chat + framed preview */}
 <div className="flex min-h-0 flex-1">
 {/* Chat dock */}
 <aside className="hidden w-[340px] shrink-0 border-r border-stone-200 sm:block">
 <Sidekick docked />
 </aside>

 {/* Preview */}
 <section className="flex min-w-0 flex-1 flex-col">
 {/* Browser chrome toolbar */}
 <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-2">
 <span className="hidden gap-1.5 pr-1 md:flex"><i className="h-3 w-3 rounded-full bg-stone-200" /><i className="h-3 w-3 rounded-full bg-stone-200" /><i className="h-3 w-3 rounded-full bg-stone-200" /></span>
 <button onClick={() => setPreviewKey((k) => k + 1)} title="Reload preview" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"><RotateCw size={14} strokeWidth={2} /></button>
 <div className="relative shrink-0">
 <HomeIcon size={13} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
 <select value={selPath} onChange={(e) => { setSelPath(e.target.value); setPanel(null); setPreviewKey((k) => k + 1); }} className="cursor-pointer appearance-none rounded-lg border border-stone-200 bg-white py-1.5 pl-8 pr-7 text-[12.5px] font-medium text-stone-700 transition hover:border-stone-300 focus:outline-none">
 {captured.pages.map((p) => <option key={p} value={p}>{pageLabel(p)}</option>)}
 </select>
 <ChevronDown size={13} strokeWidth={2.25} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
 </div>
 <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5">
 <Globe size={12} strokeWidth={2} className="shrink-0 text-stone-400" />
 <span className="truncate text-[12px] text-stone-500">{siteHost}{selPath === "/" ? "" : selPath}</span>
 <span className="ml-auto shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">Live</span>
 </div>
 </div>

 {/* Preview surface */}
 <div className="relative min-h-0 flex-1 bg-[#f4f4f5] p-3">
 <iframe ref={editIframe} key={`${selPath}-${previewKey}`} src={editSrc} className="h-full w-full rounded-lg border border-stone-200 bg-white shadow-sm" title="Page editor" />

 {!panel && !showDesign && (
 <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit rounded-full bg-black/65 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm">Click any text or image to edit · or ask VYA on the left</div>
 )}

 {/* Section edit panel — floating */}
 {panel && (
 <div className="absolute right-6 top-6 z-10 w-80 max-w-[calc(100%-3rem)] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
 <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
 <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Edit section</p>
 <button onClick={() => setPanel(null)} className="text-[13px] text-stone-400 hover:text-[#5D0F17]">✕</button>
 </div>
 <div className="max-h-[65vh] space-y-4 overflow-y-auto px-4 py-4">
 {panel.fields.length === 0 && <p className="text-xs text-stone-400">Nothing text/image to edit here — use the section toolbar (move, duplicate, delete) in the preview, or ask VYA.</p>}
 {panel.fields.map((f, i) => (
 <div key={(f.kind === "text" ? "t" + f.eid : f.kind === "image" ? "i" + f.id : "l" + f.id) + "-" + i}>
 {f.kind === "text" && (
 <>
 <label className="block text-[11px] text-stone-500 mb-1">{fieldLabel(f.tag)}</label>
 <textarea value={f.value} onChange={(e) => { updatePanelField(i, { value: e.target.value }); postToPreview({ vya: "set", kind: "text", eid: f.eid, value: e.target.value }); }} className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-[13px] resize-y min-h-[42px] outline-none focus:border-[#5D0F17]/50" />
 </>
 )}
 {f.kind === "image" && (
 <>
 <label className="block text-[11px] text-stone-500 mb-1">Image</label>
 <div className="flex items-center gap-2.5">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={f.src} alt="" className="h-12 w-12 rounded border border-stone-200 object-cover" />
 <label className="cursor-pointer text-[12px] text-[#5D0F17] underline hover:text-[#5D0F17]/80">Replace<input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) replacePanelImage(i, e.target.files[0]); e.target.value = ""; }} /></label>
 </div>
 </>
 )}
 {f.kind === "link" && (
 <>
 <label className="block text-[11px] text-stone-500 mb-1">Link{f.label ? ` — “${f.label}”` : ""}</label>
 <input value={f.href} onChange={(e) => { updatePanelField(i, { href: e.target.value }); postToPreview({ vya: "set", kind: "link", id: f.id, href: e.target.value }); }} placeholder="https://…  or  /page" className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#5D0F17]/50" />
 </>
 )}
 </div>
 ))}
 {panel.fields.length > 0 && (
 <button onClick={savePanel} disabled={panelSaving || !panelDirty} className="w-full rounded-md bg-[#5D0F17] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#4a0c12] disabled:opacity-50">{panelSaving ? "Saving…" : panelDirty ? "Save changes" : "Saved"}</button>
 )}
 </div>
 </div>
 )}

 {/* Customize — accent + fonts + custom CSS, layered site-wide (right slide-over) */}
 {showDesign && (
 <div className="absolute bottom-0 right-0 top-0 z-20 flex w-[340px] max-w-[88%] flex-col overflow-hidden border-l border-stone-200 bg-white shadow-[0_0_40px_-10px_rgba(0,0,0,0.25)]">
 <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
 <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Customize</p>
 <button onClick={() => setShowDesign(false)} className="text-stone-400 hover:text-[#5D0F17]"><XIcon size={15} /></button>
 </div>
 <div className="flex-1 overflow-y-auto px-4 py-4">
 <label className="block text-[11px] text-stone-500 mb-1">Accent color</label>
 <div className="flex items-center gap-2 mb-3">
 <input type="color" value={design.accent && /^#[0-9a-fA-F]{6}$/.test(design.accent) ? design.accent : "#5D0F17"} onChange={(e) => { setDesign((d) => ({ ...d, accent: e.target.value })); setDesignSaved(false); }} className="h-8 w-10 cursor-pointer border border-stone-200 bg-white p-0.5 shrink-0" title="Recolor buttons & links" />
 {design.accent
  ? <button onClick={() => { setDesign((d) => ({ ...d, accent: null })); setDesignSaved(false); }} className="text-[11px] text-stone-400 underline hover:text-[#5D0F17]">Keep theme</button>
  : <span className="text-[11px] text-stone-400 leading-tight">Pick to recolor buttons &amp; links</span>}
 </div>
 <label className="block text-[11px] text-stone-500 mb-1">Headings</label>
 <select value={design.heading || ""} onChange={(e) => { setDesign((d) => ({ ...d, heading: e.target.value || null })); setDesignSaved(false); }} className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-[12px] mb-3">
 <option value="">Keep theme font</option>
 {HEADING_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
 </select>
 <label className="block text-[11px] text-stone-500 mb-1">Body</label>
 <select value={design.body || ""} onChange={(e) => { setDesign((d) => ({ ...d, body: e.target.value || null })); setDesignSaved(false); }} className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-[12px] mb-3">
 <option value="">Keep theme font</option>
 {BODY_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
 </select>
 <label className="mb-1 block text-[11px] font-medium text-stone-500">Custom CSS</label>
 <p className="mb-1.5 text-[10px] leading-tight text-stone-400">Advanced — layered over your site. Or just ask VYA to make the change.</p>
 <textarea value={designRest} onChange={(e) => { setDesignRest(e.target.value); setDesignSaved(false); }} spellCheck={false} placeholder=".site-header { background: #111; }" className="mb-3 min-h-[120px] w-full resize-y rounded-md border border-stone-300 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-[#5D0F17]/50" />
 <button onClick={saveDesignCss} disabled={designBusy} className="w-full rounded-md bg-[#5D0F17] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#4a0c12] disabled:opacity-50">{designBusy ? "Applying…" : "Apply to my site"}</button>
 {designSaved && <p className="mt-2 text-[11px] text-green-700">Applied ✓ — preview updated</p>}
 {isAdmin && (
 <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
 <button onClick={reSync} disabled={syncBusy} className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-[11px] font-medium text-stone-600 hover:border-[#5D0F17] disabled:opacity-50">{syncBusy ? "Syncing…" : "Re-sync from live site (admin)"}</button>
 {(syncBusy || syncMsg) && <p className={`text-[11px] ${syncBusy ? "text-stone-400" : syncMsg!.startsWith("✓") ? "text-green-700" : "text-amber-700"}`}>{syncBusy ? "Re-crawling — a minute or two…" : syncMsg}</p>}
 <button onClick={async () => { if (!confirm("OWNER RESET: discards the captured site AND deletes all (non-sold) inventory, then switches to the simple design. This can’t be undone — continue?")) return; await fetch("/api/store/capture", { method: "DELETE" }).catch(() => {}); setCaptured(null); }} className="block text-[11px] text-stone-400 underline hover:text-[#5D0F17]">Use the simple design instead (owner)</button>
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 </section>
 </div>
 </div>
 );
 }

 const heroProduct = products[0];
 const gridProducts = products.slice(0, 6);

 return (
 <div className="fixed inset-0 z-[60] flex flex-col bg-[#f4f4f5] text-stone-900">
 <HideGlobalChat />
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
 <div className="mb-6 border border-stone-300 bg-stone-50 p-4">
 <p className="text-[15px] font-semibold mb-1">Start in one click</p>
 <p className="text-xs text-stone-500 mb-3">Let VYA design a full storefront — homepage, About, FAQ &amp; shipping pages — from your products and brand. You can edit everything after.</p>
 <button onClick={generateStorefront} disabled={genBusy} className="w-full bg-[#5D0F17] text-white px-5 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{genBusy ? "VYA is designing your store…" : "Build my storefront with VYA ✨"}</button>
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
 <button key={t.id} onClick={() => applyTemplate(t)} className={`text-left border overflow-hidden transition ${template === t.id ? "border-[#5D0F17] ring-1 ring-[#5D0F17]" : "border-stone-200 hover:border-[#5D0F17]/40"}`}>
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
 <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colors[k]) ? colors[k] : "#000000"} onChange={(e) => { setColors((c) => ({ ...c, [k]: e.target.value })); setSaved(false); }} className="h-9 w-11 cursor-pointer border border-stone-200 bg-white p-0.5 shrink-0" />
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
 <select value={fonts[k]} onChange={(e) => { setFonts((f) => ({ ...f, [k]: e.target.value })); setSaved(false); }} className={input} style={{ fontFamily: ff(fonts[k]) }}>
 {(k === "heading" ? headingFonts : bodyFonts).map((f) => <option key={f} value={f} style={{ fontFamily: ff(f) }}>{f}</option>)}
 </select>
 </div>
 ))}
 </div>

 <div className="flex items-center gap-4">
 <button onClick={saveDesign} disabled={busy} className="bg-[#5D0F17] text-white px-6 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{busy ? "Saving…" : "Save design"}</button>
 {saved && <span className="text-xs text-green-700">Saved ✓</span>}
 {err && <span className="text-xs text-red-700">{err}</span>}
 </div>

 {/* Custom CSS — full control; also where you can see what VYA wrote. */}
 <div className="mt-8 border-t border-stone-200 pt-6">
 <p className={label}>Custom CSS</p>
 <p className="-mt-2 mb-2 text-xs text-stone-400">Advanced — layered over your theme site-wide. Target the storefront classes: <code className="rounded bg-stone-100 px-1">.vya-hero</code>, <code className="rounded bg-stone-100 px-1">.vya-heading</code>, <code className="rounded bg-stone-100 px-1">.vya-cta</code>, <code className="rounded bg-stone-100 px-1">.vya-featured</code>… Or just tell VYA what you want and it writes this for you.</p>
 <textarea value={customCss} onChange={(e) => { setCustomCss(e.target.value); setCssSaved(false); }} spellCheck={false} placeholder=".vya-hero .vya-hero-inner { align-items: flex-start; text-align: left; }" className={`${input} min-h-[140px] resize-y font-mono text-[12px] leading-relaxed`} />
 <div className="mt-3 flex items-center gap-3">
 <button onClick={async () => { setCssBusy(true); setCssSaved(false); const r = await fetch("/api/store/storefront/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customCss }) }).catch(() => null); setCssBusy(false); if (r && r.ok) setCssSaved(true); }} disabled={cssBusy} className="bg-[#5D0F17] text-white px-5 py-2.5 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{cssBusy ? "Applying…" : "Apply CSS"}</button>
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
 {b.type !== "announcement" && b.type !== "hero" && (
 <div>
 <label className="mb-1 block text-[11px] text-stone-500">Background</label>
 <div className="flex items-center gap-1.5">
 {([["", "Default"], ["accent", "Accent"], ["dark", "Dark"]] as const).map(([val, lbl]) => (
 <button key={lbl} onClick={() => setBlockBg(b.id, val)} className={`border px-2.5 py-1 text-[11px] ${curBg === val || (val === "" && !curBg) ? "border-[#5D0F17] text-[#5D0F17]" : "border-stone-200 text-stone-400"}`}>{lbl}</button>
 ))}
 <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(curBg) ? curBg : "#000000"} onChange={(e) => setBlockBg(b.id, e.target.value)} className="h-7 w-9 cursor-pointer border border-stone-200 bg-white p-0.5" title="Custom background color" />
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
 <p className="text-xs text-stone-500 mb-4">Upload photos for your storefront — hero banners, lookbook shots, anything. Then drag one onto the hero in the preview, or hit “Set as hero.”</p>
 <label
 onDragOver={(e) => { e.preventDefault(); }}
 onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) uploadAssets(e.dataTransfer.files); }}
 className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-stone-300 bg-white py-8 text-center cursor-pointer hover:border-[#5D0F17]/40 transition mb-5"
 >
 <span className="text-sm text-stone-600">{assetBusy ? "Uploading…" : "Drop photos here or click to upload"}</span>
 <span className="text-[11px] text-stone-400">JPG / PNG, up to 15MB each</span>
 <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) uploadAssets(e.target.files); e.target.value = ""; }} />
 </label>
 {assets.length ? (
 <>
 <p className="text-[11px] text-stone-400 mb-2">Drag a photo onto the hero in the preview →</p>
 <div className="grid grid-cols-3 gap-2">
 {assets.map((a) => (
 <div key={a.url} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.url); e.dataTransfer.effectAllowed = "copy"; }} className="group relative aspect-square overflow-hidden border border-stone-200 cursor-grab active:cursor-grabbing">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={a.url} alt="" className="h-full w-full object-cover pointer-events-none" />
 <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-1.5" style={{ background: "rgba(0,0,0,0.35)" }}>
 <button onClick={() => deleteAsset(a.url)} className="self-end h-5 w-5 rounded-full bg-white/90 text-[#5D0F17] text-xs leading-none">×</button>
 <button onClick={() => setHero(a.url)} className="bg-white/90 text-[#5D0F17] py-1 text-[10px] uppercase tracking-[0.12em]">Set as hero</button>
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
 <span className="inline-flex items-center bg-stone-100 border border-r-0 border-stone-200 px-3 text-sm text-stone-400">vyaplatform.com/s/</span>
 <input className={`${input} rounded-none`} value={handle} onChange={(e) => { setHandle(e.target.value); setSaved(false); }} placeholder="your-store" />
 </div>
 </div>
 <div className="mb-5">
 <label className={label}>Tagline</label>
 <input className={input} value={tagline} onChange={(e) => { setTagline(e.target.value); setSaved(false); }} placeholder="Curated vintage, one-of-one." maxLength={120} />
 </div>
 <div className="mb-5">
 <label className={label}>Hero image URL <span className="text-stone-300">(optional)</span></label>
 <input className={input} value={heroImage} onChange={(e) => { setHeroImage(e.target.value); setSaved(false); }} placeholder="https://…/banner.jpg" />
 </div>
 <div className="mb-7">
 <label className={label}>About <span className="text-stone-300">(optional)</span></label>
 <textarea className={`${input} min-h-[90px] resize-y`} value={about} onChange={(e) => { setAbout(e.target.value); setSaved(false); }} placeholder="A line or two about your store." maxLength={1000} />
 </div>
 <div className="flex items-center gap-4">
 <button onClick={saveDetails} disabled={busy} className="bg-[#5D0F17] text-white px-6 py-3 text-[13px] font-medium hover:bg-[#5D0F17]/85 transition disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
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
 <p className="font-mono text-sm truncate">vyaplatform.com/s/{handle || "your-store"}</p>
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
 {/* Browser chrome toolbar */}
 <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-stone-200 bg-white px-3 py-2">
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
 {handle && <a href={`/s/${handle}${activeSlug !== "home" ? `/${activeSlug}` : ""}?preview=1`} target="_blank" rel="noopener noreferrer" title="Open in new tab" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"><ExternalLink size={14} strokeWidth={2} /></a>}
 </div>

 {/* the storefront, live */}
 <div className="overflow-hidden rounded-b-xl border border-stone-200 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]" style={{ background: colors.bg, color: colors.text, fontFamily: ff(fonts.body) }}>
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
 {shopBlocks.length > 0 && <Blocks blocks={shopBlocks} colors={colors} fonts={fonts} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={selectBlock} selectedId={selBlock} />}
 {/* the product grid (auto — your live catalogue) */}
 <div className="mx-auto max-w-6xl px-6 py-16">
 <div className="mb-8 text-center">
 <span className="mb-2 block text-[10px] uppercase tracking-[0.3em] opacity-40">Catalogue</span>
 <h2 className="text-3xl" style={{ fontFamily: ff(fonts.heading) }}>Shop</h2>
 </div>
 {products.length > 0 ? (
 <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
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
 <Blocks blocks={curBlocks} colors={colors} fonts={fonts} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={selectBlock} selectedId={selBlock} />
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
 <div className="grid grid-cols-3 gap-x-4 gap-y-7">
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
 <div className="grid grid-cols-3 gap-4">
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
