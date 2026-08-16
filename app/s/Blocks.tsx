/* eslint-disable @next/next/no-img-element */
// Presentational renderer for the section-based storefront. No hooks / no client
// APIs, so it renders identically in the live store (server component) and the
// editor's live preview (client). Sections come from theme.blocks.
import type { Block, BlockStyle, Overlay } from "@/app/lib/storefront-blocks";
import { SERIF_FONTS } from "@/app/lib/storefront-templates";
import { GripVertical } from "lucide-react";
import NewsletterForm from "./NewsletterForm";
import SandboxEmbed from "./SandboxEmbed";

const ff = (name?: string) => (name ? `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

export type BlockProduct = { key?: string; title: string; price: string; image: string; href?: string };
type Colors = { bg: string; text: string; accent: string };
export type Radius = "sharp" | "soft" | "round";

// Corner style ("shapes") → CSS radius, in px. Images/cards get a moderate curve; buttons go fully
// pill on "round". A single scoped <style> drives it so it's one control, applied everywhere at once.
const IMG_RADIUS: Record<Radius, number> = { sharp: 0, soft: 14, round: 26 };
const BTN_RADIUS: Record<Radius, number> = { sharp: 0, soft: 8, round: 999 };

// ── Free-form overlay elements (a button / text / image dragged onto a section) ──
// Rendered both live (interactive: real anchors/images) and in the editor (inert content, the wrapper
// owns pointer events for drag/select). Positioned in % so it scales; the stacking on narrow screens is
// handled by a container query in the root <style> (see below) — no per-element JS.
const OVL_TEXT_SIZE: Record<string, string> = { sm: "text-sm", md: "text-xl", lg: "text-3xl @xl:text-4xl", xl: "text-5xl @xl:text-6xl" };
type OverlayEdit = {
 selectedId?: string | null;
 onSelect: (blockId: string, overlayId: string) => void;
 onDragStart: (blockId: string, overlayId: string, e: React.PointerEvent) => void;
};
function overlayContent(o: Overlay, shopHref: string, head: string | undefined, live: boolean) {
 const p = o.props || {};
 if (o.kind === "button") {
 const cls = "vya-cta inline-block whitespace-nowrap px-7 py-3 text-[12px] font-medium uppercase tracking-[0.18em]";
 const style = { background: p.bg || "#1a1a1a", color: p.color || "#ffffff" };
 return live
 ? <a href={p.href || shopHref} className={cls} style={style}>{p.label || "Button"}</a>
 : <span className={cls} style={style}>{p.label || "Button"}</span>;
 }
 if (o.kind === "image") {
 return p.src
 ? <img src={p.src} alt={p.alt || ""} className="vya-round block h-auto w-full object-cover" />
 : <div className="vya-round grid aspect-square w-full place-items-center bg-black/10 text-[10px] uppercase tracking-wide text-black/40">Image</div>;
 }
 return <div className={`${OVL_TEXT_SIZE[p.size || "md"]} leading-tight`} style={{ color: p.color || "#ffffff", fontFamily: p.size === "lg" || p.size === "xl" ? head : undefined, fontWeight: p.bold === "1" ? 700 : 500, fontStyle: p.italic === "1" ? "italic" : undefined }}>{p.text || "Text"}</div>;
}

function isDark(hex: string): boolean {
 const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
 return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

// Resolve a section's background → { background, fg (text colour) }.
function bgFor(bg: string | undefined, colors: Colors): { background?: string; fg: string } {
 if (!bg) return { fg: colors.text };
 if (bg === "dark") return { background: "#161616", fg: "#ffffff" };
 if (bg === "accent") return { background: colors.accent, fg: "#ffffff" };
 if (/^#[0-9a-fA-F]{6}$/.test(bg)) return { background: bg, fg: isDark(bg) ? "#ffffff" : colors.text };
 return { fg: colors.text };
}

// ── per-section visual overrides (the Design panel) → scoped CSS ──────────────
// Emitted as a <style> scoped to `.vya-b-<id>`, with !important so friendly controls reliably beat
// the section's utility classes. Same output in the editor preview and on the live site.
const PAD_SCALE: Record<string, string> = { sm: "1rem", md: "2.5rem", lg: "4.5rem", xl: "7rem" };
const HEAD_SCALE: Record<string, string> = { sm: "1.6rem", md: "2.3rem", lg: "3.2rem", xl: "4.3rem" };
const ALIGN_FLEX: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
function sectionOverrideCss(id: string, st: BlockStyle): string {
 const sel = `.vya-b-${id}`;
 const out: string[] = [];
 if (st.align) {
 out.push(`${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{text-align:${st.align}!important}`);
 out.push(`${sel} .vya-hero-inner{align-items:${ALIGN_FLEX[st.align]}!important;text-align:${st.align}!important}`);
 }
 if (st.textColor) out.push(`${sel},${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{color:${st.textColor}!important}`);
 if (st.headingSize) out.push(`${sel} .vya-heading{font-size:${HEAD_SCALE[st.headingSize]}!important;line-height:1.12!important}`);
 if (st.space) out.push(`${sel}{padding-top:${PAD_SCALE[st.space]}!important;padding-bottom:${PAD_SCALE[st.space]}!important}`);
 return out.join("");
}

// ── inline rich text (the editor writes it on the canvas, the live storefront renders it) ──
// Store owners format their own copy, and it renders on their own public storefront, so this is
// self-authored content — but the storefront is public, so we still keep a tight allowlist and
// sanitize at both ends: a DOM walker at capture time, a script/attr strip at render time.
function escHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s: string) { return escHtml(s).replace(/"/g, "&quot;"); }
const SAFE_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "A", "BR", "SPAN"]);
function safeStyle(s: CSSStyleDeclaration): string {
 const parts: string[] = [];
 if (s.color && /^(rgb|#)/i.test(s.color)) parts.push(`color:${s.color}`);
 if (s.fontWeight === "bold" || (parseInt(s.fontWeight) || 0) >= 600) parts.push("font-weight:600");
 if (s.fontStyle === "italic") parts.push("font-style:italic");
 if ((s.textDecorationLine || s.textDecoration || "").includes("underline")) parts.push("text-decoration:underline");
 const size = parseFloat(s.fontSize);
 if (size >= 8 && size <= 200) parts.push(`font-size:${Math.round(size)}px`);
 return parts.join(";");
}
// Client-only (runs in an onBlur handler): serialize a contentEditable subtree into safe inline HTML.
function serializeInline(node: Node): string {
 let out = "";
 node.childNodes.forEach((n) => {
 if (n.nodeType === Node.TEXT_NODE) { out += escHtml(n.textContent || ""); return; }
 if (n.nodeType !== Node.ELEMENT_NODE) return;
 const el = n as HTMLElement;
 const tag = el.tagName;
 if (tag === "BR") { out += "<br>"; return; }
 const inner = serializeInline(el);
 if (!SAFE_TAGS.has(tag)) { out += inner; return; } // unwrap unknowns (e.g. DIV) but keep their text
 if (tag === "A") {
 const href = el.getAttribute("href") || "";
 out += /^(https?:|mailto:)/i.test(href) ? `<a href="${escAttr(href)}">${inner}</a>` : inner;
 } else if (tag === "SPAN") {
 const style = safeStyle(el.style);
 out += style ? `<span style="${style}">${inner}</span>` : inner;
 } else if (tag === "STRONG") out += `<b>${inner}</b>`;
 else if (tag === "EM") out += `<i>${inner}</i>`;
 else out += `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
 });
 return out;
}
// Render-time: only trust a value as HTML if it carries markup; strip anything script-like as a guard.
function inlineHtml(v?: string): { __html: string } | null {
 if (!v || v.indexOf("<") === -1) return null;
 return { __html: v.replace(/<\s*script/gi, "").replace(/\son\w+\s*=/gi, " ").replace(/javascript:/gi, "") };
}

type Ctx = { colors: Colors; head?: string; body?: string; products: BlockProduct[]; shopHref: string; fg: string; edit?: boolean; onEditField?: (id: string, key: string, value: string) => void };

function blockBody(b: Block, ctx: Ctx) {
 const p = b.props || {};
 const { colors, head, products, shopHref, fg } = ctx;
 // Editor-only: type directly on the canvas. Sync on blur (not while typing, so React never
 // re-renders mid-edit and jumps the caret). Clicking text edits it; the click is swallowed so it
 // doesn't also select the whole section.
 const editBase = {
 contentEditable: true as const,
 suppressContentEditableWarning: true as const,
 onClick: (e: React.MouseEvent) => e.stopPropagation(),
 };
 // Rich text: keeps inline formatting (bold/italic/underline/colour) the floating toolbar applies.
 // On blur we serialize the DOM into a tight safe subset, so what we store is already clean.
 const txt = (v: string | undefined, key: string) => {
 const content = inlineHtml(v) ? { dangerouslySetInnerHTML: inlineHtml(v)! } : { children: v ?? "" };
 if (!ctx.edit) return content;
 return { ...editBase, onBlur: (e: React.FocusEvent<HTMLElement>) => ctx.onEditField?.(b.id, key, serializeInline(e.currentTarget)), ...content };
 };
 // Plain text: for multi-line copy (the text-block body), where preserving line breaks matters more
 // than inline styling. Syncs the raw text content.
 const txtPlain = (v: string | undefined, key: string) => {
 if (!ctx.edit) return { children: v ?? "" };
 return { ...editBase, onBlur: (e: React.FocusEvent<HTMLElement>) => ctx.onEditField?.(b.id, key, (e.currentTarget.textContent || "").trim()), children: v ?? "" };
 };
 switch (b.type) {
 case "announcement":
 return p.text ? <div {...txt(p.text, "text")} className="px-4 py-2.5 text-center text-[10px] uppercase tracking-[0.22em]" style={{ background: colors.accent, color: "#fff" }} /> : null;

 case "hero":
 return p.image ? (
 <div className="relative w-full overflow-hidden" style={{ minHeight: "84vh" }}>
 <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.6) 100%)" }} />
 <div className="vya-hero-inner relative z-10 flex min-h-[84vh] flex-col items-center justify-end px-6 pb-24 pt-36 text-center text-white">
 <h2 {...txt(p.heading, "heading")} className="vya-heading max-w-3xl text-5xl leading-[1.04] @xl:text-7xl" style={{ fontFamily: head }} />
 {p.subtext && <p {...txt(p.subtext, "subtext")} className="vya-sub mt-5 max-w-xl text-sm leading-relaxed text-white/85 @xl:text-[15px]" />}
 {p.cta && <a href={shopHref} {...txt(p.cta, "cta")} className="vya-cta mt-9 inline-block border border-white/70 px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:bg-white hover:text-black" />}
 </div>
 </div>
 ) : (
 <div className="vya-hero-inner px-6 py-32 text-center">
 <h2 {...txt(p.heading, "heading")} className="vya-heading mx-auto max-w-3xl text-5xl leading-[1.05] @xl:text-6xl" style={{ fontFamily: head }} />
 {p.subtext && <p {...txt(p.subtext, "subtext")} className="vya-sub mt-5 mx-auto max-w-xl text-sm leading-relaxed opacity-65 @xl:text-[15px]" />}
 {p.cta && <a href={shopHref} {...txt(p.cta, "cta")} className="vya-cta mt-9 inline-block px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }} />}
 </div>
 );

 case "featured": {
 const shown = products.slice(0, 8);
 return (
 <section className="mx-auto max-w-6xl px-5 @xl:px-8 py-20 @xl:py-24">
 {p.heading && (
 <div className="mb-12 text-center">
 <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] opacity-40">The Edit</span>
 <h2 {...txt(p.heading, "heading")} className="vya-heading text-3xl @xl:text-[2.6rem] leading-tight" style={{ fontFamily: head }} />
 </div>
 )}
 {shown.length ? (
 <div className="grid grid-cols-2 gap-x-5 gap-y-12 @lg:grid-cols-3 @2xl:grid-cols-4 @lg:gap-x-8">
 {shown.map((it, i) => (
 <a key={it.key || i} href={it.href || shopHref} className="group block">
 <div className="vya-round aspect-[4/5] w-full overflow-hidden" style={{ background: `${fg}0d` }}>
 {it.image && <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.045]" />}
 </div>
 <p className="mt-3.5 line-clamp-1 text-[11px] uppercase tracking-[0.1em] opacity-65">{it.title}</p>
 <p className="mt-1 text-[13px]" style={{ color: colors.accent }}>{it.price}</p>
 </a>
 ))}
 </div>
 ) : (
 <p className="py-16 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">Coming soon</p>
 )}
 </section>
 );
 }

 case "text":
 return (
 <section className="mx-auto max-w-2xl px-6 py-20 @xl:py-24 text-center">
 {p.heading && <h2 {...txt(p.heading, "heading")} className="vya-heading mb-5 text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: head }} />}
 {p.body && <p {...txtPlain(p.body, "body")} className="vya-body text-sm leading-[1.9] opacity-75 @xl:text-[15px] whitespace-pre-wrap" />}
 </section>
 );

 case "image":
 return p.image ? (
 <figure className="w-full">
 <img src={p.image} alt={p.caption || ""} className="vya-img w-full object-cover" style={{ maxHeight: "70vh" }} />
 {p.caption && <figcaption className="px-6 py-3 text-center text-xs opacity-60">{p.caption}</figcaption>}
 </figure>
 ) : null;

 case "gallery": {
 const imgs = (p.images || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
 return imgs.length ? (
 <div className="grid grid-cols-2 gap-1 @lg:grid-cols-3">
 {imgs.slice(0, 9).map((src, i) => (
 <div key={i} className="vya-round aspect-square overflow-hidden"><img src={src} alt="" className="h-full w-full object-cover" /></div>
 ))}
 </div>
 ) : null;
 }

 case "split": {
 const right = (p.imageSide || "").toLowerCase().startsWith("r");
 return (
 <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 @xl:px-8 py-16 @xl:py-24 @lg:grid-cols-2 @lg:gap-14">
 {p.image
 ? <img src={p.image} alt="" className={`vya-img aspect-[4/5] w-full object-cover ${right ? "@lg:order-2" : ""}`} />
 : <div className={`aspect-[4/5] w-full ${right ? "@lg:order-2" : ""}`} style={{ background: `${fg}0d` }} />}
 <div>
 {p.heading && <h2 {...txt(p.heading, "heading")} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: head }} />}
 {p.body && <p {...txtPlain(p.body, "body")} className="vya-body mt-4 whitespace-pre-wrap text-sm leading-[1.9] opacity-75 @xl:text-[15px]" />}
 {p.cta && <a href={shopHref} {...txt(p.cta, "cta")} className="vya-cta mt-7 inline-block px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }} />}
 </div>
 </section>
 );
 }

 case "marquee": {
 const items = (p.items || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
 if (!items.length) return ctx.edit ? <div className="px-6 py-6 text-center text-[11px] uppercase tracking-[0.25em] opacity-40">Marquee — add the names you carry</div> : null;
 const rowd = [...items, ...items];
 return (
 <div className="vya-marquee overflow-hidden whitespace-nowrap py-5" style={{ borderTop: `1px solid ${fg}1a`, borderBottom: `1px solid ${fg}1a` }}>
 <div className="vya-marquee-track inline-flex gap-12">
 {rowd.map((it, i) => <span key={i} className="text-lg uppercase tracking-wide opacity-55">{it}<span style={{ marginLeft: "3rem", color: colors.accent }}>✦</span></span>)}
 </div>
 </div>
 );
 }

 case "statement":
 return (
 <section className="mx-auto max-w-4xl px-6 py-20 @xl:py-28">
 {p.quote && <p {...txtPlain(p.quote, "quote")} className="vya-heading whitespace-pre-wrap text-3xl leading-[1.1] tracking-tight @xl:text-5xl" style={{ fontFamily: head }} />}
 {p.attribution && <p {...txt(p.attribution, "attribution")} className="vya-sub mt-6 text-[11px] uppercase tracking-[0.22em] opacity-60" />}
 </section>
 );

 case "spotlight":
 return (
 <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 @xl:px-8 py-16 @xl:py-24 @lg:grid-cols-2 @lg:gap-14">
 {p.image
 ? <img src={p.image} alt="" className="vya-img aspect-square w-full object-cover" />
 : <div className="aspect-square w-full" style={{ background: `${fg}0d` }} />}
 <div>
 {p.heading && <h2 {...txt(p.heading, "heading")} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: head }} />}
 {p.price && <p {...txt(p.price, "price")} className="mt-2 text-xl" style={{ color: colors.accent }} />}
 {p.subtext && <p {...txtPlain(p.subtext, "subtext")} className="vya-body mt-4 whitespace-pre-wrap text-sm leading-[1.8] opacity-75 @xl:text-[15px]" />}
 {p.cta && <a href={shopHref} {...txt(p.cta, "cta")} className="vya-cta mt-7 inline-block px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }} />}
 </div>
 </section>
 );

 case "video": {
 const url = (p.url || "").trim();
 if (!url) return null;
 const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
 const vimeo = url.match(/vimeo\.com\/(\d+)/);
 const embed = yt ? `https://www.youtube.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
 return (
 <section className="mx-auto max-w-5xl px-5 @xl:px-8 py-16 @xl:py-20">
 <div className="vya-round relative w-full overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
 {embed ? (
 <iframe src={embed} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen title={p.caption || "Video"} />
 ) : (
 <video src={url} controls playsInline className="absolute inset-0 h-full w-full object-cover" />
 )}
 </div>
 {p.caption && <p className="mt-3 text-center text-xs opacity-60">{p.caption}</p>}
 </section>
 );
 }

 case "newsletter":
 return (
 <section className="px-6 py-20 @xl:py-24 text-center" style={{ borderTop: `1px solid ${fg}1a` }}>
 <h2 {...txt(p.heading || (ctx.edit ? "" : "Join the list"), "heading")} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: head }} />
 {p.subtext && <p {...txt(p.subtext, "subtext")} className="vya-sub mt-3 mx-auto max-w-md text-sm opacity-65" />}
 <div className="mt-7"><NewsletterForm accent={colors.accent} /></div>
 </section>
 );

 case "custom": {
 // Interactive components (js present, or mode "sandbox") run in an isolated sandboxed iframe —
 // full HTML+CSS+JS, but walled off from the store (see SandboxEmbed). Everything else is static
 // markup rendered inline: sanitized on save, indexable, and inheriting the store's styles.
 if (p.mode === "sandbox" || (p.js && p.js.trim())) {
 if (!(p.html && p.html.trim()) && !(p.js && p.js.trim())) {
 return ctx.edit ? <div className="px-6 py-10 text-center text-[11px] uppercase tracking-[0.25em] opacity-40">Interactive section — ask VYA to build it</div> : null;
 }
 return <SandboxEmbed html={p.html || ""} css={p.css} js={p.js} vars={{ bg: colors.bg, text: fg, accent: colors.accent, heading: head, body: ctx.body }} />;
 }
 const html = inlineHtml(p.html);
 if (!html) return ctx.edit ? <div className="px-6 py-10 text-center text-[11px] uppercase tracking-[0.25em] opacity-40">Custom section — ask VYA to build it</div> : null;
 return <div className="vya-custom-inner" dangerouslySetInnerHTML={html} />;
 }

 default:
 return null;
 }
}

export default function Blocks({
 blocks,
 colors,
 fonts,
 products,
 shopHref = "#",
 radius = "sharp",
 onSelect,
 selectedId,
 edit,
 onEditField,
 reorder,
 overlayEdit,
}: {
 blocks: Block[];
 colors: Colors;
 fonts: { heading?: string; body?: string };
 products: BlockProduct[];
 shopHref?: string;
 // Global corner style ("shapes") — rounds product cards, images, and buttons store-wide.
 radius?: Radius;
 // Editor-only: click a section in the preview to select/edit it.
 onSelect?: (id: string) => void;
 selectedId?: string | null;
 // Editor-only: type directly on the canvas — a text element's blur syncs back the new copy.
 edit?: boolean;
 onEditField?: (id: string, key: string, value: string) => void;
 // Editor-only: drag a section by its grip to reorder, with a drop line. State lives in the parent
 // (this renderer stays hook-free so it also runs server-side on the live storefront).
 reorder?: {
 dragIndex: number | null;
 overIndex: number | null;
 onStart: (i: number) => void;
 onOver: (i: number) => void;
 onEnd: () => void;
 onDrop: (i: number) => void;
 };
 // Editor-only: drag free-form overlay elements around a section. Drag math (px→%) lives in the parent
 // since it needs the section's rect; this renderer just reports select + drag-start.
 overlayEdit?: OverlayEdit;
}) {
 const head = ff(fonts.heading);
 const body = ff(fonts.body);
 const ir = IMG_RADIUS[radius] ?? 0;
 const br = BTN_RADIUS[radius] ?? 0;
 // Corner style, scoped to this storefront's sections. `.vya-round` marks the image/card frames that
 // should curve; the full-bleed hero, announcement bar, and marquee deliberately stay square.
 const radiusCss = ir || br ? `.vya-round,.vya-img{border-radius:${ir}px;overflow:hidden}.vya-cta{border-radius:${br}px}` : "";
 // Overlay elements are absolutely placed (% coords) on wide layouts; on a narrow container they stack
 // into normal flow — centred, padded — so a button dragged over the hero never overlaps or runs off a
 // phone. Container-query (not viewport) so the editor's device-preview reflows truthfully too.
 // z-index:20 so overlays float ABOVE section content that sets its own stacking (e.g. the hero's
 // z-10 inner) instead of hiding behind it. Layer is click-through; only the elements catch pointers.
 const overlayCss = ".vya-ovl-layer{position:absolute;inset:0;z-index:20;pointer-events:none}.vya-ovl{position:absolute;pointer-events:auto}@container (max-width:640px){.vya-ovl-layer{position:static;display:flex;flex-direction:column;align-items:center;gap:.85rem;padding:1.75rem 1.25rem}.vya-ovl{position:static!important;left:auto!important;top:auto!important;width:auto!important;max-width:100%}}";
 return (
 // `@container` makes the sections respond to THIS element's width, not the viewport — so the
 // editor's device preview reflows truthfully, and on the live site (where this is full-width) it
 // behaves like before. Breakpoints below are container variants (@xl/@lg/@2xl), not viewport ones.
 <div className="@container" style={{ fontFamily: body, color: colors.text }}>
 <style dangerouslySetInnerHTML={{ __html: ".vya-marquee-track{animation:vya-marq 30s linear infinite}@keyframes vya-marq{to{transform:translateX(-50%)}}@media(prefers-reduced-motion:reduce){.vya-marquee-track{animation:none}}" + radiusCss + overlayCss }} />
 {blocks.map((b, i) => {
 const { background, fg } = bgFor(b.style?.bg, colors);
 const inner = blockBody(b, { colors, head, body, products, shopHref, fg, edit, onEditField });
 const editable = typeof onSelect === "function";
 // Stable, targetable classes so custom CSS (AI- or hand-written) can hook any section
 // and element: e.g. `.vya-hero .vya-heading { ... }` or `.vya-b-<id> { ... }`.
 const secClass = `vya-sec vya-${b.type} vya-b-${b.id}`;
 const dragging = reorder?.dragIndex ?? null;
 const showLine = editable && reorder && reorder.overIndex === i && dragging !== null && dragging !== i;
 const overrideCss = b.style ? sectionOverrideCss(b.id, b.style) : "";
 // A section background photo (full-bleed, behind everything). Wins over a bg colour; a soft scrim
 // keeps overlaid text legible without forcing the seller to fiddle. url() is quote-escaped.
 // Hero/image sections render their OWN picture (props.image), so they ignore this layer — otherwise a
 // stale bgImage would show a grey scrim behind them.
 const bgImg = b.type === "hero" || b.type === "image" ? undefined : b.style?.bgImage;
 const secStyle: React.CSSProperties = bgImg
 ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.18),rgba(0,0,0,0.28)), url("${bgImg.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: "center", color: b.style?.textColor || "#ffffff" }
 : background ? { background, color: fg } : {};
 return (
 <div
 key={b.id}
 onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onSelect!(b.id); } : undefined}
 onDragOver={editable && reorder ? (e) => { if (dragging !== null) { e.preventDefault(); reorder.onOver(i); } } : undefined}
 onDrop={editable && reorder ? (e) => { if (dragging !== null) { e.preventDefault(); reorder.onDrop(i); } } : undefined}
 className={editable ? `${secClass} group/sec relative cursor-pointer transition-shadow ${dragging === i ? "opacity-40" : ""} ${selectedId === b.id ? "shadow-[inset_0_0_0_2px_#5D0F17]" : "hover:shadow-[inset_0_0_0_2px_rgba(93,15,23,0.45)]"}` : `${secClass} relative`}
 style={Object.keys(secStyle).length ? secStyle : undefined}
 >
 {overrideCss && <style dangerouslySetInnerHTML={{ __html: overrideCss }} />}
 {showLine && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] bg-[#5D0F17]" />}
 {editable && (
 <span className={`pointer-events-none absolute left-2 top-2 z-20 rounded bg-[#5D0F17] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white transition-opacity ${selectedId === b.id ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"}`}>{b.type.replace(/[-_]/g, " ")}</span>
 )}
 {editable && reorder && (
 <button
 type="button"
 draggable
 title="Drag to reorder"
 onClick={(e) => e.stopPropagation()}
 onDragStart={(e) => { reorder.onStart(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); const sec = (e.currentTarget as HTMLElement).closest(".vya-sec"); if (sec) e.dataTransfer.setDragImage(sec as Element, 30, 20); }}
 onDragEnd={() => reorder.onEnd()}
 className={`absolute right-2 top-2 z-20 grid h-6 w-6 cursor-grab place-items-center rounded bg-white/85 text-[#5D0F17] shadow-sm backdrop-blur transition-opacity active:cursor-grabbing ${selectedId === b.id ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"}`}
 >
 <GripVertical size={14} />
 </button>
 )}
 {inner}
 {b.overlays?.length ? (
 <div className="vya-ovl-layer">
 {b.overlays.map((o) => {
 const sel = editable && overlayEdit?.selectedId === o.id;
 return (
 <div
 key={o.id}
 data-ovl={o.id}
 className={`vya-ovl ${editable ? `cursor-move touch-none transition-shadow ${sel ? "shadow-[0_0_0_2px_#5D0F17]" : "hover:shadow-[0_0_0_2px_rgba(93,15,23,0.5)]"}` : ""}`}
 style={{ left: `${o.x}%`, top: `${o.y}%`, ...(o.w ? { width: `${o.w}%` } : {}) }}
 onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); overlayEdit?.onSelect(b.id, o.id); } : undefined}
 onPointerDown={editable && overlayEdit ? (e) => { e.stopPropagation(); overlayEdit.onDragStart(b.id, o.id, e); } : undefined}
 >
 {overlayContent(o, shopHref, head, !editable)}
 </div>
 );
 })}
 </div>
 ) : null}
 </div>
 );
 })}
 </div>
 );
}
