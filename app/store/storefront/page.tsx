"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useInSiteDialog } from "@/app/components/InSiteDialog";
import { withStore } from "@/app/infrastructure/admin/market/ui";
import { applyPageOrder, movePage } from "@/app/lib/page-order";
import { SECTION_CATEGORIES, categoryFor, variantGroup } from "@/app/lib/storefront-variants";
import Blocks from "@/app/s/Blocks";
import Sidekick from "../Sidekick";
import { useStoreBase } from "../nav-base";
import { RotateCw, Globe, ChevronDown, ChevronLeft, ChevronRight, Home as HomeIcon, Copy, Check, ExternalLink, SlidersHorizontal, GripVertical, ChevronUp, X as XIcon, Plus, Monitor, Tablet, Smartphone, AlignLeft, AlignCenter, AlignRight, Palette, Sparkles, Undo2, Redo2, Trash2, Layers, Shapes, Type, Upload as UploadIcon, Image as ImageIcon, Minus, MousePointerClick } from "lucide-react";
import { makeBlock, pageSlugify, type Block, type BlockDef, type BlockType, type BlockStyle, type BlockScale, type StorePage } from "@/app/lib/storefront-blocks";
import { parseDesign, buildDesignCss, type DesignSettings, type Radius, type ThemeModel } from "@/app/lib/captured-design";
import { STOREFRONT_PALETTES } from "@/app/lib/storefront-templates";
import { ColorSwatch, ColorDot } from "@/app/store/storefront/ColorPicker";
import SectionThumb from "@/app/store/storefront/SectionThumb";
import { resolveLinkTarget } from "@/app/lib/link-target";
import { ProductFieldsEditor } from "./ProductFieldsEditor";
import { resolveProductPage, reorderFields, type ProductPageConfig, type ProductFieldKey, type ProductField } from "@/app/lib/storefront-product-page";
import { orderFieldsForPanel, splitFocusedFields } from "@/app/lib/panel-field-order";
// Imported-site builder, Step 2: product grids, hide/show, undo that survives save.
import { Eye, EyeOff, Files } from "lucide-react";
import GridPanel, { type GridCollection } from "./GridPanel";
import { parseGridConfig, type GridConfig } from "@/app/lib/site-builder/grid-config";
// Step 3: the Pages rail — menu order, rename, hide, add.
import PagesPanel, { type PageEntryView } from "./PagesPanel";

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
const money = (c: number | null, cur: string) => (c == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(c / 100));

export default function StorefrontEditor() {
 const dialog = useInSiteDialog();
 const base = useStoreBase();
 const [loading, setLoading] = useState(true);
 const [tab, setTab] = useState<"design" | "sections" | "assets" | "details" | "domain">("sections");
 const [storeName, setStoreName] = useState("Your Store");
 const [capTab, setCapTab] = useState<"design" | "sections" | "pages" | "elements" | "text" | "uploads" | "assist">("design"); // captured-mode left rail — 1:1 with the from-scratch studio
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
 // The faces her OWN imported site is set in (app/lib/plan-b/font-detect.ts). The picker used to
 // offer a curated Google list and nothing else, so the one font she certainly wanted — the one her
 // shop is already in — was the one it did not have.
 const [siteFonts, setSiteFonts] = useState<{ family: string; face: boolean }[]>([]);
 // WHAT EACH PIECE'S PAGE SAYS. The same theme.productPage the block builder edits — one setting, and
 // until now only reachable from an editor a seller with her own site never opens. It governs the
 // pages VYA renders for pieces she adds here (a piece with no Shopify handle of its own); her
 // imported products keep their captured page, whose design is the Product page in the page list.
 const [productPage, setProductPage] = useState<ProductPageConfig>(() => resolveProductPage(null));
 const [productPageSaved, setProductPageSaved] = useState(true);
 const saveProductPage = useCallback(async (next: ProductPageConfig) => {
  setProductPage(next); setProductPageSaved(false);
  const r = await fetch(withStore("/api/store/storefront/design"), {
   method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productPage: next }),
  }).catch(() => null);
  setProductPageSaved(!!r?.ok);
 }, []);
 const setProductField = (key: ProductFieldKey, patch: Partial<ProductField>) =>
  void saveProductPage({ ...productPage, fields: productPage.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
 const moveProductField = (from: number, to: number) =>
  void saveProductPage({ ...productPage, fields: reorderFields(productPage.fields, from, to) });

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
 const [captured, setCaptured] = useState<{ count: number; url: string | null; slug: string | null; origin: string | null; pages: string[]; unlinked: string[]; productTemplate: string | null; productCount: number } | null>(null);
 // The pages strip opens as one scrolling row (fine for a five-page site, useless for eighty-two).
 // Expanded, it becomes a wrapping grid — the same "see everything at once" the block Studio has.
 const [pagesOpen, setPagesOpen] = useState(false);
 // Zoom on the preview, also matching the Studio. A captured page is a real site at real width, so
 // zooming out is the only way to see a whole long homepage while editing it.
 const [zoom, setZoom] = useState(100);
 const surfaceRef = useRef<HTMLDivElement | null>(null);
 const [secQ, setSecQ] = useState(""); // Layout rail search, matching the Studio
 // The selected piece of text, reported by the page. Its controls live in the SAME floating bar as
 // the section's — there used to be a second bar drawn inside the page, sitting on top of the very
 // words you were editing.
 // `btn`: the fill of the button this text is the label of ("" for an outline button), or null when it
 // isn't a button's label — which is what decides whether Button colour is offered.
 const [txtSel, setTxtSel] = useState<{ eid: number; color: string; align: string; top: number; btn: string | null } | null>(null);
 // The element last clicked ON THE PAGE. It does two jobs: the panel opens on that element's
 // fields rather than the whole section, and the field is scrolled to and focused once.
 const [focusEid, setFocusEid] = useState<number | null>(null);
 // Where she clicked inside that text, as an offset into its field's value, so the cursor lands in the
 // box where it landed on the page. Null = unknown, which puts it at the end, never at the front.
 const focusCaret = useRef<number | null>(null);
 const [scrollEid, setScrollEid] = useState<number | null>(null);
 // Everything in this section, not just the clicked element — opened on demand.
 const [showAllFields, setShowAllFields] = useState(false);
 // A text box / image / button she added INSIDE a section. While one is selected the section panel's
 // Duplicate and Delete act on it, not on the whole band — deleting a text box used to take the
 // section it sat in with it.
 const [inlineKind, setInlineKind] = useState<string | null>(null);
 // Which PICTURE she clicked. A collection tile is a photograph, so without this the panel answered
 // one click with every image in the row.
 const [focusImg, setFocusImg] = useState<number | null>(null);
 // The inventory piece the clicked text belongs to, when it belongs to one. A product card
 // regenerates its name, price and photo from Inventory on every page load, so a text box over them
 // is a box that lies — she gets the piece instead. See plan-b/product-card-identity.ts.
 const [focusItem, setFocusItem] = useState<{ id: string; title: string } | null>(null);
 // What the selected section IS, reported by the builder's script: a block she added, or one of her
 // captured sections (which Hide rather than delete), and whether it is hidden. `gridSel` is the product
 // grid the Grid panel is editing. See app/lib/site-builder/editor-additions.ts.
 const [secInfo, setSecInfo] = useState<{ block: boolean; hidden: boolean } | null>(null);
 const [gridSel, setGridSel] = useState<{ id: string; config: GridConfig; kit: "theme" | "simple" | null; empty: boolean } | null>(null);
 const [gridCollections, setGridCollections] = useState<GridCollection[] | null>(null);
 const [gridRefresh, setGridRefresh] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
 // ── HER PAGES (Step 3) — the Pages rail and the ✕ on each thumbnail ───────────────────────────
 const [pagesList, setPagesList] = useState<PageEntryView[]>([]);
 const [pagesMenu, setPagesMenu] = useState<{ items: { id: string; label: string; href: string; hidden?: boolean }[]; signature: string } | null>(null);
 const [pagesReady, setPagesReady] = useState(true); // false until the owner has run the migration
 const [pagesDrifted, setPagesDrifted] = useState(false);
 const [pagesBusy, setPagesBusy] = useState(false);
 const [pagesNote, setPagesNote] = useState<string | null>(null);
 const [pagesStale, setPagesStale] = useState(0); // bump to re-read the list after a change
 const pageDrag = useRef<string | null>(null);
 // Which page the ✕ is asking about. Hiding is reversible and is the first choice; deleting for good
 // is the second, and is why this is a small dialog of its own rather than a plain confirm.
 const [removeAsk, setRemoveAsk] = useState<PageEntryView | null>(null);
 // A short word next to Undo after it stepped back through a SAVED version (the page's own undo stack is
 // gone once a save reloads it).
 const [undoNote, setUndoNote] = useState<string | null>(null);
 // Her own arrangement of the strip. Housekeeping — it moves thumbnails in HER editor and nothing
 // on her site — so it saves immediately with no draft or publish step attached.
 const [pageOrder, setPageOrder] = useState<string[] | null>(null);
 const dragFrom = useRef<string | null>(null);
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
 const [selImg, setSelImg] = useState<{ id: number; src: string; linkId: number | null; href: string; linkLabel: string; tile: boolean } | null>(null);
 const [assetsBusy, setAssetsBusy] = useState(false);
 const [capStatus, setCapStatus] = useState<"saved" | "unsaved" | "saving">("saved"); // captured-editor save state (from the iframe)
 // `btn`: the section's own button colour ("" = buttons with no fill), or null/absent when it has no
 // buttons. `btnSet`: she chose one in this session, which is when "reset" is offered.
 const [secStyle, setSecStyle] = useState<{ bg?: string; color?: string; align?: string; btn?: string | null; btnSet?: boolean }>({}); // selected captured section's style
 const [secRect, setSecRect] = useState<{ top: number; cx: number } | null>(null); // selected section position (iframe coords) → floating bar

 // Global design for a captured site: accent + fonts, layered over the theme via custom CSS.
 const [design, setDesign] = useState<DesignSettings>({ accent: null, heading: null, body: null, bg: null, text: null, radius: null });
 const [designRest, setDesignRest] = useState(""); // any other custom CSS (e.g. VYA-assistant-added) to preserve
 const [designLoaded, setDesignLoaded] = useState(false); // guard: don't auto-save until the server design is in
 const [customCss, setCustomCss] = useState(""); // block-mode: raw custom CSS (AI- or hand-written), layered over the theme
 const [cssBusy, setCssBusy] = useState(false);
 const [cssSaved, setCssSaved] = useState(false);
 const [designSaved, setDesignSaved] = useState(false);
 // What the store's custom-CSS row holds, as this editor last read or wrote it: the only base a design save
 // may replace (the server refuses any other). null = it never loaded, so nothing here may be saved.
 const designBase = useRef<string | null>(null);
 const designTouched = useRef(false); // she changed something here — opening the editor alone never writes
 const designCss = useRef<string | null>(null); // what the preview shows; re-sent whenever the frame reloads
 const designQueue = useRef<Promise<void>>(Promise.resolve());
 const [capTheme, setCapTheme] = useState<ThemeModel | null>(null); // how the captured theme sets its colours
 const [designNote, setDesignNote] = useState<string | null>(null);
 const [designOutdated, setDesignOutdated] = useState(false); // saved before the design could reach her theme's colours

 useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const [meR, sfR, dsR, domR, asR, capR, cssR] = await Promise.all([
 fetch(withStore("/api/store/me")),
 fetch(withStore("/api/store/storefront")),
 fetch(withStore("/api/store/storefront/design")),
 fetch(withStore("/api/store/domain")),
 fetch(withStore("/api/store/assets")),
 fetch(withStore("/api/store/capture")),
 fetch(withStore("/api/store/capture/css")),
 ]);
 if (cancelled) return;
 if (capR.ok) { const c = await capR.json(); setIsAdmin(!!c.isAdmin); if (c.captured > 0) setCaptured({ count: c.captured, url: c.url, slug: c.slug || null, origin: c.origin, pages: c.pages || [], unlinked: c.unlinked || [], productTemplate: c.productTemplate || null, productCount: c.productCount || 0 }); }
   fetch(withStore("/api/store/storefront/page-order")).then((r) => (r.ok ? r.json() : null)).then((d) => setPageOrder(Array.isArray(d?.order) ? d.order : [])).catch(() => setPageOrder([]));
 if (cssR.ok) {
  const { css, theme } = await cssR.json(); const { settings, rest } = parseDesign(css || "");
  setDesign(settings); setDesignRest(rest); setCapTheme(theme || null); designBase.current = css || "";
  setDesignOutdated(!!theme && Object.values(settings).some(Boolean) && buildDesignCss(settings, rest, theme) !== String(css).trim());
 } else setDesignNote("Couldn’t load your site’s design, so changes here can’t be saved. Reload the page to try again.");
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
 setTemplates(d.templates || []); setHeadingFonts(d.headingFonts || []); setBodyFonts(d.bodyFonts || []); setSiteFonts(d.siteFonts || []); setProductPage(resolveProductPage(d.productPage));
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

 // Pinch-to-zoom on the trackpad.
 //
 // macOS reports a two-finger pinch as a wheel event with ctrlKey set — that is how every canvas
 // app detects it, and it is the same event a mouse produces with Ctrl (or Cmd) held. Without
 // preventDefault the browser zooms the whole application instead, which is what "the zoom doesn't
 // work" actually looked like: the gesture was being handled, just by Chrome rather than by us.
 //
 // The listener has to go INSIDE the frame as well as around it. A wheel over an iframe is
 // delivered to that iframe's own document, so a parent-only listener never sees the gesture over
 // the one thing you are trying to zoom. The preview is same-origin by design (see editSrc), which
 // is what makes reaching into contentDocument possible at all.
 useEffect(() => {
  const onWheel = (e: WheelEvent) => {
   if (!e.ctrlKey && !e.metaKey) return; // an ordinary scroll must still scroll the page
   e.preventDefault();
   // The same exponential curve the Studio uses (studio/page.tsx:630), so the gesture feels the
   // same in both editors. Multiplying rather than adding is what makes a pinch feel right: a
   // fixed step is sluggish at 100% and violent at 20%, because the same 10 points is a tenth of
   // one and half of the other.
   setZoom((z) => Math.min(130, Math.max(20, Math.round(z * Math.exp(-e.deltaY / 220)))));
  };
  const surface = surfaceRef.current;
  surface?.addEventListener("wheel", onWheel, { passive: false });

  // The frame's document is replaced on every reload, so re-attach whenever it changes.
  let inner: Document | null = null;
  const attachInner = () => {
   try {
    const doc = editIframe.current?.contentDocument ?? null;
    if (!doc || doc === inner) return;
    inner?.removeEventListener("wheel", onWheel);
    doc.addEventListener("wheel", onWheel, { passive: false });
    inner = doc;
   } catch { /* a cross-origin frame simply doesn't get the gesture — the surface still does */ }
  };
  attachInner();
  const poll = window.setInterval(attachInner, 600);

  return () => {
   surface?.removeEventListener("wheel", onWheel);
   try { inner?.removeEventListener("wheel", onWheel); } catch { /* document already gone */ }
   window.clearInterval(poll);
  };
 }, []);

 // On a phone the 1280px canvas opened at 100%, which is a quarter of the page and a sideways scroll.
 // Start it zoomed to the width of the surface instead. Presentation only, once, and only under 768 —
 // the slider and pinch still reach anywhere from 20% to 130%.
 const phoneFitted = useRef(false);
 useEffect(() => {
  const surface = surfaceRef.current;
  if (phoneFitted.current || !surface || window.innerWidth >= 768) return;
  phoneFitted.current = true;
  const id = requestAnimationFrame(() => setZoom(Math.max(20, Math.min(100, Math.floor(((surface.clientWidth - 32) / 1280) * 100)))));
  return () => cancelAnimationFrame(id);
 });

 // The Sidekick can change the design — refresh the editor + preview when it does.
 useEffect(() => {
 function onUpdate() {
 setPreviewKey((k) => k + 1); // reload the captured-site preview after a VYA edit
 (async () => {
 try {
 const [sfR, dsR] = await Promise.all([fetch(withStore("/api/store/storefront")), fetch(withStore("/api/store/storefront/design"))]);
 if (sfR.ok) { const d = await sfR.json(); setTagline(d.settings.tagline || ""); setHeroImage(d.settings.heroImage || ""); }
 if (dsR.ok) { const d = await dsR.json(); setTemplate(d.template); setColors(d.colors); setFonts(d.fonts); setBlocks(d.blocks || []); setShopBlocks(d.shopBlocks || []); setExtraPages(d.extraPages || []); setCustomCss(d.customCss || ""); }
 // VYA may have restyled the captured site. Take its CSS unless she has unsaved design changes — then
 // her save is refused as a conflict and loads it instead of erasing it.
 if (!designTouched.current) { const cR = await fetch(withStore("/api/store/capture/css")); const c = cR.ok ? await cR.json() : null; if (c && typeof c.css === "string" && !designTouched.current) loadDesignCss(c.css); }
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
 const r = await fetch(withStore("/api/store/storefront/generate"), { method: "POST" });
 const d = await r.json();
 if (!r.ok) { setGenErr(d.error || "Couldn’t generate — try again."); setGenBusy(false); return; }
 const dsR = await fetch(withStore("/api/store/storefront/design"));
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
 const r = await fetch(withStore("/api/store/capture"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: captured.origin }) });
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
 //
 // Only what SHE changes is saved. This used to post the loaded design straight back on every open, so a
 // load that came back empty wrote "" over the store's CSS; now nothing is written until a control moves.
 const designSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 useEffect(() => {
 if (!captured || !designLoaded) return;
 const base = designBase.current;
 // Until she edits, the preview shows exactly what shoppers get: the stored CSS, not a rebuild of it.
 const css = designTouched.current ? buildDesignCss(design, designRest, capTheme) : (base ?? "");
 designCss.current = css;
 postToPreview({ vya: "css", css });
 if (!designTouched.current || base === null) return;
 setDesignSaved(false);
 if (designSaveTimer.current) clearTimeout(designSaveTimer.current);
 designSaveTimer.current = setTimeout(() => { designQueue.current = designQueue.current.then(saveDesignCss); }, 650);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [design, designRest, captured, designLoaded, capTheme]);
 // One save at a time, each against the base the previous one left: overlapping saves would race, and
 // the second would be refused as a conflict with the first.
 async function saveDesignCss() {
 const css = designCss.current, base = designBase.current;
 if (css === null || base === null) return;
 if (css === base) { setDesignSaved(true); return; }
 try {
  const r = await fetch(withStore("/api/store/capture/css"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ css, base }) });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
   designBase.current = css;
   if (designCss.current === css) designTouched.current = false;
   setDesignSaved(true); setDesignNote(null); setDesignOutdated(false);
  } else if (r.status === 409 && typeof d.css === "string") {
   // Changed elsewhere (VYA, another tab) since this editor read it: show that version, never save over it.
   loadDesignCss(d.css);
   setDesignNote("Your design was changed somewhere else (maybe by VYA), so we loaded that version instead of saving over it. Make your change again.");
  } else setDesignNote(d.error || "Couldn’t save your design. Try again.");
 } catch { setDesignNote("Couldn’t save your design. Check your connection and try again."); }
 }
 function loadDesignCss(css: string) {
 if (designSaveTimer.current) clearTimeout(designSaveTimer.current);
 designTouched.current = false; designBase.current = css;
 const p = parseDesign(css); setDesign(p.settings); setDesignRest(p.rest); setDesignSaved(false);
 }
 // The preview is served WITHOUT the stored CSS (edit mode), so the design is in the frame only once sent,
 // and every reload (a page switch, Reload, a save) starts a new document. The frame's load event was too
 // late: it waits on every image and theme pixel, and after a reload the design came back late or never.
 // Send it as soon as each new document's editor script has run (#vya-save exists).
 useEffect(() => {
 let sentTo: Document | null = null;
 const id = window.setInterval(() => {
  try {
   const doc = editIframe.current?.contentDocument;
   if (!doc || doc === sentTo || designCss.current === null || !doc.getElementById("vya-save")) return;
   sentTo = doc;
   postToPreview({ vya: "css", css: designCss.current });
  } catch { /* allow-swallow: frame mid-navigation — the next tick tries again */ }
 }, 300);
 return () => window.clearInterval(id);
 }, []);
 // Undo/redo shortcuts for the captured editor — forwarded into the preview iframe. (When you're typing
 // in the iframe the browser handles ⌘Z natively; this covers the rest + the top-bar buttons.)
 useEffect(() => {
 if (!captured) return;
 const onKey = (e: KeyboardEvent) => {
 if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
 const t = e.target as HTMLElement | null;
 if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
 e.preventDefault();
 // "undoany": the page's own undo while it has anything, else the last SAVE is undone (see undoempty below).
 postToPreview({ vya: e.shiftKey ? "redo" : "undoany" });
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [captured]);
 // Studio-parity Design handlers, wired to the captured CSS layer.
 const setDesignField = (patch: Partial<DesignSettings>) => { designTouched.current = true; setDesign((d) => ({ ...d, ...patch })); setDesignSaved(false); };
 const applyCapPalette = (c: { bg: string; text: string; accent: string }) => setDesignField({ bg: c.bg, text: c.text, accent: c.accent });
 const capPaletteActive = (c: { bg: string; text: string; accent: string }) => design.bg === c.bg && design.text === c.text && design.accent === c.accent;

 // Live bridge to the preview iframe: it reports a clicked section's fields; we send edits back.
 useEffect(() => {
 function onMsg(e: MessageEvent) {
 const d = e.data as { vya?: string; index?: number; fields?: PanelField[]; path?: string; id?: number; src?: string; style?: { bg?: string; color?: string; align?: string }; rect?: { top: number; cx: number } };
 if (!d || !d.vya) return;
 if (d.vya === "section") { setPanel({ index: d.index ?? -1, fields: d.fields || [] }); setSelImg(null); setSecStyle(d.style || {}); setSecRect(d.rect || null); setPanelDirty(false); setPanelSaving(false); setSecInfo(null); setGridSel(null); }
 else if (d.vya === "secrect") setSecRect({ top: (d as { top: number }).top, cx: (d as { cx: number }).cx });
 // Escape inside the page backs out of everything — the panel here has to follow, or the rail goes
 // on editing a section the page no longer thinks is selected.
 else if (d.vya === "deselect") { setPanel(null); setSelImg(null); setSecRect(null); setTxtSel(null); setSecInfo(null); setGridSel(null); }
 else if (d.vya === "textsel") {
  const t = d as unknown as { eid: number; color?: string; align?: string; top?: number; caret?: unknown; btn?: unknown };
  setTxtSel(t.eid >= 0 ? { eid: t.eid, color: t.color || "", align: t.align || "", top: t.top ?? 0, btn: typeof t.btn === "string" ? t.btn : null } : null);
  focusCaret.current = typeof t.caret === "number" && t.caret >= 0 ? t.caret : null;
  // …and take the panel to that field. The canvas has always reported which element was clicked;
  // the panel just never used it, so finding the words you'd tapped meant scrolling a list where
  // every link is labelled the same. Clicking "Make an appointment here." on the page now puts
  // the cursor in its box — and its address is the next box down (panel-field-order.ts).
  if (t.eid >= 0) { setFocusEid(t.eid); setScrollEid(t.eid); setShowAllFields(false); setFocusImg(null); }
  else setFocusEid(null);
  const it = d as { item?: unknown; itemTitle?: unknown };
  setFocusItem(typeof it.item === "string" && it.item ? { id: it.item, title: typeof it.itemTitle === "string" ? it.itemTitle : "" } : null);
 }
 else if (d.vya === "imgsel" && typeof d.id === "number") {
  const lk = d as { linkId?: unknown; href?: unknown; linkLabel?: unknown };
  setSelImg({
   id: d.id, src: d.src || "",
   linkId: typeof lk.linkId === "number" ? lk.linkId : null,
   href: typeof lk.href === "string" ? lk.href : "",
   linkLabel: typeof lk.linkLabel === "string" ? lk.linkLabel : "",
   tile: (d as { tile?: unknown }).tile === true,
  });
  setPanel(null); setFocusImg(d.id); setShowAllFields(false);
  const im = d as { item?: unknown; itemTitle?: unknown };
  setFocusItem(typeof im.item === "string" && im.item ? { id: im.item, title: typeof im.itemTitle === "string" ? im.itemTitle : "" } : null);
 }
 else if (d.vya === "inline") { const k = (d as { kind?: unknown }).kind; setInlineKind(typeof k === "string" ? k : null); }
 else if (d.vya === "unsaved") { setPanelDirty(true); setCapStatus("unsaved"); }
 else if (d.vya === "saved") { setPanelDirty(false); setPanelSaving(false); setCapStatus("saved"); }
 else if (d.vya === "status") { const s = (d as { text?: string }).text; setCapStatus(s === "Saving…" ? "saving" : s === "Unsaved changes" ? "unsaved" : "saved"); }
 // ── The builder's own messages (app/lib/site-builder/editor-additions.ts) ──
 // Sent right after "section": what the selected section is, and its grid settings when it is a grid.
 else if (d.vya === "secinfo") {
  const s = d as unknown as { block?: unknown; hidden?: unknown; grid?: { id?: unknown; config?: unknown } | null; item?: unknown; itemTitle?: unknown };
  setSecInfo({ block: s.block === true, hidden: s.hidden === true });
  const gid = s.grid && typeof s.grid.id === "string" ? s.grid.id : null;
  if (gid) {
   const config = parseGridConfig(s.grid!.config);
   setGridSel((g) => (g && g.id === gid ? { ...g, config } : { id: gid, config, kit: null, empty: false }));
   setFocusItem(typeof s.item === "string" && s.item ? { id: s.item, title: typeof s.itemTitle === "string" ? s.itemTitle : "" } : null);
  } else setGridSel(null);
 }
 // A grid finished rendering: which card it got, and whether its collection is empty.
 else if (d.vya === "gridstate") {
  const g = d as unknown as { id?: unknown; config?: unknown; kit?: unknown; empty?: unknown };
  if (typeof g.id === "string") setGridSel((cur) => (cur && cur.id === g.id ? { ...cur, config: parseGridConfig(g.config), kit: g.kit === "theme" || g.kit === "simple" ? g.kit : null, empty: g.empty === true } : cur));
 }
 // Undo with nothing left in the page's own stack: step back through her saved versions instead.
 else if (d.vya === "undoempty") {
  const p = (d as { path?: unknown }).path;
  if (typeof p === "string") {
   setCapStatus("saving");
   fetch(withStore("/api/store/capture/undo"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) })
    .then(async (r) => {
     const j = await r.json().catch(() => ({})); /* allow-swallow: an unreadable answer reads as "nothing to undo" */
     setCapStatus("saved");
     if (r.ok && j.ok) { setUndoNote("Undid your last save"); setPreviewKey((k) => k + 1); }
     else setUndoNote(typeof j.error === "string" ? j.error : "Nothing left to undo on this page.");
    })
    .catch(() => { setCapStatus("saved"); setUndoNote("Couldn’t undo just now."); })
    .finally(() => { setTimeout(() => setUndoNote(null), 4000); });
  }
 }
 // "More layouts…" from the + between sections: the Layout rail's next pick lands in that seam.
 else if (d.vya === "openlayout") { setPanel(null); setSelImg(null); setCapTab("sections"); setCapPanelOpen(true); }
 // The bar on a hidden page's own editor — "Show" puts it back for shoppers. Written straight from
 // here rather than through the Pages panel, because she is standing on the page she means.
 else if (d.vya === "showpage") {
  const p = (d as { path?: unknown }).path;
  if (typeof p === "string") {
   fetch(withStore("/api/store/capture/pages"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p, hidden: false }) })
    .then((r) => { if (r.ok) { setPagesStale((n) => n + 1); setPreviewKey((k) => k + 1); } })
    .catch(() => { /* allow-swallow: the bar stays where it is, and she can press it again */ });
  }
 }
 }
 window.addEventListener("message", onMsg);
 return () => window.removeEventListener("message", onMsg);
 }, []);

 // Switch the editor to another captured page. Same move the canvas makes when she clicks an
 // internal link, so the panel's "go to this page" button and the click land in the same place.
 // THE PIECE BEHIND A PRODUCT CARD.
 //
 // A card in the editor is captured markup, but a shopper's page rebuilds it from Inventory every
 // time it loads — so the name and price shown here are a photograph of something that has moved on,
 // and typing over them would be thrown away. The panel asks Inventory what the piece says now and
 // writes her changes back there, which is the only place an edit to a product can actually live.
 const [itemDraft, setItemDraft] = useState<{ id: string; title: string; price: string; images: string[] } | null>(null);
 const [itemState, setItemState] = useState<"idle" | "loading" | "saving" | "saved">("idle");
 useEffect(() => {
  const id = focusItem?.id;
  if (!id) { setItemDraft(null); setItemState("idle"); return; }
  let live = true;
  setItemState("loading");
  fetch(withStore(`/api/store/items/${encodeURIComponent(id)}`))
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => {
    if (!live) return;
    const it = d?.item;
    if (!it) { setItemDraft(null); setItemState("idle"); return; }
    setItemDraft({ id: it.id, title: it.title || "", price: ((it.priceCents ?? 0) / 100).toFixed(2), images: it.images || [] });
    setItemState("idle");
   })
   .catch(() => { if (live) setItemState("idle"); });
  return () => { live = false; };
 }, [focusItem?.id]);

 // Saved on blur rather than on every keystroke: this writes to her real inventory, and a request
 // per character would be a request per character.
 async function saveItem(patch: Record<string, unknown>) {
  const id = itemDraft?.id;
  if (!id) return;
  setItemState("saving");
  const r = await fetch(withStore(`/api/store/items/${encodeURIComponent(id)}`), {
   method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  }).catch(() => null);
  setItemState(r?.ok ? "saved" : "idle");
 }

 async function replaceItemPhoto(file: File) {
  if (!itemDraft) return;
  setItemState("saving");
  const fd = new FormData();
  fd.append("file", file);
  const up = await fetch(withStore("/api/store/assets"), { method: "POST", body: fd }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!up?.url) { setItemState("idle"); return; }
  // The first photo is the one every card shows, so a replacement takes that place and the rest
  // stay behind it — she is changing the piece's cover, not deleting its other angles.
  const images = [up.url, ...itemDraft.images.slice(1)];
  setItemDraft({ ...itemDraft, images });
  await saveItem({ images });
 }

 const goToPage = (path: string) => { setSelPath(path); setPanel(null); setSelImg(null); setFocusEid(null); setPreviewKey((k) => k + 1); };

 const postToPreview = (msg: unknown) => editIframe.current?.contentWindow?.postMessage(msg, "*");
 // Her collections, for the Grid panel's picker — read once, the first time she opens a grid.
 useEffect(() => {
  if (!gridSel || gridCollections !== null) return;
  fetch(withStore("/api/store/collections?all=1"))
   .then((r) => (r.ok ? r.json() : { collections: [] }))
   .then((d) => setGridCollections((Array.isArray(d.collections) ? d.collections : []).map((c: { slug: string; title: string; itemCount?: number }) => ({ slug: c.slug, title: c.title, itemCount: c.itemCount ?? 0 }))))
   .catch(() => setGridCollections([]));
 }, [gridSel, gridCollections]);
 // "Refresh card look": read her theme's product card again from her collection pages, then re-render every grid.
 const refreshCardLook = async () => {
  setGridRefresh({ busy: true, note: null });
  const r = await fetch(withStore("/api/store/capture/grid-kit"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: true }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {}; /* allow-swallow: reported below */
  setGridRefresh({ busy: false, note: r && r.ok ? (j.kit === "theme" ? "Updated from your collection page." : "Your site’s card couldn’t be read, so grids use the simple card.") : (typeof j.error === "string" ? j.error : "Couldn’t refresh just now.") });
  postToPreview({ vya: "gridrefresh" });
 };
 // ── HER PAGES ──────────────────────────────────────────────────────────────────────────────────
 // One read: her pages, her menu order, what nothing links to, and how many links point at each.
 // Read-only — opening the editor never writes a page row.
 const loadPages = useCallback(async () => {
  // `no-store`: this is re-read straight after a rename or a hide, to the same URL. Left to the
  // browser's own judgement it can answer from its cache and hand back the page list as it was
  // before her change — which reads as the change not having happened.
  const r = await fetch(withStore("/api/store/capture/pages"), { cache: "no-store" }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null; /* allow-swallow: reported below */
  if (!j) { setPagesNote("Couldn’t load your pages just now."); return; }
  setPagesList(Array.isArray(j.pages) ? j.pages : []);
  setPagesMenu(j.menu || null);
  setPagesReady(j.ready !== false);
  setPagesDrifted(!!j.drifted);
 }, []);
 const hasCapture = !!captured;
 useEffect(() => { if (hasCapture) void loadPages(); }, [hasCapture, pagesStale, loadPages]);

 /** One page changed: re-read the list, and reload the canvas when it was the page on screen. */
 const patchPage = async (path: string, patch: Record<string, unknown>): Promise<boolean> => {
  setPagesBusy(true); setPagesNote(null);
  // The rail changes the moment she acts, the same way reordering already does. Waiting for the round
  // trip reads as nothing having happened — she renamed a page, saw the old name, and refreshed.
  const before = pagesList;
  setPagesList((list) => list.map((e) => {
   if (e.path !== path) return e;
   const next = { ...e };
   if (typeof patch.title === "string") next.title = patch.title;
   if (typeof patch.navLabel === "string") next.navLabel = patch.navLabel;
   if (typeof patch.hidden === "boolean") next.hidden = patch.hidden;
   // The rule the server labels by (pageLabel in site-builder/pages.ts), so the row she sees now and
   // the one that comes back cannot disagree.
   next.label = (next.navLabel || next.title || "").trim() || next.label;
   return next;
  }));
  const r = await fetch(withStore("/api/store/capture/pages"), {
   method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, ...patch }),
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {}; /* allow-swallow: reported below */
  setPagesBusy(false);
  // Put the rail back rather than leaving her looking at a change that was never saved.
  if (!r || !r.ok) { setPagesList(before); setPagesNote(typeof j.error === "string" ? j.error : "Couldn’t save that just now."); return false; }
  setPagesStale((n) => n + 1);
  // ALWAYS, not just when she is looking at the page she changed. Renaming or hiding a page changes
  // the MENU, and the menu is on every page — so the canvas is out of date whichever one is open.
  setPreviewKey((k) => k + 1);
  return true;
 };

 /** Rename: what the page is called, in her menu and in the browser tab. Never its address — so no
  *  link anyone is holding, and nothing Google has indexed, breaks. */
 const renamePage = async (p: PageEntryView) => {
  const name = await dialog.prompt({
   title: `Rename “${p.label}”`,
   body: `Changes what this page is called — in your menu and in the browser tab. Its web address stays ${p.path}, so every link to it still works.`,
   defaultValue: p.navLabel || p.title || p.label,
   confirmLabel: "Rename", maxLength: 60,
  });
  if (!name || !name.trim()) return;
  await patchPage(p.path, { title: name.trim(), navLabel: name.trim() });
 };

 /** The ✕ on a thumbnail, and the eye in the Pages rail. Showing again needs no confirmation. */
 const askRemovePage = async (p: PageEntryView) => {
  if (p.refusal) { setPagesNote(p.refusal); return; }
  if (p.hidden) { await patchPage(p.path, { hidden: false }); return; }
  setRemoveAsk(p);
 };
 const deletePageForGood = async (p: PageEntryView) => {
  setRemoveAsk(null); setPagesBusy(true); setPagesNote(null);
  const r = await fetch(withStore(`/api/store/capture/pages?path=${encodeURIComponent(p.path)}`), { method: "DELETE" }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {}; /* allow-swallow: reported below */
  setPagesBusy(false);
  if (!r || !r.ok) { setPagesNote(typeof j.error === "string" ? j.error : "Couldn’t delete that page."); return; }
  setPagesStale((n) => n + 1);
  setCaptured((c) => (c ? { ...c, pages: c.pages.filter((x) => x !== p.path), count: Math.max(0, c.count - 1) } : c));
  if (p.path === selPath) { setSelPath("/"); setPreviewKey((k) => k + 1); }
 };

 /** In or out of the menu, without touching the page itself. */
 const togglePageInMenu = async (p: PageEntryView) => {
  if (!pagesMenu) { setPagesNote("We couldn’t find a menu on your header to change."); return; }
  const items = p.inMenu
   ? pagesMenu.items.filter((it) => it.href !== p.path)
   : [...pagesMenu.items, { id: `m${pagesMenu.items.length}`, label: p.label, href: p.path }];
  await saveMenu(items);
 };

 /** Her order, dragged in the rail. This is the order shoppers see — on desktop AND on a phone. */
 const reorderMenu = async (from: string, to: string) => {
  if (!pagesMenu) return;
  const items = [...pagesMenu.items];
  const i = items.findIndex((x) => x.href === from), j = items.findIndex((x) => x.href === to);
  if (i < 0 || j < 0 || i === j) return;
  const [moved] = items.splice(i, 1);
  items.splice(j, 0, moved);
  await saveMenu(items);
 };

 async function saveMenu(items: { id: string; label: string; href: string; hidden?: boolean }[]) {
  const prev = pagesMenu;
  setPagesMenu((m) => (m ? { ...m, items } : m)); // the rail moves now; the save follows it
  setPagesBusy(true); setPagesNote(null);
  const r = await fetch(withStore("/api/store/capture/menu"), {
   method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ menu: "main", items, signature: prev?.signature || "" }),
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {}; /* allow-swallow: reported below */
  setPagesBusy(false);
  if (!r || !r.ok) {
   setPagesMenu(prev); // put it back where she left it rather than showing an order we did not save
   if (j && j.drifted && j.menu) { setPagesMenu(j.menu); setPagesDrifted(true); }
   setPagesNote(typeof j.error === "string" ? j.error : "Couldn’t save your menu just now.");
   return;
  }
  setPagesStale((n) => n + 1);
  setPreviewKey((k) => k + 1);
 }

 /** A new page, in her own header and footer, with a starter text block in the middle. */
 const addCapturedPage = async () => {
  const title = await dialog.prompt({ title: "Name the new page", body: "It opens with your own header and footer, and a block of text to edit.", placeholder: "Shipping, FAQ, Visit us…", confirmLabel: "Add page", maxLength: 60 });
  if (!title || !title.trim()) return;
  setPagesBusy(true); setPagesNote(null);
  const r = await fetch(withStore("/api/store/capture/pages"), {
   method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() }),
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {}; /* allow-swallow: reported below */
  setPagesBusy(false);
  if (!r || !r.ok || typeof j.path !== "string") { setPagesNote(typeof j.error === "string" ? j.error : "Couldn’t add that page."); return; }
  setPagesStale((n) => n + 1);
  setCaptured((c) => (c ? { ...c, pages: [...c.pages, j.path as string], count: c.count + 1 } : c));
  goToPage(j.path as string);
 };

 // Hide or show a captured section for shoppers; a block she added is deleted outright.
 const hideOrDeleteSection = () => {
  if (secInfo && !secInfo.block) { postToPreview({ vya: secInfo.hidden ? "showsec" : "hidesec" }); setSecInfo({ ...secInfo, hidden: !secInfo.hidden }); return; }
  postToPreview({ vya: "delsec" }); setPanel(null); setSecRect(null); setGridSel(null);
 };
 // Asset library (Canva-style uploads) — the store's own photos, reusable across the whole site.
 async function loadAssets() {
 setAssetsBusy(true);
 const r = await fetch(withStore("/api/store/assets")).then((x) => (x.ok ? x.json() : null)).catch(() => null);
 setAssets(r?.assets || []);
 setAssetsBusy(false);
 }
 async function uploadAsset(file: File): Promise<string | null> {
 setAssetsBusy(true);
 const fd = new FormData(); fd.append("file", file);
 const r = await fetch(withStore("/api/store/assets"), { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
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
 try { const r = await fetch(withStore("/api/store/assets"), { method: "POST", body: fd }); if (r.ok) { const { url } = await r.json(); updatePanelField(i, { src: url }); postToPreview({ vya: "set", kind: "image", id: f.id, src: url }); } } catch { /* ignore */ }
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

 async function addPage() {
 const title = await dialog.prompt({ title: "Name the new page", placeholder: "About, FAQ, Shipping…", confirmLabel: "Add page" });
 if (!title || !title.trim()) return;
 let slug = pageSlugify(title);
 const taken = new Set(["home", "shop", ...extraPages.map((p) => p.slug)]);
 if (taken.has(slug)) slug = `${slug}-${extraPages.length + 1}`;
 setExtraPages((ps) => [...ps, { slug, title: title.trim().slice(0, 60), blocks: [] }]);
 setActiveSlug(slug); setSaved(false);
 }
 async function deletePage(slug: string) {
 const page = extraPages.find((p) => p.slug === slug);
 if (!(await dialog.confirm({ title: `Delete “${page?.title || slug}”?`, body: "Everything on the page goes with it.", confirmLabel: "Delete page" }))) return;
 setExtraPages((ps) => ps.filter((p) => p.slug !== slug));
 if (activeSlug === slug) setActiveSlug("home");
 setSaved(false);
 }
 async function saveBlocks() {
 setBusy(true); setSaved(false); setErr(null);
 try { const r = await fetch(withStore("/api/store/storefront/design"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks, shopBlocks, extraPages }) }); if (!r.ok) setErr("Couldn’t save."); else setSaved(true); } catch { setErr("Couldn’t save."); }
 setBusy(false);
 }

 async function saveDesign() {
 setBusy(true); setSaved(false); setErr(null);
 try {
 const r = await fetch(withStore("/api/store/storefront/design"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template, colors, fonts }) });
 if (!r.ok) setErr("Couldn’t save the design."); else setSaved(true);
 } catch { setErr("Couldn’t save the design."); }
 setBusy(false);
 }

 // Live on/off — persists immediately (used by the top-bar toggle in both editor modes).
 async function toggleLive() {
 const next = !enabled;
 setEnabled(next);
 await fetch(withStore("/api/store/storefront"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, enabled: next, tagline, accentColor: colors.accent, heroImage, about }) }).catch(() => setEnabled(!next));
 }

 // Admin-only: wipe this storefront entirely (settings, design, pages, public URL) and reopen blank.
 async function removeStorefront() {
 if (!(await dialog.confirm({ title: "Delete this storefront?", body: "Wipes the entire imported site — settings, design, captured pages, public URL, and all imported inventory. This can’t be undone.", confirmLabel: "Delete everything" }))) return;
 setDelBusy(true);
 const r = await fetch(withStore("/api/store/storefront"), { method: "DELETE" }).catch(() => null);
 if (r && r.ok) { window.location.reload(); return; }
 setDelBusy(false);
 }

 async function saveDetails() {
 setBusy(true); setSaved(false); setErr(null);
 try {
 const r = await fetch(withStore("/api/store/storefront"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, enabled, tagline, accentColor: colors.accent, heroImage, about }) });
 const d = await r.json();
 if (!r.ok) setErr(d.error || "Save failed."); else { setHandle(d.settings.handle); setSaved(true); }
 } catch { setErr("Save failed."); }
 setBusy(false);
 }

 async function connectDomain() {
 setDomBusy(true); setDomErr(null);
 try {
 const r = await fetch(withStore("/api/store/domain"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: domInput }) });
 const d = await r.json();
 if (!r.ok) setDomErr(d.error || "Couldn’t connect that domain."); else { setDom({ configured: true, domain: d.domain, status: d.status }); setDomInput(""); }
 } catch { setDomErr("Couldn’t connect that domain."); }
 setDomBusy(false);
 }
 async function recheckDomain() {
 setDomBusy(true); setDomErr(null);
 try { const r = await fetch(withStore("/api/store/domain"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify" }) }); const d = await r.json(); if (r.ok) setDom((x) => ({ ...x, status: d.status })); else setDomErr(d.error || "Check failed."); } catch { setDomErr("Check failed."); }
 setDomBusy(false);
 }
 async function disconnectDomain() { if (!(await dialog.confirm({ title: "Disconnect this domain?", body: "Your storefront stays live on its VYA address.", confirmLabel: "Disconnect" }))) return; setDomBusy(true); await fetch(withStore("/api/store/domain"), { method: "DELETE" }); setDom((x) => ({ ...x, domain: null, status: null })); setDomBusy(false); }
 async function searchDomain() {
 const q = dsearch.trim(); if (!q) return;
 setDsBusy(true); setDres(null); setShowBuy(false); setBuyMsg(null);
 try { const r = await fetch(withStore("/api/store/domain"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search", domain: q }) }); const d = await r.json(); if (r.ok) setDres({ domain: d.domain, available: d.available, priceCents: d.priceCents }); else setBuyMsg(d.error || "Search failed."); } catch { setBuyMsg("Search failed."); }
 setDsBusy(false);
 }
 async function buyDomainNow() {
 if (!dres) return;
 setBuyBusy(true); setBuyMsg(null);
 try { const r = await fetch(withStore("/api/store/domain"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy", domain: dres.domain, contact: buyForm }) }); const d = await r.json(); if (r.ok) { setDom((x) => ({ ...x, domain: d.domain, status: d.status })); setDres(null); setShowBuy(false); } else setBuyMsg(d.error || "Purchase failed."); } catch { setBuyMsg("Purchase failed."); }
 setBuyBusy(false);
 }

 async function uploadAssets(files: FileList | File[]) {
 const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
 if (!imgs.length) return;
 setAssetBusy(true);
 for (const f of imgs) {
 const fd = new FormData(); fd.append("file", f);
 try { const r = await fetch(withStore("/api/store/assets"), { method: "POST", body: fd }); if (r.ok) { const d = await r.json(); setAssets((a) => [{ url: d.url }, ...a]); } } catch { /* skip */ }
 }
 setAssetBusy(false);
 }
 async function deleteAsset(url: string) {
 setAssets((a) => a.filter((x) => x.url !== url));
 await fetch(withStore(`/api/store/assets?url=${encodeURIComponent(url)}`), { method: "DELETE" }).catch(() => {});
 }
 // Place a photo as the hero and persist immediately. If the home page has a hero SECTION, set its
 // image (the modern block model); otherwise fall back to the legacy storefront hero image.
 async function setHero(url: string) {
 const heroBlock = blocks.find((b) => b.type === "hero");
 if (heroBlock) {
 const next = blocks.map((b) => (b.id === heroBlock.id ? { ...b, props: { ...b.props, image: url } } : b));
 setBlocks(next); setSaved(false);
 await fetch(withStore("/api/store/storefront/design"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks: next, shopBlocks, extraPages }) }).catch(() => {});
 return;
 }
 setHeroImage(url);
 await fetch(withStore("/api/store/storefront"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, enabled, tagline, accentColor: colors.accent, heroImage: url, about }) }).catch(() => {});
 }

 const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/[0.06]";
 const label = "block text-[12px] font-medium text-stone-500 mb-2";

 if (loading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-400 text-sm">Loading…</div>;

 // A seller who brought their own site over edits THAT site (live preview + re-sync
 // + conversational edits via VYA), not the block builder.
 if (captured) {
 const pageLabel = (p: string) => {
 // Her own name for the page wins. This picker is built from the captured PATHS, so without this it
 // keeps calling a page by the name its address implies — "Faq" for a page she renamed.
 const named = (pagesList.find((x) => x.path === p)?.label || "").trim();
 if (named) return named;
 if (p === "/") return "Home";
 const seg = p.split("/").filter(Boolean).pop() || p;
 return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
 };
 // Edit preview must be SAME-ORIGIN so it loads the captured pages on whatever host the editor is on
 // (localhost, getvya.ai). captured.url is an absolute public URL (prod / custom domain) — wrong for the
 // iframe. Build a relative /site/{slug} path from the slug (falling back to the url's pathname).
 // One editor for "the piece behind what I clicked", shown whether she clicked its photo, its name
 // or its price. Everything here writes to Inventory, because that is where a product's name, price
 // and photos actually live — the card on the page is rebuilt from them on every load.
 // Where a link goes, said in words, with the way there. Built once because a link is a link whether
 // she reached it by clicking its text or by clicking the picture it wraps — a collection tile is the
 // second kind, and used to offer neither.
 const linkDestination = (href: string, label: string) => {
  const t = resolveLinkTarget(href, label, captured.pages, { slug: captured.slug, origin: captured.origin });
  if (t.kind === "page") return (
   <button
    type="button"
    onClick={() => goToPage(t.path)}
    title={t.matched === "name" ? `This link has no address, but you have a page called “${t.label}”` : `Goes to ${t.path}`}
    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#5D0F17] underline underline-offset-2 hover:opacity-70"
   >
    {t.matched === "name" ? `Open your “${t.label}” page` : `Go to ${t.label}`} →
   </button>
  );
  if (t.kind === "external") return <p className="mt-1.5 text-[11.5px] text-stone-400">Leaves your site — {t.host}</p>;
  if (t.kind === "missing") return <p className="mt-1.5 text-[11.5px] text-stone-400">Points at {t.path}, which isn’t one of your pages.</p>;
  return <p className="mt-1.5 text-[11.5px] text-stone-400">Doesn’t go anywhere yet.</p>;
 };

 const piecePanel = focusItem && itemDraft ? (
  <div className="mb-4 rounded-xl border border-[#5D0F17]/15 bg-[#5D0F17]/[0.04] p-3.5">
   <div className="mb-2.5 flex items-start justify-between gap-2">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5D0F17]">From your inventory</p>
    <span className="shrink-0 text-[11px] text-stone-400">
     {itemState === "saving" ? "Saving…" : itemState === "saved" ? "Saved ✓" : itemState === "loading" ? "…" : ""}
    </span>
   </div>
   <div className="flex gap-2.5">
    <label title="Replace this piece's photo" className="relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-black/10 bg-white">
     {itemDraft.images[0]
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={itemDraft.images[0]} alt="" className="h-full w-full object-cover" />
      : <ImageIcon size={16} className="text-stone-300" />}
     <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void replaceItemPhoto(f); }} />
    </label>
    <div className="min-w-0 flex-1 space-y-1.5">
     <input
      value={itemDraft.title}
      onChange={(e) => setItemDraft({ ...itemDraft, title: e.target.value })}
      onBlur={() => { if (itemDraft.title.trim()) void saveItem({ title: itemDraft.title.trim() }); }}
      className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#5D0F17]/50"
     />
     <input
      value={itemDraft.price}
      inputMode="decimal"
      onChange={(e) => setItemDraft({ ...itemDraft, price: e.target.value })}
      onBlur={() => { const n = Number(itemDraft.price); if (Number.isFinite(n) && n >= 0) void saveItem({ price: n }); }}
      className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-[#5D0F17]/50"
     />
    </div>
   </div>
   <p className="mt-2 text-[11.5px] leading-relaxed text-stone-500">
    Changing it here changes the piece itself, everywhere it appears — your site, the marketplace, your inventory.
   </p>
   <a href={withStore(`/admin/inventory?item=${encodeURIComponent(itemDraft.id)}`)} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#5D0F17] underline underline-offset-2 hover:opacity-70">
    Everything else about this piece →
   </a>
  </div>
 ) : null;

 const sitePath = captured.slug ? `/site/${captured.slug}` : (() => { try { return new URL(captured.url || "").pathname; } catch { return ""; } })();
 const editSrc = `${sitePath}${selPath === "/" ? "" : selPath}?edit=1`;
 // The address her hosted store is ACTUALLY served on — the same one /api/store/capture hands
 // back (her connected domain, else {slug}.vyasites.com). Deriving it from that one answer is how
 // this stays true: it used to print a .getvya.ai host while the store was served somewhere else,
 // so a seller was shown an address her own site does not answer on.
 // Host AND path. Showing only the host turned the fallback "vyaplatform.com/site/{slug}" into
 // "vyaplatform.com/collections" in the address bar — a URL that serves the marketplace, not her
 // shop. With Plan B configured this reads tesselizabethvintage.vyasites.com; without it, the real
 // fallback path rather than a tidier-looking address that goes nowhere.
 const siteHost = (() => {
  try { const u = new URL(captured.url || ""); return (u.host + u.pathname).replace(/\/+$/, ""); }
  catch { return handle || captured.slug || "your-store"; }
 })();
 // A FIXED canvas width per device, in real pixels — never "100%".
 //
 // Desktop used to be 100%, so the page rendered at whatever the surface happened to be: narrower
 // laptop, narrower page, and a theme with a 1200px breakpoint quietly served its tablet layout.
 // Zooming made it worse, because every recalculation rode on that same elastic width. 1280 is the
 // width a desktop theme is designed against, so what she sees is what a shopper sees, at any zoom.
 const canvasW = device === "phone" ? 390 : device === "tablet" ? 834 : 1280;
 const capDbtn = (d: "desktop" | "tablet" | "phone", Icon: typeof Monitor) => (
 <button type="button" onClick={() => setDevice(d)} aria-label={d} className={`grid h-7 w-9 place-items-center rounded-md transition ${device === d ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}><Icon size={15} strokeWidth={1.9} /></button>
 );
 return (
 <div className="fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-[#fbf9f5] text-stone-900" style={{ top: "var(--vya-banner, 0px)" }}>
 {dialog.node}
 {/* THE ✕ ON A PAGE CARD asks before it does anything, and offers both answers: hide it (reversible,
     and what the ✕ means by default) or delete it for good. Its own small dialog rather than a plain
     confirm, because a two-button box cannot offer two different destructive answers. */}
 {removeAsk && (
  <div
   className="fixed inset-0 z-[80] grid place-items-center bg-black/40 px-4"
   role="dialog"
   aria-modal="true"
   aria-label={`Remove ${removeAsk.label}`}
   onKeyDown={(e) => { if (e.key === "Escape") setRemoveAsk(null); }}
  >
   <div className="w-full max-w-[420px] rounded-2xl border border-black/10 bg-white p-5 shadow-[0_30px_80px_-20px_rgba(43,36,29,0.6)]">
    <p className="text-[15px] font-semibold text-stone-900">Remove &ldquo;{removeAsk.label}&rdquo;?</p>
    <p className="mt-2 text-[12.5px] leading-relaxed text-stone-600">
     Hiding it is the reversible one: shoppers get &ldquo;Page not found&rdquo;, it disappears from your menu, and it stays here so you can bring it back whenever you like.
    </p>
    {!!removeAsk.linkedFrom && (
     <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
      {removeAsk.linkedFrom === 1 ? "One link on your site still points here" : `${removeAsk.linkedFrom} links on your site still point here`} — anyone following one will get &ldquo;Page not found&rdquo;.
     </p>
    )}
    <div className="mt-4 flex flex-wrap items-center gap-2">
     <button type="button" autoFocus onClick={() => { const p = removeAsk; setRemoveAsk(null); void patchPage(p.path, { hidden: true }); }}
      className="rounded-lg bg-[#5D0F17] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">Hide from shoppers</button>
     <button type="button" onClick={() => setRemoveAsk(null)}
      className="rounded-lg border border-black/15 px-3.5 py-2 text-[13px] font-medium text-stone-600 transition hover:bg-stone-100">Cancel</button>
     <button
      type="button"
      onClick={async () => {
       const p = removeAsk;
       setRemoveAsk(null); // closed first, so the confirmation below is not a box on top of a box
       if (!(await dialog.confirm({ title: `Delete “${p.label}” for good?`, body: "The page itself goes. Hide it instead if there is any chance you want it back.", confirmLabel: "Delete permanently" }))) return;
       await deletePageForGood(p);
      }}
      className="ml-auto text-[12px] text-stone-500 underline underline-offset-2 transition hover:text-red-600"
     >
      Delete permanently
     </button>
    </div>
   </div>
  </div>
 )}
 <HideGlobalChat />
 {/* Top bar — matches the studio */}
 <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-[#fbf9f5] px-3">
 <div className="flex min-w-0 items-center gap-2.5">
 <a href={`${base}/home`} title="Back to admin" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/10 text-stone-500 transition hover:bg-stone-100"><ChevronDown size={16} className="rotate-90" /></a>
 <span className="truncate text-[15px] font-semibold tracking-tight">{storeName}</span>
 {/* Hidden on a phone: the Live/Off switch on the right says the same thing, and the bar needs the room. */}
 <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] max-sm:hidden ${enabled ? "bg-emerald-500/[0.12] text-emerald-700" : "bg-black/[0.06] text-stone-500"}`}>{enabled ? "Live" : "Draft"}</span>
 <span className="hidden shrink-0 rounded-full bg-[#5D0F17]/[0.07] px-2 py-0.5 text-[10px] font-semibold text-[#5D0F17] sm:inline">Imported site</span>
 <span className="mx-0.5 h-5 w-px shrink-0 bg-black/10 max-sm:hidden" />
 <div className="flex overflow-hidden rounded-lg border border-black/10 bg-[#f4f1ec]">
 <button type="button" onClick={() => postToPreview({ vya: "undoany" })} title="Undo (⌘Z)" aria-label="Undo" className="grid h-7 w-8 place-items-center text-stone-500 transition hover:bg-white hover:text-stone-800"><Undo2 size={15} strokeWidth={1.9} /></button>
 <span className="w-px bg-black/10" />
 <button type="button" onClick={() => postToPreview({ vya: "redo" })} title="Redo (⌘⇧Z)" aria-label="Redo" className="grid h-7 w-8 place-items-center text-stone-500 transition hover:bg-white hover:text-stone-800"><Redo2 size={15} strokeWidth={1.9} /></button>
 </div>
 {undoNote && <span role="status" className="shrink-0 text-[11px] text-stone-500 max-sm:hidden">{undoNote}</span>}
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

 <div className="relative flex min-h-0 flex-1">
 {/* Canva-style shell: a vertical icon rail (always visible) + a collapsible content panel — 1:1 with the from-scratch studio */}
 {/* Below 768 the open panel floats OVER the preview instead of pushing it: a 430px column on a 390px
     phone pushed itself off the screen and crushed the preview to nothing. Collapse it to see the page. */}
 <div className={`relative flex shrink-0 overflow-visible border-r border-black/10 bg-white transition-[width] duration-200 ${capPanelOpen ? "w-[430px] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[calc(100vw-2.5rem)] max-md:shadow-[8px_0_24px_-12px_rgba(0,0,0,0.25)]" : "w-[70px]"}`}>
 <button type="button" onClick={() => setCapPanelOpen((o) => !o)} title={capPanelOpen ? "Collapse panel" : "Expand panel"} className="absolute -right-3 top-1/2 z-30 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-black/10 bg-white text-stone-500 shadow-sm transition hover:text-[#5D0F17]">{capPanelOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}</button>
 {/* Vertical icon rail */}
 <div className="flex w-[70px] shrink-0 flex-col items-center gap-1 overflow-y-auto py-3">
 {([["design", "Design", Palette], ["sections", "Layout", Layers], ["pages", "Pages", Files], ["elements", "Elements", Shapes], ["text", "Text", Type], ["uploads", "Uploads", UploadIcon], ["assist", "VYA", Sparkles]] as const).map(([id, label, Icon]) => (
 <button key={id} type="button" onClick={() => { if (!(selImg || panel) && capTab === id && capPanelOpen) { setCapPanelOpen(false); } else { setCapTab(id); setCapPanelOpen(true); } }} className={`flex w-[58px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition ${!(selImg || panel) && capTab === id && capPanelOpen ? "bg-[#5D0F17]/[0.08] text-[#5D0F17]" : "text-stone-500 hover:bg-stone-100"}`}>
 <Icon size={19} strokeWidth={1.8} />{label}
 </button>
 ))}
 </div>
 {/* Active panel — hidden when the side bar is collapsed */}
 {capPanelOpen && (
 <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-black/10 bg-white">
 {(selImg || panel) ? (
 /* ── Contextual editor — selecting an image/section replaces the rail (like the studio) ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 {selImg ? (
 <>
 <div className="mb-3 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{piecePanel ? "This piece" : "Replace image"}</p>
 <button onClick={() => { setSelImg(null); setFocusItem(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 {piecePanel}
 {/* WHERE THIS PICTURE GOES. A collection tile is a photo wrapped in a link, so clicking it used to
     offer "replace this image" and nothing else — no address, no way through to the collection. A
     link made of words always showed both; this is the same link, reached by its picture. */}
 {selImg.linkId !== null && (
 <div className="mb-4">
  <label className="mb-1 block text-[12px] font-medium text-stone-600">Link{selImg.linkLabel ? ` — “${selImg.linkLabel}”` : ""}</label>
  <input
   value={selImg.href}
   onChange={(e) => { const href = e.target.value; setSelImg({ ...selImg, href }); postToPreview({ vya: "set", kind: "link", id: selImg.linkId, href }); }}
   placeholder="https://…  or  /page"
   className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#5D0F17]/50"
  />
  {linkDestination(selImg.href, selImg.linkLabel)}
 </div>
 )}
 {/* Taking one collection off a page. Not "delete the collection" — it stays in your Collections and
     on every other page that shows it; this is the box, off this page. */}
 {selImg.tile && (
 <button
  type="button"
  onClick={() => { postToPreview({ vya: "deltile" }); setSelImg(null); setFocusItem(null); }}
  className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
 >
  <Trash2 size={13} /> Remove this from the page
 </button>
 )}
 {/* A product photo belongs to the piece, and the grid is rebuilt from Inventory on every load — so
     swapping the captured <img> here would be undone the moment a shopper opened the page. Above is
     the control that actually changes it. */}
 {!piecePanel && <>
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
 </>}
 </>
 ) : panel && gridSel ? (
 /* A product grid she added: its settings, instead of text fields (it has none of its own). */
 <GridPanel
  config={gridSel.config}
  kit={gridSel.kit}
  empty={gridSel.empty}
  collections={gridCollections}
  refreshing={gridRefresh.busy}
  refreshNote={gridRefresh.note}
  onChange={(next) => { setGridSel({ ...gridSel, config: next }); postToPreview({ vya: "gridset", id: gridSel.id, config: next }); }}
  onRefresh={refreshCardLook}
  onDone={() => { postToPreview({ vya: "deselect" }); setPanel(null); setSecRect(null); setGridSel(null); }}
  onDelete={() => { postToPreview({ vya: "delsec" }); setPanel(null); setSecRect(null); setGridSel(null); }}
  piece={focusItem}
  piecePanel={focusItem ? piecePanel : undefined}
 />
 ) : panel ? (
 <>
 <div className="mb-3 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Edit section</p>
 {/* Done closes the rail AND releases the page. Closing only the rail left the section still
     outlined and its text still editable, with no way back out — which is what "I can't unclick
     it" was. */}
 <button onClick={() => { postToPreview({ vya: "deselect" }); setPanel(null); setSecRect(null); }} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
 </div>
 {/* What "Delete" means depends on what she has hold of. With a box selected it is the box; the
     whole band is still one click away, by clicking the band. */}
 {inlineKind && <p className="mb-1.5 text-[11px] text-stone-400">This {inlineKind === "image" ? "image" : inlineKind === "button" ? "button" : "text box"} is selected — use the arrows on it to move it.</p>}
 <div className="mb-4 flex gap-2">
 <button onClick={() => postToPreview({ vya: inlineKind ? "dupinline" : "dupsec" })} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"><Copy size={13} /> Duplicate{inlineKind ? " this" : ""}</button>
 {!inlineKind && secInfo && !secInfo.block ? (
 /* One of her captured sections: hidden from shoppers, not deleted, so it can come back. */
 <button onClick={hideOrDeleteSection} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]">{secInfo.hidden ? <><Eye size={13} /> Show section</> : <><EyeOff size={13} /> Hide section</>}</button>
 ) : (
 <button onClick={() => { if (inlineKind) { postToPreview({ vya: "delinline" }); setInlineKind(null); } else { postToPreview({ vya: "delsec" }); setPanel(null); } }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[12px] font-medium text-stone-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /> Delete{inlineKind ? " this" : " section"}</button>
 )}
 </div>
 {!inlineKind && secInfo && !secInfo.block && (
 <p className="-mt-2 mb-4 text-[11.5px] leading-snug text-stone-400">
  {secInfo.hidden ? "Hidden from shoppers — it stays here so you can bring it back." : "Hiding keeps it on your page for later."}{" "}
  <button type="button" onClick={async () => { if (!(await dialog.confirm({ title: "Delete this section for good?", body: "It comes off this page. Hide it instead if you might want it back.", confirmLabel: "Delete section" }))) return; postToPreview({ vya: "delsec" }); setPanel(null); setSecRect(null); setSecInfo(null); }} className="underline underline-offset-2 hover:text-red-600">Delete permanently</button>
 </p>
 )}
 {/* Adding INTO the section she has open. The left rail's Text tab can only add a new band, because
     reaching that tab means dismissing this panel — and dismissing it deselects the section, so by
     the time she clicks "Paragraph" there is no "here" left to put anything in. Here there is. */}
 <div className="mb-4">
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Add to this section</p>
 <div className="flex gap-2">
 {([["text", "Text", Type], ["image", "Image", ImageIcon], ["button", "Button", MousePointerClick]] as const).map(([type, label, Icon]) => (
 <button key={type} type="button" onClick={() => postToPreview({ vya: "addblock", type, inside: true })} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-2 py-2 text-[12px] font-medium text-stone-600 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]">
 <Icon size={13} /> {label}
 </button>
 ))}
 </div>
 </div>
 {panel.fields.length === 0 && <p className="text-[12px] leading-relaxed text-stone-400">This section has no editable text or images — move, duplicate, or delete it, or ask VYA.</p>}
 <div className="space-y-4">
 {/* A link's WORDS and where it GOES, together.
     The panel listed every text field first and every href far below it, so checking where "Make
     an appointment here." pointed meant scrolling past twenty boxes all labelled "Link text" and
     matching them up by eye. The link field already knows the text it belongs to (`label`), so
     each destination is rendered directly beneath the words that carry it. Order is display-only —
     the underlying indices are untouched, because they address the real element in the page. */}
 {(() => {
 const ordered = orderFieldsForPanel(panel.fields);
 const { focused, rest } = splitFocusedFields(ordered, focusEid, focusImg);
 const shown = focused.length && !showAllFields ? focused : ordered;
 // She clicked something belonging to a piece in her inventory — a product's name, its price, its
 // photo. Those are not editable here in any meaningful sense: every shopper's page rebuilds them
 // from Inventory, so whatever she types is gone on the next load. Give her the piece.
 const inInventory = focusItem && !showAllFields ? focusItem : null;
 return (<>
 {inInventory && (<>
  {piecePanel}
  <button type="button" onClick={() => setShowAllFields(true)} className="text-[11px] text-stone-400 underline underline-offset-2 hover:text-stone-600">
   Edit this section&rsquo;s markup anyway
  </button>
 </>)}
 {!inInventory && (<>
 {focused.length > 0 && !showAllFields && (
  <p className="text-[11.5px] leading-snug text-stone-400">
   Editing what you clicked.{" "}
   <button type="button" onClick={() => setShowAllFields(true)} className="underline underline-offset-2 hover:text-[#5D0F17]">
    Show all {ordered.length} fields in this section
   </button>
  </p>
 )}
 {shown.map(({ f, i }) => (
 /* Touching a field scrolls the preview to the section it belongs to.
    The captured page is one long document and the panel is a separate column, so after any
    scrolling — or a jump to a new page — you end up typing into a box with no idea which part of
    the site is changing. The injected script has always answered "scrollto"; nothing had ever
    asked. onFocusCapture so it fires for the textarea, the image picker and the link box alike,
    without repeating the call on each of them. */
 <div
  key={(f.kind === "text" ? "t" + f.eid : f.kind === "image" ? "i" + f.id : "l" + f.id) + "-" + i}
  onFocusCapture={() => { if (panel.index >= 0) postToPreview({ vya: "scrollto", index: panel.index }); }}
 >
 {f.kind === "text" && (
 <>
 <label className="mb-1 block text-[12px] font-medium text-stone-600">
 {fieldLabel(f.tag)}
 {/* Twenty fields all called "Link text" are twenty fields you have to open to tell apart. */}
 {f.tag === "a" && f.value.trim() ? <span className="font-normal text-stone-400"> — “{f.value.trim().slice(0, 40)}”</span> : null}
 </label>
 <textarea
 ref={(el) => {
  // The field for the element just clicked on the page: bring it into view and put the cursor
  // in it. Guarded on focusEid so this only fires for the one field, once per click.
  if (!el || scrollEid === null || f.eid !== scrollEid) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus();
  // Where she clicked, not the front. A focused box starts with its cursor at 0, so clicking at the
  // END of "Out In Nature" on the page and typing wrote at the START of the box — measured: typing
  // "Z" gave "ZOur Story", Delete ate its first letter — and a header/footer edit then carried that
  // damage to every page.
  const at = focusCaret.current === null ? el.value.length : Math.min(focusCaret.current, el.value.length);
  try { el.setSelectionRange(at, at); } catch { /* allow-swallow: a box that can't take a selection keeps the browser's */ }
  setScrollEid(null);
 }}
 value={f.value}
 onChange={(e) => { updatePanelField(i, { value: e.target.value }); postToPreview({ vya: "set", kind: "text", eid: f.eid, value: e.target.value }); }}
 className={`min-h-[42px] w-full resize-y rounded-lg border bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#5D0F17]/50 ${f.eid === focusEid ? "border-[#5D0F17]/60" : "border-black/10"}`}
 />
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
 {/* A URL is the one thing a seller can't read. Say where this link goes — and when it goes to
  a page of hers, hand her the way there, instead of eighty thumbnails to hunt through. */}
 {(() => {
  return linkDestination(f.href, f.label || "");
 })()}
 </>
 )}
 </div>
 ))}
 </>)}
 {/* A way back to the one field, once she's opened the whole section. */}
 {focused.length > 0 && showAllFields && (
  <button type="button" onClick={() => setShowAllFields(false)} className="text-[11.5px] text-stone-400 underline underline-offset-2 hover:text-[#5D0F17]">
   Just the part I clicked
  </button>
 )}
 </>);
 })()}
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
 {/* The section's buttons. Background and Text recolour the section and its words, but every button
     keeps its own fill — so from here, no button that came with the site could change colour. */}
 {typeof secStyle.btn === "string" && (
 <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2">
 <span className="flex-1 text-[13px] text-stone-700">Buttons</span>
 {secStyle.btnSet && <button onClick={() => { setSecStyle((s) => ({ ...s, btn: "", btnSet: false })); postToPreview({ vya: "secbtn", value: "" }); }} title="Clear" className="text-[11px] text-stone-400 underline hover:text-[#5D0F17]">reset</button>}
 <input
  type="color"
  value={/^#[0-9a-fA-F]{6}$/.test(secStyle.btn) ? secStyle.btn : "#000000"}
  onChange={(e) => { const v = e.target.value; setSecStyle((s) => ({ ...s, btn: v, btnSet: true })); postToPreview({ vya: "secbtn", value: v }); }}
  aria-label="Buttons colour for this section"
  className="h-7 w-7 cursor-pointer rounded-md border border-black/10 bg-white p-0"
 />
 </div>
 )}
 {/* No section "Align": it wrote text-align on the section's wrapper, and a theme aligns its own
     headings, text and buttons, so nothing on the page moved (measured on thenicheshop-2). Aligning one
     piece of text still works from the text toolbar. */}
 </div>
 </div>
 </>
 ) : null}
 </div>
 ) : (
 <>
 {capTab === "assist" ? (
 <div className="min-h-0 flex-1"><Sidekick docked /></div>
 ) : capTab === "pages" ? (
 /* ── Pages — her menu order, renaming, hiding, and adding a page ── */
 <PagesPanel
  pages={pagesList}
  ready={pagesReady}
  busy={pagesBusy}
  note={pagesNote}
  drifted={pagesDrifted}
  selPath={selPath}
  onOpen={goToPage}
  onRename={renamePage}
  onToggleHidden={askRemovePage}
  onToggleMenu={togglePageInMenu}
  onReorder={reorderMenu}
  onAdd={addCapturedPage}
  dragRef={pageDrag}
 />
 ) : capTab === "sections" ? (
 /* ── Layout — the same word, grouping and names as the Studio's Layout rail.
    It read "Sections" here and "Layout" there for the same job, which is how one product starts
    feeling like two. Categories and copy now come from app/lib/storefront-variants.ts — the
    catalogue the Studio renders — so the two lists cannot drift apart again.
    What is deliberately NOT here is the variant picker (Full bleed / Slideshow / Split / Stacked).
    Those exist only as React blocks; this editor injects HTML into the seller's own theme, and
    there is no block-to-HTML renderer. Five variants that all dropped identical markup would be a
    worse lie than one honest layout. ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Add a layout</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Drops it after the section you have selected (or the one in the middle of your screen). To put it exactly somewhere, hover between two sections on the page and press +.</p>
 {/* Product grid — live pieces in her theme's own card. First, because it is the one layout that sells. */}
 <button type="button" onClick={() => postToPreview({ vya: "addgrid" })} className="group mb-4 flex w-full items-center gap-3 rounded-xl border border-[#5D0F17]/25 bg-[#5D0F17]/[0.03] p-3 text-left transition hover:-translate-y-px hover:border-[#5D0F17]/50 hover:shadow-[0_10px_26px_-14px_rgba(43,36,29,0.5)]">
  <span className="grid h-10 w-10 shrink-0 grid-cols-2 gap-0.5 rounded-md border border-black/5 bg-white p-1.5" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className="rounded-[2px] bg-[#5D0F17]/25" />)}</span>
  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-stone-800">Product grid</span><span className="block text-[11.5px] leading-snug text-stone-500">Live pieces, in your site&rsquo;s own product card</span></span>
  <Plus size={14} className="shrink-0 text-stone-300 transition group-hover:text-[#5D0F17]" />
 </button>
 <input value={secQ} onChange={(e) => setSecQ(e.target.value)} placeholder="Search layouts…" className="mb-3 w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[12px] outline-none focus:border-[#5D0F17]/50" />
 {(() => {
  const ALL: [string, string][] = [["hero", "Hero"], ["announcement", "Announcement"], ["faq", "FAQ"], ["gallery", "Gallery"], ["split", "Split"], ["columns", "Columns"], ["testimonials", "Reviews"], ["blog", "Blog"], ["contact", "Contact"], ["statement", "Statement"], ["newsletter", "Newsletter"]];
  const q = secQ.trim().toLowerCase();
  const desc = (t: string) => variantGroup(t)?.variants?.[0]?.description || "";
  const hits = ALL.filter(([t, l]) => !q || l.toLowerCase().includes(q) || t.includes(q) || desc(t).toLowerCase().includes(q));
  if (!hits.length) return <p className="py-6 text-center text-[12px] text-stone-400">Nothing matches that.</p>;
  return SECTION_CATEGORIES.map((cat) => {
   const inCat = hits.filter(([t]) => categoryFor(t) === cat);
   if (!inCat.length) return null;
   return (
    <div key={cat} className="mb-4">
     <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500"><span>{cat}</span><span className="font-normal text-stone-300">{inCat.length}</span></p>
     <div className="grid grid-cols-2 gap-2">
      {inCat.map(([type, label]) => (
       <button key={type} type="button" onClick={() => postToPreview({ vya: "addblock", type })} title={desc(type) || label} className="group flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white text-left transition hover:-translate-y-px hover:border-[#5D0F17]/40 hover:shadow-[0_10px_26px_-14px_rgba(43,36,29,0.5)]">
        <div className="h-[58px] w-full border-b border-black/5 bg-gradient-to-b from-white to-stone-50"><SectionThumb type={type} /></div>
        <span className="flex items-center gap-1 px-2.5 py-1.5"><span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800">{label}</span><Plus size={12} className="shrink-0 text-stone-300 transition group-hover:text-[#5D0F17]" /></span>
       </button>
      ))}
     </div>
    </div>
   );
  });
 })()}
 </div>
 ) : capTab === "elements" ? (
 /* ── Elements — small building blocks dropped onto the page ── */
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
 <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Elements</p>
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Goes inside the section you have selected. With nothing selected it becomes a new band of its own, near the middle of the screen.</p>
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
 <p className="mb-3 text-[12px] leading-snug text-stone-400">Select a section first and the text lands inside it. Click it to edit; the floating toolbar sizes, colours and aligns it.</p>
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
 <p className="mb-2 rounded-lg bg-[#5D0F17]/[0.05] px-3 py-2 text-[11px] leading-relaxed text-[#5D0F17]">Your imported site keeps its own layout — these set its palette and fonts on top. Changes show in the preview straight away and save on their own.</p>
 {designNote && <p className="mb-2 rounded-lg border border-[#5D0F17]/25 bg-white px-3 py-2 text-[11px] leading-relaxed text-[#5D0F17]">{designNote}</p>}
 {designOutdated && (
 <p className="mb-2 rounded-lg border border-[#5D0F17]/25 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-600">
  Your saved colours and fonts were set before they could reach every part of your theme, so your live site may show only some of them.{" "}
  <button type="button" onClick={() => { designTouched.current = true; setDesignOutdated(false); setDesign((d) => ({ ...d })); }} className="font-semibold text-[#5D0F17] underline">Update my live site</button>
 </p>
 )}

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

 {/* Pick the two ends separately — and pick from HER faces, not only ours. A font read off her own
     stylesheet renders in the real thing on her own pages, because the @font-face that defines it
     came over with the capture. */}
 <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Or choose each</p>
 {siteFonts.length > 0 && <p className="mb-2 text-[11px] leading-snug text-stone-400">Your site&rsquo;s own fonts came over with it — they&rsquo;re at the top of each list.</p>}
 <div className="space-y-1.5">
 {([["heading", "Headings"], ["body", "Body text"]] as const).map(([key, label]) => (
 <div key={key} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
  <span className="flex-1 text-[13px] text-stone-700">{label}</span>
  <select
   value={design[key] || ""}
   onChange={(e) => setDesignField({ [key]: e.target.value || null })}
   className="max-w-[150px] cursor-pointer rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-stone-700 outline-none focus:border-[#5D0F17]/50"
  >
   <option value="">Keep original</option>
   {siteFonts.length > 0 && (
    <optgroup label="From your site">
     {siteFonts.map((f) => <option key={f.family} value={f.family}>{f.family}{f.face ? "" : " (name only)"}</option>)}
    </optgroup>
   )}
   <optgroup label="VYA library">
    {(key === "heading" ? headingFonts : bodyFonts).map((f) => <option key={f} value={f}>{f}</option>)}
   </optgroup>
  </select>
 </div>
 ))}
 </div>

 {/* ── What a product page says ────────────────────────────────────────────────────────────────
     One template for every piece, and the same setting the block builder edits. Which products it
     governs is worth saying plainly: a piece you add in VYA gets a page VYA renders, so this is its
     design. A product you imported keeps the page that came over with it — that one's design is the
     "Product page" entry in the page list above the preview, where an edit reaches all of them. */}
 <div className="mb-1.5 mt-6 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">What a product page says</p>
 <span className="text-[11px] text-stone-400">{productPageSaved ? "Saved ✓" : "Saving…"}</span>
 </div>
 <p className="mb-2.5 text-[12px] leading-snug text-stone-400">
  For pieces you add in VYA. Drag to reorder. A field a listing hasn&rsquo;t filled in never shows, so
  switching one on changes nothing until the piece carries it.
  {captured.productTemplate ? <> Your imported products use the <b className="font-semibold text-stone-500">Product page</b> in the list above the preview.</> : null}
 </p>
 <ProductFieldsEditor fields={productPage.fields} onSet={setProductField} onMove={moveProductField} sample={null} />
 <label className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-black/10 bg-white px-2.5 py-2">
 <input type="checkbox" checked={productPage.comparePrice} onChange={(e) => void saveProductPage({ ...productPage, comparePrice: e.target.checked })} className="mt-0.5 accent-[#5D0F17]" />
 <span className="min-w-0">
  <span className="block text-[12.5px] font-medium text-stone-700">Show the was-price</span>
  <span className="mt-0.5 block text-[11px] leading-snug text-stone-400">Where you set a compare-at price, it prints struck through with a Sale mark.</span>
 </span>
 </label>

 <p className="mt-4 text-[11px] text-stone-400">{designSaved ? "All changes saved ✓ — live on your site" : "Changes apply live as you edit."}</p>

 <details className="mt-4">
 <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Custom CSS</summary>
 <p className="mb-1.5 mt-2 text-[12px] leading-snug text-stone-400">Advanced — layered over your site. Or just ask VYA.</p>
 <textarea value={designRest} onChange={(e) => { designTouched.current = true; setDesignRest(e.target.value); setDesignSaved(false); }} spellCheck={false} placeholder=".site-header { background: #111; }" className="min-h-[100px] w-full resize-y rounded-lg border border-black/10 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-[#5D0F17]/50" />
 </details>

 {isAdmin && (
 <div className="mt-5 space-y-2 border-t border-black/10 pt-4">
 <button onClick={reSync} disabled={syncBusy} className="w-full rounded-lg border border-black/15 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:border-[#5D0F17] disabled:opacity-50">{syncBusy ? "Syncing…" : "Re-sync from live site (admin)"}</button>
 {(syncBusy || syncMsg) && <p className={`text-[11px] ${syncBusy ? "text-stone-400" : syncMsg!.startsWith("✓") ? "text-green-700" : "text-amber-700"}`}>{syncBusy ? "Re-crawling — a minute or two…" : syncMsg}</p>}
 <button onClick={async () => { if (!(await dialog.confirm({ title: "Reset this store?", body: "discards the captured site AND deletes all (non-sold) inventory, then switches to the simple design. This can’t be undone.", confirmLabel: "Reset" }))) return; const r = await fetch(withStore("/api/store/capture"), { method: "DELETE" }).catch(() => null); if (r && r.ok) { window.location.reload(); } else { const msg = r ? ((await r.json().catch(() => ({}))).error || `Reset failed (${r.status}).`) : "Reset failed — network error."; alert(msg + " The captured site was NOT removed."); } }} className="block text-[11px] text-stone-400 underline hover:text-[#5D0F17]">Use the simple design instead (owner)</button>
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
 <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-white px-3 py-2">
 <button onClick={() => setPreviewKey((k) => k + 1)} title="Reload preview" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"><RotateCw size={14} strokeWidth={2} /></button>
 <div className="relative shrink-0">
 <HomeIcon size={13} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
 <select value={selPath} onChange={(e) => { setSelPath(e.target.value); setPanel(null); setPreviewKey((k) => k + 1); }} className="cursor-pointer appearance-none rounded-lg border border-black/10 bg-white py-1.5 pl-8 pr-7 text-[12.5px] font-medium text-stone-700 transition hover:border-stone-300 focus:outline-none">
 {captured.pages.filter((p) => !/^\/products\//.test(p)).map((p) => <option key={p} value={p}>{pageLabel(p)}</option>)}
 {/* One entry for the product page, not one per product. A store has hundreds of captured product
     pages and they are all the same design; this opens one of them as that design, and a save
     carries the change to the rest. */}
 {captured.productTemplate && <option value={captured.productTemplate}>Product page (all {captured.productCount})</option>}
 </select>
 <ChevronDown size={13} strokeWidth={2.25} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
 </div>
 {/* Editing the product page is editing every product page. Saying so here is the difference between
     a design change and a seller wondering why her other 300 products look wrong. */}
 {captured.productTemplate && selPath === captured.productTemplate && (
 <span className="shrink-0 rounded-lg bg-[#5D0F17]/[0.07] px-2.5 py-1 text-[11.5px] font-medium text-[#5D0F17]" title="Wording, links and images you change here are matched by their old value and carried across. Each piece's own name, price and description are unique, so they stay themselves.">
  One design · saving updates all {captured.productCount}
 </span>
 )}
 <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-black/10 bg-stone-50 px-2.5 py-1.5">
 <Globe size={12} strokeWidth={2} className="shrink-0 text-stone-400" />
 <span className="truncate text-[12px] text-stone-500">{siteHost}{selPath === "/" ? "" : selPath}</span>
 </div>
 </div>

 {/* Preview surface — the pixel-perfect captured site */}
 {/* The canvas is often wider than this surface — at ANY window width, not just below 1280: a 1440
     laptop minus the 430px panel leaves ~1000px for a 1280px canvas. Plain centring pushed its left
     edge out where no scrollbar reaches; safe centring starts it at the left instead, and still
     centres it when it fits. */}
 <div ref={surfaceRef} className="relative flex min-h-0 flex-1 justify-center-safe overflow-auto bg-[#eeece7] p-4">
 {/* Zooming out means seeing MORE PAGE, not a narrower page.
     The frame stays exactly canvasW wide at every zoom — so the theme never reflows — and grows
     TALLER by 100/scale, which is what puts more of the page on screen. The outer box reserves the
     SCALED size, because a CSS transform doesn't change the space an element occupies: without it
     the surface has nothing to scroll and zooming in traps you with no way to reach the edges. */}
 <div className="h-full shrink-0 transition-[width] duration-200" style={{ width: canvasW * (zoom / 100) }}>
 <div style={{ width: canvasW, height: `${10000 / zoom}%`, transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}>
 <iframe ref={editIframe} key={`${selPath}-${previewKey}-${device}`} src={editSrc} onLoad={() => { setPanel(null); setSelImg(null); setSecRect(null); }} className="h-full w-full rounded-lg border border-black/10 bg-white shadow-sm" title="Page editor" />
 </div>
 </div>
 {/* Floating section bar — the SAME bar as the from-scratch builder, positioned over the selected section */}
 {panel && secRect && editIframe.current && !gridSel && (() => {
 const ir = editIframe.current.getBoundingClientRect();
 // secRect is measured INSIDE the frame, so it is in the page's own pixels. The frame is scaled,
 // so those have to be scaled too or the bar drifts further from its section the further you zoom.
 const z = zoom / 100;
 // ABOVE the section, not inside it. Anchored at the top edge it covered the first thing in the
 // section — which is usually the heading you clicked to get here. Falls back to just inside only
 // when the section starts at the very top of the frame and there is genuinely no room above.
 const anchorTop = txtSel ? Math.min(secRect.top, txtSel.top) : secRect.top;
 const top = Math.max(ir.top + 6, Math.min(ir.top + anchorTop * z - 46, ir.bottom - 54));
 const left = Math.min(Math.max(ir.left + secRect.cx * z, ir.left + 200), ir.right - 200);
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
 {typeof secStyle.btn === "string" && <ColorDot value={/^#[0-9a-fA-F]{6}$/.test(secStyle.btn) ? secStyle.btn : "#111111"} onChange={(v) => { setSecStyle((s) => ({ ...s, btn: v, btnSet: true })); postToPreview({ vya: "secbtn", value: v }); }} title="Buttons colour" />}
 <div className="flex shrink-0 items-center gap-1">
 <span className="text-[10px] uppercase tracking-wide text-stone-400">Space</span>
 <div className="flex overflow-hidden rounded-md border border-black/10">
 {([["sm", "24px"], ["md", "48px"], ["lg", "72px"], ["xl", "112px"]] as const).map(([lab, px]) => (
 <button key={lab} type="button" onClick={() => setSecSpace(px)} className={chip(false)}>{lab.toUpperCase()}</button>
 ))}
 </div>
 </div>
 {txtSel && (
  <>
   <span className="h-5 w-px shrink-0 bg-black/10" />
   <input
    type="color"
    value={/^#[0-9a-fA-F]{6}$/.test(txtSel.color) ? txtSel.color : "#000000"}
    onChange={(e) => { setTxtSel({ ...txtSel, color: e.target.value }); postToPreview({ vya: "txtstyle", prop: "color", value: e.target.value }); }}
    title="Text colour"
    className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-black/10 bg-white p-0"
   />
   {/* An existing button's own colour. Its label took Text colour, but nothing reached its fill, so no
       button that came with the site could change colour at all. */}
   {txtSel.btn !== null && (
    <label className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide text-stone-400" title="Button colour">
     Button
     <input
      type="color"
      value={/^#[0-9a-fA-F]{6}$/.test(txtSel.btn) ? txtSel.btn : "#000000"}
      onChange={(e) => { setTxtSel({ ...txtSel, btn: e.target.value }); postToPreview({ vya: "btnstyle", value: e.target.value }); }}
      aria-label="Button colour"
      className="h-6 w-6 cursor-pointer rounded-md border border-black/10 bg-white p-0"
     />
    </label>
   )}
   <button type="button" onClick={() => postToPreview({ vya: "txtstyle", prop: "font-size", dir: "dec" })} title="Smaller text" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800">A−</button>
   <button type="button" onClick={() => postToPreview({ vya: "txtstyle", prop: "font-size", dir: "inc" })} title="Bigger text" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800">A+</button>
   {(["left", "center", "right"] as const).map((a, i) => (
    <button key={a} type="button" onClick={() => { setTxtSel({ ...txtSel, align: a }); postToPreview({ vya: "txtstyle", prop: "text-align", value: a }); }} title={`Align ${a}`} className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition ${txtSel.align === a ? "bg-[#5D0F17] text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"}`}>
     {i === 0 ? <AlignLeft size={14} /> : i === 1 ? <AlignCenter size={14} /> : <AlignRight size={14} />}
    </button>
   ))}
  </>
 )}
 <span className="h-5 w-px shrink-0 bg-black/10" />
 <button type="button" onClick={() => postToPreview({ vya: "movesec", dir: "up" })} title="Move up" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"><ChevronUp size={15} /></button>
 <button type="button" onClick={() => postToPreview({ vya: "movesec", dir: "down" })} title="Move down" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"><ChevronDown size={15} /></button>
 <button type="button" onClick={() => postToPreview({ vya: "dupsec" })} title="Duplicate" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-[#5D0F17]"><Copy size={14} /></button>
 <button type="button" onClick={hideOrDeleteSection} title={secInfo && !secInfo.block ? (secInfo.hidden ? "Show to shoppers" : "Hide from shoppers") : "Delete"} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600">{secInfo && !secInfo.block ? (secInfo.hidden ? <Eye size={14} /> : <EyeOff size={14} />) : <Trash2 size={14} />}</button>
 </div>
 );
 })()}
 </div>
 {/* Pages strip — the captured site's pages as thumbnails (click to switch).
     Collapsed it is one scrolling row, which is fine for a five-page site and useless for
     eighty-two: the seller has no idea how many there are or what is down the far end. Expanded
     it wraps into a grid, which is the "zoom out and see everything" the block Studio already has.
     Pages nothing on her site links to sort last and are greyed — see app/lib/capture-links.ts. */}
 {captured.pages.length > 1 && (() => {
  const unlinked = new Set(captured.unlinked || []);
  // Default: not-live pages last. Once she has dragged anything, HER order wins outright — the
  // whole point is that the four pages she actually opens sit at the front.
  // Product pages are one design with a copy per piece; the strip shows the design once, at the end.
 const listable = captured.pages.filter((p) => !/^\/products\//.test(p));
 const byDefault = [...listable, ...(captured.productTemplate ? [captured.productTemplate] : [])].sort((a, b) => Number(unlinked.has(a)) - Number(unlinked.has(b)));
  const ordered = pageOrder && pageOrder.length ? applyPageOrder(pageOrder, byDefault) : byDefault;
  const hiddenCount = unlinked.size;

  const saveOrder = (next: string[]) => {
   setPageOrder(next); // the strip moves now; the save is a formality behind it
   fetch(withStore("/api/store/storefront/page-order"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next }),
   }).catch(() => { /* the arrangement is a preference — a failed save must not interrupt her */ });
  };
  const onDrop = (target: string) => {
   const from = dragFrom.current;
   dragFrom.current = null;
   if (!from || from === target) return;
   saveOrder(movePage(ordered, ordered.indexOf(from), ordered.indexOf(target)));
  };
  const Thumb = ({ p }: { p: string }) => {
   const off = unlinked.has(p);
   // What she has said about this page: hidden from shoppers, renamed, or one of the few that can
   // never be removed at all (home, the cart, the product template) — see site-builder/pages.ts.
   const meta = pagesList.find((x) => x.path === p) ?? null;
   const isHidden = !!meta?.hidden;
   const name = meta?.label || pageLabel(p);
   return (
    <div
     className="flex shrink-0 flex-col items-center gap-1.5"
     draggable
     onDragStart={(e) => { dragFrom.current = p; e.dataTransfer.effectAllowed = "move"; }}
     onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
     onDrop={(e) => { e.preventDefault(); onDrop(p); }}
     onDragEnd={() => { dragFrom.current = null; }}
    >
     {/* The card and its ✕ are SIBLINGS, not nested: a ✕ inside the card's button would fire the
         card's own "open this page" on every click. */}
     <div className="group relative">
      <button
       type="button"
       onClick={() => { setSelPath(p); setPanel(null); setSelImg(null); setPreviewKey((k) => k + 1); }}
       title={isHidden ? `${name} — hidden from shoppers` : off ? `${name} — came over fine, but nothing on your site links to it` : name}
       className={`relative grid h-[68px] w-[52px] place-items-center overflow-hidden rounded-md border bg-white shadow-sm transition ${selPath === p ? "border-[#5D0F17] ring-2 ring-[#5D0F17]/25" : "border-black/10 hover:border-black/25"} ${off || isHidden ? "opacity-45" : ""}`}
      >
       <div className="absolute inset-0 flex flex-col gap-1 p-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-stone-200" />
        <div className="h-1 w-full rounded-full bg-stone-100" />
        <div className="h-1 w-5/6 rounded-full bg-stone-100" />
        <div className="mt-auto h-3 w-full rounded-sm bg-stone-100" />
       </div>
      </button>
      {/* Hidden pages keep a permanently visible control, because it is the way back. Everything else
          shows it on hover or keyboard focus, so the strip stays a strip. */}
      {meta?.refusal ? null : (
       <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void askRemovePage(meta ?? { path: p, label: name, title: null, navLabel: null, hidden: isHidden, kind: "captured", group: "other", inMenu: false, canHide: true, refusal: null }); }}
        title={isHidden ? `Show “${name}” to shoppers again` : `Remove “${name}”`}
        aria-label={isHidden ? `Show ${name} to shoppers again` : `Remove ${name}`}
        className={`absolute -right-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full border border-black/10 bg-white text-stone-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 ${isHidden ? "opacity-100" : "opacity-0"}`}
       >
        {isHidden ? <Eye size={10} /> : <XIcon size={11} />}
       </button>
      )}
     </div>
     <span className={`max-w-[60px] truncate text-[10px] ${selPath === p ? "font-semibold text-[#5D0F17]" : off || isHidden ? "text-stone-400" : "text-stone-500"}`}>{name}</span>
     {isHidden
      ? <span className="rounded-full bg-[#5D0F17]/[0.08] px-1.5 py-px text-[9px] uppercase tracking-wide text-[#5D0F17]">Hidden</span>
      : off && <span className="rounded-full bg-stone-100 px-1.5 py-px text-[9px] uppercase tracking-wide text-stone-500">Not live</span>}
    </div>
   );
  };
  return (
   <div className="shrink-0 border-t border-black/10 bg-white">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 text-[11px] text-stone-500">
     <button type="button" onClick={() => setPagesOpen((o) => !o)} className="rounded-md px-2 py-1 font-semibold text-stone-600 transition hover:bg-stone-100">
      {pagesOpen ? "Collapse" : `All ${byDefault.length} pages`}
     </button>
     <span className="hidden text-stone-400 sm:inline">Drag to reorder — just for you, your site doesn’t change</span>
     {pageOrder && pageOrder.length > 0 && (
      <button type="button" onClick={() => saveOrder([])} className="rounded-md px-2 py-1 text-stone-500 transition hover:bg-stone-100" title="Put the strip back to its default order">
       Reset order
      </button>
     )}
     {hiddenCount > 0 && (
      <span title="These pages imported fine — nothing on your site links to them, so nobody browsing will find them. They still open for anyone with the direct link.">
       {hiddenCount} not live on your site
      </span>
     )}
     <div className="ml-auto flex items-center gap-2">
      <button type="button" onClick={() => setZoom((z) => Math.max(20, z - 10))} className="grid h-6 w-6 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100" aria-label="Zoom out">−</button>
      <input type="range" min={20} max={130} step={5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-1 w-24 accent-[#5D0F17]" aria-label="Zoom" />
      <button type="button" onClick={() => setZoom((z) => Math.min(130, z + 10))} className="grid h-6 w-6 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100" aria-label="Zoom in">+</button>
      <span className="w-9 text-right tabular-nums">{zoom}%</span>
     </div>
    </div>
    {pagesOpen ? (
     <div className="max-h-[38vh] overflow-y-auto px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
       {ordered.map((p) => <Thumb key={p} p={p} />)}
      </div>
     </div>
    ) : (
     <div className="flex items-end gap-3 overflow-x-auto px-4 py-3">
      {ordered.map((p) => <Thumb key={p} p={p} />)}
     </div>
    )}
   </div>
  );
 })()}
 </div>
 </div>
 </div>
 );
 }

 // No captured site: the canonical from-scratch builder is the Studio, rendered by the
 // /admin/storefront wrapper. Never fall through to the legacy in-file blocks builder — that was the
 // "old builder vs new builder" inconsistency (pressing reset dropped you into this UI instead of the
 // Studio). While the capture check is in flight, show a loader; once resolved with no capture, hand
 // off to the wrapper so it routes to the Studio.
 if (!captured) {
 const loader = (label: string) => <div className="grid h-screen w-full place-items-center bg-[#fbf9f5] text-[13px] text-stone-400">{label}</div>;
 if (!designLoaded) return loader("Loading your storefront…");
 if (typeof window !== "undefined") { window.location.replace("/admin/storefront"); return loader("Opening your builder…"); }
 return loader("Opening your builder…");
 }

}

// Hides the global floating chat launcher while the docked builder chat is on screen.
function HideGlobalChat() {
 useEffect(() => {
 window.dispatchEvent(new CustomEvent("vya:home-chat", { detail: true }));
 return () => { window.dispatchEvent(new CustomEvent("vya:home-chat", { detail: false })); };
 }, []);
 return null;
}
