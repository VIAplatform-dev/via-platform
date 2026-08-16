// Section-based storefront ("blocks"). A storefront's home page is an ordered list
// of blocks the seller — or VYA — can add, edit, reorder, and remove. Deliberately a
// small, curated set of section types (simpler than Shopify's nested tree), each with
// a flat props bag so VYA can build them conversationally.

export type BlockType = "announcement" | "hero" | "featured" | "split" | "text" | "image" | "gallery" | "marquee" | "statement" | "spotlight" | "video" | "newsletter" | "custom";
// Per-section visual overrides set from the Design panel (all optional; unset = theme default).
export type BlockScale = "sm" | "md" | "lg" | "xl";
export type BlockAlign = "left" | "center" | "right";
export type BlockStyle = {
 bg?: string; // "accent" | "dark" | a #hex (default = theme background)
 bgImage?: string; // URL — a full-bleed background photo behind the whole section (wins over bg colour)
 textColor?: string; // #hex — overrides the section's text colour
 align?: BlockAlign; // text alignment
 headingSize?: BlockScale; // heading scale
 space?: BlockScale; // extra vertical breathing room around the section
};
// Free-form overlay elements ("add a button/text/image anywhere on a section"). Each is anchored to a
// section and positioned in PERCENT of that section's box (0–100), so it scales with the layout instead
// of breaking at a fixed pixel. On narrow screens the overlay layer auto-stacks below the section content
// (see Blocks) so nothing overlaps or runs off a phone.
export type OverlayKind = "button" | "text" | "image";
export type Overlay = {
 id: string;
 kind: OverlayKind;
 x: number; // 0–100, % of section width (left edge of the element)
 y: number; // 0–100, % of section height (top edge)
 w?: number; // 0–100, % width (images size by this; text/buttons hug their content)
 props: Record<string, string>; // button: {label, href, bg, color}; text: {text, color, size}; image: {src, alt}
};
export type Block = { id: string; type: BlockType; props: Record<string, string>; style?: BlockStyle; overlays?: Overlay[] };

export type BlockField = { key: string; label: string; kind: "text" | "textarea" | "image" };
export type BlockDef = { type: BlockType; label: string; description: string; fields: BlockField[]; defaults: Record<string, string> };

export const BLOCK_TYPES: BlockDef[] = [
 { type: "announcement", label: "Announcement bar", description: "A thin bar across the very top.", fields: [{ key: "text", label: "Text", kind: "text" }], defaults: { text: "Free shipping on orders over $150" } },
 { type: "hero", label: "Hero banner", description: "A large banner with a heading and button.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Subtext", kind: "text" }, { key: "cta", label: "Button label", kind: "text" }, { key: "image", label: "Background image", kind: "image" }], defaults: { heading: "New Arrivals", subtext: "Curated vintage, one-of-one.", cta: "Shop now", image: "" } },
 { type: "featured", label: "Featured products", description: "A grid of your products.", fields: [{ key: "heading", label: "Heading", kind: "text" }], defaults: { heading: "The Edit" } },
 { type: "split", label: "Split — image & text", description: "A photo beside a heading, paragraph, and button — the editorial workhorse for a story or a category.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }, { key: "cta", label: "Button label", kind: "text" }, { key: "image", label: "Image", kind: "image" }, { key: "imageSide", label: "Image side (left or right)", kind: "text" }], defaults: { heading: "Every piece, one of one", body: "Tell the story behind your edit — what you source, how you find it, why it matters.", cta: "", image: "", imageSide: "left" } },
 { type: "text", label: "Text", description: "A heading and a paragraph — your story, shipping info, anything.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }], defaults: { heading: "About", body: "Tell your story here." } },
 { type: "image", label: "Image", description: "A full-width photo from your library.", fields: [{ key: "image", label: "Image", kind: "image" }, { key: "caption", label: "Caption", kind: "text" }], defaults: { image: "", caption: "" } },
 { type: "gallery", label: "Gallery", description: "A row of photos from your library.", fields: [{ key: "images", label: "Image URLs (one per line)", kind: "textarea" }], defaults: { images: "" } },
 { type: "marquee", label: "Marquee — scrolling strip", description: "A moving strip of words that scrolls across — the designers or brands you carry, or a tagline.", fields: [{ key: "items", label: "Items (one per line or comma-separated)", kind: "textarea" }], defaults: { items: "" } },
 { type: "statement", label: "Statement — big quote", description: "One large statement or quote. Best given a dark or accent background for drama.", fields: [{ key: "quote", label: "Quote", kind: "textarea" }, { key: "attribution", label: "Attribution", kind: "text" }], defaults: { quote: "When it’s gone, it’s gone.", attribution: "" } },
 { type: "spotlight", label: "Spotlight — one piece", description: "Feature a single hero product, big, with its details and a button.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Details", kind: "textarea" }, { key: "price", label: "Price", kind: "text" }, { key: "cta", label: "Button label", kind: "text" }, { key: "image", label: "Image", kind: "image" }], defaults: { heading: "Piece of the week", subtext: "", price: "", cta: "Shop this piece", image: "" } },
 { type: "video", label: "Video", description: "Embed a video — paste a YouTube, Vimeo, or .mp4 link.", fields: [{ key: "url", label: "Video URL (YouTube, Vimeo, or .mp4)", kind: "text" }, { key: "caption", label: "Caption", kind: "text" }], defaults: { url: "", caption: "" } },
 { type: "newsletter", label: "Newsletter signup", description: "Collect emails from your visitors.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Subtext", kind: "text" }], defaults: { heading: "Join the list", subtext: "First access to new arrivals." } },
 // Escape hatch: any custom component VYA (or a hands-on seller) builds from HTML — accordions,
 // tabs, comparison tables, timelines… Paired with custom CSS this can express anything the fixed
 // section types can't. The HTML is sanitized to a safe allowlist on save (see sanitize-storefront-html).
 { type: "custom", label: "Custom section", description: "Anything else — accordions, tabs, tables, or fully interactive widgets. Ask VYA to build it, or write your own HTML/CSS/JS. Add JS and it runs safely in an isolated sandbox.", fields: [{ key: "html", label: "HTML", kind: "textarea" }, { key: "css", label: "CSS (optional)", kind: "textarea" }, { key: "js", label: "JavaScript (optional — runs sandboxed)", kind: "textarea" }], defaults: { html: "" } },
];

export const BLOCK_TYPE_IDS = BLOCK_TYPES.map((b) => b.type);

export function blockDef(type: string): BlockDef | undefined {
 return BLOCK_TYPES.find((b) => b.type === type);
}

let seq = 0;
export function newBlockId(): string {
 seq += 1;
 return `b_${Date.now().toString(36)}${seq}`;
}

export function makeBlock(type: BlockType, props?: Record<string, string>): Block {
 const def = blockDef(type);
 return { id: newBlockId(), type, props: { ...(def?.defaults || {}), ...(props || {}) } };
}

// Default props + a sensible starting position (roughly centred) for a new overlay element.
const OVERLAY_DEFAULTS: Record<OverlayKind, Record<string, string>> = {
 button: { label: "Shop now", href: "", bg: "#1a1a1a", color: "#ffffff" },
 text: { text: "Double-click to edit", color: "#ffffff", size: "md" },
 image: { src: "", alt: "" },
};
export function makeOverlay(kind: OverlayKind): Overlay {
 seq += 1;
 return { id: `o_${Date.now().toString(36)}${seq}`, kind, x: 38, y: 42, ...(kind === "image" ? { w: 28 } : {}), props: { ...OVERLAY_DEFAULTS[kind] } };
}

const clampPct = (v: unknown, lo: number, hi: number, dflt: number): number => {
 const n = Number(v);
 return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
// Only allow same-origin paths or http(s)/mailto links (no javascript:) for overlay button hrefs.
const safeHref = (v: unknown): string => {
 const s = String(v ?? "").trim().slice(0, 400);
 if (!s) return "";
 return /^(https?:\/\/|mailto:|\/)/i.test(s) ? s : "";
};
const safeSrc = (v: unknown): string => {
 const s = String(v ?? "").trim().slice(0, 800);
 return /^(https?:\/\/|\/)/i.test(s) ? s : "";
};

export function sanitizeOverlays(input: unknown): Overlay[] {
 if (!Array.isArray(input)) return [];
 const out: Overlay[] = [];
 for (const raw of input.slice(0, 24)) {
 const o = raw as Overlay;
 if (o?.kind !== "button" && o?.kind !== "text" && o?.kind !== "image") continue;
 const p: Record<string, string> = {};
 if (o.kind === "button") {
 p.label = String(o.props?.label ?? "").slice(0, 80);
 p.href = safeHref(o.props?.href);
 p.bg = /^#[0-9a-fA-F]{6}$/.test(String(o.props?.bg ?? "")) ? o.props!.bg : "#1a1a1a";
 p.color = /^#[0-9a-fA-F]{6}$/.test(String(o.props?.color ?? "")) ? o.props!.color : "#ffffff";
 } else if (o.kind === "text") {
 p.text = String(o.props?.text ?? "").slice(0, 240);
 p.color = /^#[0-9a-fA-F]{6}$/.test(String(o.props?.color ?? "")) ? o.props!.color : "#ffffff";
 p.size = ["sm", "md", "lg", "xl"].includes(String(o.props?.size ?? "")) ? o.props!.size : "md";
 if (o.props?.bold === "1") p.bold = "1";
 if (o.props?.italic === "1") p.italic = "1";
 } else {
 p.src = safeSrc(o.props?.src);
 p.alt = String(o.props?.alt ?? "").slice(0, 200);
 }
 out.push({
 id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `o_${newBlockId()}`,
 kind: o.kind,
 x: clampPct(o.x, 0, 100, 40),
 y: clampPct(o.y, 0, 100, 42),
 ...(o.w != null ? { w: clampPct(o.w, 5, 100, 28) } : {}),
 props: p,
 });
 }
 return out;
}

// A sensible starting page for a brand-new storefront.
export function defaultBlocks(): Block[] {
 return [makeBlock("hero"), makeBlock("featured")];
}

// Additional storefront pages (beyond the home page) — each built from the same
// blocks. The home page lives in theme.blocks; these live in theme.extraPages.
export type StorePage = { slug: string; title: string; blocks: Block[] };

export function pageSlugify(s: string): string {
 return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page";
}

const RESERVED_SLUGS = new Set(["shop", "home", "cart", "checkout", "preview"]);

export function sanitizePages(input: unknown): StorePage[] {
 if (!Array.isArray(input)) return [];
 const out: StorePage[] = [];
 const seen = new Set<string>();
 for (const raw of input) {
 const p = raw as StorePage;
 let slug = pageSlugify(p?.slug || p?.title || "");
 if (RESERVED_SLUGS.has(slug) || seen.has(slug)) slug = `${slug}-${out.length + 1}`;
 seen.add(slug);
 out.push({ slug, title: String(p?.title || slug).slice(0, 60), blocks: sanitizeBlocks(p?.blocks) });
 }
 return out;
}

// Keep only known block types + string props (defensive on read/write).
export function sanitizeBlocks(input: unknown): Block[] {
 if (!Array.isArray(input)) return [];
 const out: Block[] = [];
 for (const raw of input) {
 const b = raw as Block;
 if (!b || !blockDef(b.type)) continue;
 const props: Record<string, string> = {};
 for (const [k, v] of Object.entries(b.props || {})) props[k] = String(v ?? "");
 const s = (b.style || {}) as BlockStyle;
 const bg = String(s.bg ?? "");
 const scale = (v: unknown): BlockScale | undefined => (v === "sm" || v === "md" || v === "lg" || v === "xl" ? v : undefined);
 const style: BlockStyle = {};
 if (bg === "accent" || bg === "dark" || /^#[0-9a-fA-F]{6}$/.test(bg)) style.bg = bg;
 const bgImg = safeSrc(s.bgImage);
 if (bgImg) style.bgImage = bgImg;
 if (/^#[0-9a-fA-F]{6}$/.test(String(s.textColor ?? ""))) style.textColor = s.textColor;
 if (s.align === "left" || s.align === "center" || s.align === "right") style.align = s.align;
 if (scale(s.headingSize)) style.headingSize = s.headingSize;
 if (scale(s.space)) style.space = s.space;
 const hasStyle = Object.keys(style).length > 0;
 const overlays = sanitizeOverlays(b.overlays);
 out.push({ id: typeof b.id === "string" && b.id ? b.id : newBlockId(), type: b.type, props, ...(hasStyle ? { style } : {}), ...(overlays.length ? { overlays } : {}) });
 }
 return out;
}
