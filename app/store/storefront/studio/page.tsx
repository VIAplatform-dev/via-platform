"use client";

// Chat-first storefront studio (tracks 1–3).
// The builder: describe it to VYA on the left; on the right, a LIVE, EDITABLE preview of the
// store. Text is click-to-edit inline, sections drag to reorder, and a page dropdown switches
// which page you're editing — all on the same canvas the assistant edits. Reuses the existing
// Blocks renderer (edit mode) + the design API. Every change autosaves; VYA's changes reload it.

import { useCallback, useEffect, useRef, useState } from "react";
import Sidekick from "../../Sidekick";
import Blocks from "@/app/s/Blocks";
import { makeBlock, pageSlugify, type Block, type StorePage } from "@/app/lib/storefront-blocks";
import { STOREFRONT_TEMPLATES, templateBlocks, type StorefrontTemplate } from "@/app/lib/storefront-templates";
import { ChevronLeft, Monitor, Tablet, Smartphone, ExternalLink, ChevronDown, Plus, X, Check, LayoutTemplate } from "lucide-react";

type Colors = { bg: string; text: string; accent: string };
type Fonts = { heading: string; body: string };
type Product = { title: string; price: number | null; currency: string; image: string };
type Device = "desktop" | "tablet" | "phone";
type Settings = { handle: string; enabled: boolean; tagline: string | null; accentColor: string | null; heroImage: string | null; about: string | null };

const SERIFS = new Set(["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces"]);
const ff = (name?: string) => (name ? `'${name}', ${SERIFS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);
const money = (c: number | null, cur: string) => (c == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(c));

export default function StorefrontStudio() {
 const [settings, setSettings] = useState<Settings | null>(null);
 const [storeName, setStoreName] = useState("Your store");
 const [colors, setColors] = useState<Colors>({ bg: "#FFFDF8", text: "#1a1a1a", accent: "#5D0F17" });
 const [fonts, setFonts] = useState<Fonts>({ heading: "Playfair Display", body: "Inter" });
 const [products, setProducts] = useState<Product[]>([]);
 const [blocks, setBlocks] = useState<Block[]>([]);
 const [shopBlocks, setShopBlocks] = useState<Block[]>([]);
 const [extraPages, setExtraPages] = useState<StorePage[]>([]);
 const [customCss, setCustomCss] = useState("");
 const [activeSlug, setActiveSlug] = useState("home");
 const [selBlock, setSelBlock] = useState<string | null>(null);
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
 function switchPage(slug: string) { setActiveSlug(slug); setSelBlock(null); setFmtBar(null); setDdOpen(false); }
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
 <a href="/store/storefront" title="Back to the classic editor" className="grid h-7 w-7 place-items-center rounded-lg border border-black/10 text-stone-500 transition hover:bg-stone-100"><ChevronLeft size={16} /></a>
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

 {/* Body: chat (primary) + editable live preview */}
 <div className="flex min-h-0 flex-1">
 <div className="w-[400px] max-w-[42vw] shrink-0 overflow-hidden border-r border-black/10"><Sidekick docked /></div>

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
 <div ref={canvasRef} className="min-h-0 flex-1 overflow-y-auto" style={{ background: colors.bg }}>
 {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
 {curBlocks.length > 0 ? (
 <Blocks blocks={curBlocks} colors={colors} fonts={fonts} products={products.map((p) => ({ title: p.title, price: money(p.price, p.currency), image: p.image }))} onSelect={setSelBlock} selectedId={selBlock} edit onEditField={editField} reorder={canvasReorder} />
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
