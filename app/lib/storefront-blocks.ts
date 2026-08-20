// Section-based storefront ("blocks"). A storefront's home page is an ordered list
// of blocks the seller — or VYA — can add, edit, reorder, and remove. Deliberately a
// small, curated set of section types (simpler than Shopify's nested tree), each with
// a flat props bag so VYA can build them conversationally.

export type BlockType = "announcement" | "hero" | "featured" | "collections" | "testimonials" | "countdown" | "blog" | "split" | "columns" | "text" | "image" | "gallery" | "marquee" | "statement" | "spotlight" | "video" | "newsletter" | "contact" | "faq" | "custom";
// Per-section visual overrides set from the Design panel (all optional; unset = theme default).
export type BlockScale = "sm" | "md" | "lg" | "xl";
export type BlockAlign = "left" | "center" | "right";
export type BlockShadow = "sm" | "md" | "lg" | "xl";
export type BlockStyle = {
 bg?: string; // "accent" | "dark" | a #hex (default = theme background)
 bgGradient?: string; // "#hex|#hex|angleDeg" — a two-stop linear gradient (wins over bg colour)
 bgImage?: string; // URL — a full-bleed background photo behind the whole section (wins over gradient/colour)
 bgOverlay?: number; // 0–80 — dark scrim strength over a background photo (for legible text)
 textColor?: string; // #hex — overrides the section's text colour
 align?: BlockAlign; // text alignment
 headingSize?: BlockScale; // heading scale
 headingFont?: string; // per-section heading font override
 tracking?: number; // heading letter-spacing, in hundredths of an em (2 = 0.02em; negatives allowed)
 space?: BlockScale; // vertical breathing-room preset (used when padY isn't set)
 padY?: number; // px — explicit vertical padding (overrides `space`)
 padX?: number; // px — explicit horizontal padding
 radius?: number; // px — section corner radius
 border?: number; // px — section border width
 borderColor?: string; // #hex — section border colour
 shadow?: BlockShadow; // preset drop shadow
};
// Free-form overlay elements ("add a button/text/image anywhere on a section"). Each is anchored to a
// section and positioned in PERCENT of that section's box (0–100), so it scales with the layout instead
// of breaking at a fixed pixel. On narrow screens the overlay layer auto-stacks below the section content
// (see Blocks) so nothing overlaps or runs off a phone.
export type OverlayKind = "button" | "text" | "image" | "rect" | "circle" | "line";
export type Overlay = {
 id: string;
 kind: OverlayKind;
 x: number; // 0–100, % of section width (left edge of the element)
 y: number; // 0–100, % of section height (top edge)
 w?: number; // 0–100, % width (images/shapes size by this; text/buttons hug their content unless resized)
 h?: number; // 0–100, % height (images/shapes; text/buttons auto-height)
 props: Record<string, string>; // button:{label,href,bg,color}; text:{text,color,size}; image:{src,alt}; rect/circle:{fill,radius,opacity}; line:{color,thickness}
};
export type Block = { id: string; type: BlockType; props: Record<string, string>; style?: BlockStyle; overlays?: Overlay[] };

export type BlockField = { key: string; label: string; kind: "text" | "textarea" | "image" | "datetime" };
export type BlockDef = { type: BlockType; label: string; description: string; fields: BlockField[]; defaults: Record<string, string> };

export const BLOCK_TYPES: BlockDef[] = [
 { type: "announcement", label: "Announcement bar", description: "A thin bar across the very top.", fields: [{ key: "text", label: "Text", kind: "text" }], defaults: { text: "Free shipping on orders over $150" } },
 { type: "hero", label: "Hero banner", description: "A large banner with a heading and button.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Subtext", kind: "text" }, { key: "cta", label: "Button label", kind: "text" }, { key: "image", label: "Background image", kind: "image" }], defaults: { heading: "New Arrivals", subtext: "Curated vintage, one-of-one.", cta: "Shop now", image: "" } },
 { type: "featured", label: "Featured products", description: "A grid of your products.", fields: [{ key: "heading", label: "Heading", kind: "text" }], defaults: { heading: "The Edit" } },
 // Shop-by-category tiles — the single most common section on real vintage/fashion stores. Gets a shopper
 // to what they want in one click; each tile deep-links a category, which is strong internal-linking SEO.
 { type: "collections", label: "Shop by category", description: "A grid of category/collection tiles — the fastest way for shoppers to find what they want.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "items", label: "Tiles — one per line, 'Label | image URL' (image optional)", kind: "textarea" }], defaults: { heading: "Shop by category", items: "Dresses\nOuterwear\nHandbags\nShoes\nDenim\nAccessories", cols: "3" } },
 // Social proof — customer reviews. Present on nearly every store that converts; builds trust before the buy.
 { type: "testimonials", label: "Reviews", description: "Customer quotes with names and stars — social proof that lifts trust and conversion.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "items", label: "Reviews — one per line, 'Quote | Name'", kind: "textarea" }], defaults: { heading: "Loved by our customers", items: "Exactly as described and the quality is incredible. | Maya R.\nMy new favourite shop — everything is one of one. | Priya S.\nShipped fast and beautifully packaged. | Jordan T." } },
 // Live drop countdown — urgency for the next release, and it brings shoppers back at drop time.
 { type: "countdown", label: "Drop countdown", description: "A live countdown to your next drop — builds urgency and pulls shoppers back when it goes live.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Subtext", kind: "text" }, { key: "date", label: "Drop date & time", kind: "datetime" }, { key: "cta", label: "Button label (optional)", kind: "text" }, { key: "ctaHref", label: "Button link (optional)", kind: "text" }], defaults: { heading: "The next drop lands in", subtext: "Set your alarm — one-of-ones, gone when they’re gone.", date: "", cta: "", ctaHref: "" } },
 // Blog / journal — editorial content (care guides, lookbooks, icons). Brand-building and strong for SEO.
 { type: "blog", label: "Blog / journal", description: "A row of articles or lookbook posts — editorial content that builds the brand and helps SEO.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "items", label: "Posts — one per line, 'Title | excerpt | image URL | link'", kind: "textarea" }], defaults: { heading: "The Journal", items: "Caring for vintage leather | Keep your finds looking their best. | | \nVintage icons: the Lady bag | The story behind a classic. | | \nStyling denim three ways | From day to night. | | " } },
 { type: "split", label: "Split — image & text", description: "A photo beside a heading, paragraph, and button — the editorial workhorse for a story or a category.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }, { key: "cta", label: "Button label", kind: "text" }, { key: "image", label: "Image", kind: "image" }, { key: "imageSide", label: "Image side (left or right)", kind: "text" }], defaults: { heading: "Every piece, one of one", body: "Tell the story behind your edit — what you source, how you find it, why it matters.", cta: "", image: "", imageSide: "left" } },
 // Flexible multi-column content — 2/3/4 columns, each an optional image + heading + text + button.
 // The general-purpose "put content side by side" layout: feature rows, values, how-it-works, categories.
 { type: "columns", label: "Columns", description: "Content side by side — 2, 3, or 4 columns, each with an optional image, heading, text, and button.", fields: [{ key: "heading", label: "Heading (optional)", kind: "text" }, { key: "items", label: "Columns — one per line, 'Heading | Text | image URL | button label | button link'", kind: "textarea" }], defaults: { heading: "", items: "Sourced with care | Every piece is hand-selected for quality and authenticity. | | | \nOne of one | No restocks — when it’s gone, it’s gone. | | | \nShipped fast | Carefully packaged and on its way within a day. | | | ", cols: "3" } },
 { type: "text", label: "Text", description: "A heading and a paragraph — your story, shipping info, anything.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }], defaults: { heading: "About", body: "Tell your story here." } },
 { type: "image", label: "Image", description: "A full-width photo from your library.", fields: [{ key: "image", label: "Image", kind: "image" }, { key: "caption", label: "Caption", kind: "text" }], defaults: { image: "", caption: "" } },
 { type: "gallery", label: "Gallery", description: "A row of photos from your library.", fields: [{ key: "images", label: "Image URLs (one per line)", kind: "textarea" }], defaults: { images: "" } },
 { type: "marquee", label: "Marquee — scrolling strip", description: "A moving strip of words that scrolls across — the designers or brands you carry, or a tagline.", fields: [{ key: "items", label: "Items (one per line or comma-separated)", kind: "textarea" }, { key: "sep", label: "Separator between items (e.g. ✦ • — /, or leave blank for none)", kind: "text" }], defaults: { items: "", sep: "✦" } },
 { type: "statement", label: "Statement — big quote", description: "One large statement or quote. Best given a dark or accent background for drama.", fields: [{ key: "quote", label: "Quote", kind: "textarea" }, { key: "attribution", label: "Attribution", kind: "text" }], defaults: { quote: "When it’s gone, it’s gone.", attribution: "" } },
 { type: "spotlight", label: "Spotlight — one piece", description: "Feature a single hero product, big, with its details and a button.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Details", kind: "textarea" }, { key: "price", label: "Price", kind: "text" }, { key: "cta", label: "Button label", kind: "text" }, { key: "image", label: "Image", kind: "image" }], defaults: { heading: "Piece of the week", subtext: "", price: "", cta: "Shop this piece", image: "" } },
 { type: "video", label: "Video", description: "Embed a video — paste a YouTube, Vimeo, or .mp4 link.", fields: [{ key: "url", label: "Video URL (YouTube, Vimeo, or .mp4)", kind: "text" }, { key: "caption", label: "Caption", kind: "text" }], defaults: { url: "", caption: "" } },
 { type: "newsletter", label: "Newsletter signup", description: "Collect emails from your visitors.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Subtext", kind: "text" }], defaults: { heading: "Join the list", subtext: "First access to new arrivals." } },
 // A real contact form (name · email · message) that emails the store, plus an optional contact email.
 { type: "contact", label: "Contact form", description: "A get-in-touch form — name, email, message — plus your contact email. Every store should have one.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Subtext", kind: "text" }, { key: "email", label: "Contact email (optional, shown below the form)", kind: "text" }], defaults: { heading: "Get in touch", subtext: "Questions about a piece, sizing, or an order? Send us a note.", email: "" } },
 // A real, interactive accordion — each Q&A is a stored pair (q0/a0, q1/a1…), so it's editable on the
 // canvas and expands on click natively (<details>), no scripts. Great for FAQs, shipping, sizing.
 { type: "faq", label: "FAQ / Accordion", description: "Expandable question-and-answer rows — click to open. Perfect for FAQs, shipping & returns, sizing.", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "subtext", label: "Intro line (optional)", kind: "textarea" }], defaults: { heading: "Frequently asked", subtext: "", q0: "How are pieces sourced?", a0: "Every piece is hand-selected for quality and authenticity.", q1: "What condition are items in?", a1: "Condition is noted on each listing — most pieces are pre-loved or vintage.", q2: "Do you accept returns?", a2: "See our Shipping & Returns page for the details." } },
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
 rect: { fill: "#1a1a1a", radius: "10", opacity: "100" },
 circle: { fill: "#1a1a1a", radius: "0", opacity: "100" },
 line: { color: "#1a1a1a", thickness: "2" },
};
// Starting box (in % of the section) per kind — shapes/images get a real size so they render
// immediately; text/buttons stay auto-sized until the seller drags a resize handle.
const OVERLAY_START: Partial<Record<OverlayKind, { w?: number; h?: number }>> = {
 image: { w: 28 },
 rect: { w: 26, h: 16 },
 circle: { w: 16, h: 16 },
 line: { w: 30 },
};
export function makeOverlay(kind: OverlayKind): Overlay {
 seq += 1;
 return { id: `o_${Date.now().toString(36)}${seq}`, kind, x: 38, y: 42, ...(OVERLAY_START[kind] || {}), props: { ...OVERLAY_DEFAULTS[kind] } };
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

const OVERLAY_KINDS: OverlayKind[] = ["button", "text", "image", "rect", "circle", "line"];
// A font-family name — letters/numbers/spaces/hyphens only (matches the storefront font list; no CSS injection).
const safeFont = (v: unknown) => String(v ?? "").slice(0, 50).replace(/[^\w \-]/g, "").trim();
const hex6 = (v: unknown, dflt: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v ?? "")) ? String(v) : dflt);
const intStr = (v: unknown, lo: number, hi: number, dflt: number) => String(Math.min(hi, Math.max(lo, Math.round(Number(v)) || dflt)));

export function sanitizeOverlays(input: unknown): Overlay[] {
 if (!Array.isArray(input)) return [];
 const out: Overlay[] = [];
 for (const raw of input.slice(0, 24)) {
 const o = raw as Overlay;
 if (!OVERLAY_KINDS.includes(o?.kind)) continue;
 const p: Record<string, string> = {};
 if (o.kind === "button") {
 p.label = String(o.props?.label ?? "").slice(0, 80);
 p.href = safeHref(o.props?.href);
 p.bg = hex6(o.props?.bg, "#1a1a1a");
 p.color = hex6(o.props?.color, "#ffffff");
 if (o.props?.font) p.font = safeFont(o.props.font);
 } else if (o.kind === "text") {
 p.text = String(o.props?.text ?? "").slice(0, 240);
 p.color = hex6(o.props?.color, "#ffffff");
 p.size = ["sm", "md", "lg", "xl"].includes(String(o.props?.size ?? "")) ? o.props!.size : "md";
 if (o.props?.bold === "1") p.bold = "1";
 if (o.props?.italic === "1") p.italic = "1";
 if (o.props?.font) p.font = safeFont(o.props.font);
 } else if (o.kind === "image") {
 p.src = safeSrc(o.props?.src);
 p.alt = String(o.props?.alt ?? "").slice(0, 200);
 } else if (o.kind === "rect" || o.kind === "circle") {
 p.fill = hex6(o.props?.fill, "#1a1a1a");
 p.radius = intStr(o.props?.radius, 0, 400, o.kind === "rect" ? 10 : 0);
 p.opacity = intStr(o.props?.opacity, 0, 100, 100);
 } else if (o.kind === "line") {
 p.color = hex6(o.props?.color, "#1a1a1a");
 p.thickness = intStr(o.props?.thickness, 1, 40, 2);
 }
 out.push({
 id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `o_${newBlockId()}`,
 kind: o.kind,
 x: clampPct(o.x, 0, 100, 40),
 y: clampPct(o.y, 0, 100, 42),
 ...(o.w != null ? { w: clampPct(o.w, 2, 100, 28) } : {}),
 ...(o.h != null ? { h: clampPct(o.h, 2, 100, 16) } : {}),
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
 // Deep style inspector props — validate colours, clamp numbers, whitelist enums.
 const hex = (v: unknown) => /^#[0-9a-fA-F]{6}$/.test(String(v ?? ""));
 const num = (v: unknown, lo: number, hi: number): number | undefined => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };
 // gradient: "#hex|#hex|angle"
 if (typeof s.bgGradient === "string") { const parts = s.bgGradient.split("|"); if (parts.length === 3 && hex(parts[0]) && hex(parts[1])) { const a = num(parts[2], 0, 360) ?? 180; style.bgGradient = `${parts[0]}|${parts[1]}|${a}`; } }
 { const o = num(s.bgOverlay, 0, 80); if (o !== undefined) style.bgOverlay = o; }
 if (hex(s.headingFont) ? false : typeof s.headingFont === "string" && s.headingFont.trim()) style.headingFont = String(s.headingFont).slice(0, 50).replace(/[^\w \-]/g, "");
 { const t = num(s.tracking, -10, 40); if (t !== undefined) style.tracking = t; }
 { const p = num(s.padY, 0, 240); if (p !== undefined) style.padY = p; }
 { const p = num(s.padX, 0, 160); if (p !== undefined) style.padX = p; }
 { const r = num(s.radius, 0, 80); if (r !== undefined) style.radius = r; }
 { const bw = num(s.border, 0, 12); if (bw !== undefined) style.border = bw; }
 if (hex(s.borderColor)) style.borderColor = s.borderColor;
 if (s.shadow === "sm" || s.shadow === "md" || s.shadow === "lg" || s.shadow === "xl") style.shadow = s.shadow;
 const hasStyle = Object.keys(style).length > 0;
 const overlays = sanitizeOverlays(b.overlays);
 out.push({ id: typeof b.id === "string" && b.id ? b.id : newBlockId(), type: b.type, props, ...(hasStyle ? { style } : {}), ...(overlays.length ? { overlays } : {}) });
 }
 return out;
}
