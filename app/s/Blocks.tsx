/* eslint-disable @next/next/no-img-element */
// Presentational renderer for the section-based storefront. No hooks / no client
// APIs, so it renders identically in the live store (server component) and the
// editor's live preview (client). Sections come from theme.blocks.
import type { Block, BlockStyle, Overlay } from "@/app/lib/storefront-blocks";
import { SERIF_FONTS } from "@/app/lib/storefront-templates";
import { GripVertical } from "lucide-react";
import NewsletterForm from "./NewsletterForm";
import ContactForm from "./ContactForm";
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
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "e" | "w";
type OverlayEdit = {
 selectedId?: string | null;
 editingId?: string | null; // the text element currently being typed into
 onSelect: (blockId: string, overlayId: string) => void;
 onDragStart: (blockId: string, overlayId: string, e: React.PointerEvent) => void;
 onResizeStart: (blockId: string, overlayId: string, handle: ResizeHandle, e: React.PointerEvent) => void;
 onStartEdit: (blockId: string, overlayId: string) => void; // double-click a text element to edit inline
 onText: (blockId: string, overlayId: string, value: string) => void;
};
// Which resize handles a kind exposes: shapes/images resize in both axes (corners), text/buttons only
// widen (side handles) since their height flows from content.
const HANDLE_SET: Record<string, ResizeHandle[]> = {
 rect: ["nw", "ne", "sw", "se"], circle: ["nw", "ne", "sw", "se"], image: ["nw", "ne", "sw", "se"],
 line: ["w", "e"], button: ["w", "e"], text: ["w", "e"],
};
const HANDLE_POS: Record<ResizeHandle, string> = {
 nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
 ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
 sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
 se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
 w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
 e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};
function overlayContent(o: Overlay, shopHref: string, head: string | undefined, live: boolean, editText?: { editing: boolean; onText: (v: string) => void }) {
 const p = o.props || {};
 if (o.kind === "button") {
 const cls = "vya-cta inline-block whitespace-nowrap px-7 py-3 text-[12px] font-medium uppercase tracking-[0.18em]";
 const style = { background: p.bg || "#1a1a1a", color: p.color || "#ffffff", fontFamily: p.font ? ff(p.font) : undefined };
 return live
 ? <a href={p.href || shopHref} className={cls} style={style}>{p.label || "Button"}</a>
 : <span className={cls} style={style}>{p.label || "Button"}</span>;
 }
 if (o.kind === "image") {
 // Sized (h set) → fill the box and cover; unsized → natural height by width.
 const cls = o.h != null ? "vya-round block h-full w-full object-cover" : "vya-round block h-auto w-full object-cover";
 return p.src
 ? <img src={p.src} alt={p.alt || ""} className={cls} draggable={false} />
 : <div className="vya-round grid h-full w-full place-items-center bg-black/10 text-[10px] uppercase tracking-wide text-black/40" style={{ aspectRatio: o.h != null ? undefined : "1" }}>Image</div>;
 }
 if (o.kind === "rect") {
 return <div className="h-full w-full" style={{ background: p.fill || "#1a1a1a", borderRadius: `${p.radius ?? "10"}px`, opacity: (Number(p.opacity ?? 100) / 100) }} />;
 }
 if (o.kind === "circle") {
 return <div className="h-full w-full" style={{ background: p.fill || "#1a1a1a", borderRadius: "50%", opacity: (Number(p.opacity ?? 100) / 100) }} />;
 }
 if (o.kind === "line") {
 return <div className="flex h-full w-full items-center"><div className="w-full" style={{ height: `${p.thickness ?? "2"}px`, background: p.color || "#1a1a1a" }} /></div>;
 }
 const font = p.font ? ff(p.font) : (p.size === "lg" || p.size === "xl" ? head : undefined);
 const tStyle = { color: p.color || "#ffffff", fontFamily: font, fontWeight: p.bold === "1" ? 700 : 500, fontStyle: p.italic === "1" ? "italic" as const : undefined };
 const tCls = `${OVL_TEXT_SIZE[p.size || "md"]} leading-tight`;
 // Editing: type directly on the canvas (double-click enters this). Sync on blur so React never
 // re-renders mid-edit and jumps the caret. Autofocus + caret-to-end when the box mounts.
 if (editText?.editing) {
 return <div contentEditable suppressContentEditableWarning ref={(el) => { if (el && document.activeElement !== el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } }} className={`${tCls} min-w-[1ch] cursor-text whitespace-pre-wrap outline-none`} style={tStyle} onPointerDown={(e) => e.stopPropagation()} onBlur={(e) => editText.onText((e.currentTarget.textContent || "").trim())}>{p.text || ""}</div>;
 }
 return <div className={tCls} style={tStyle}>{p.text || "Text"}</div>;
}

function lum(hex: string): number {
 const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
 return 0.299 * r + 0.587 * g + 0.114 * b;
}
function isDark(hex: string): boolean { return lum(hex) < 140; }

// Resolve a section's background → { background, fg (text colour) }.
function bgFor(bg: string | undefined, colors: Colors): { background?: string; fg: string } {
 if (!bg) return { fg: colors.text };
 if (bg === "dark") {
 // A "dark" section is the palette's OWN deep tone (its text on a light palette, its bg on a dark
 // one) — so a warm tan/oxblood store gets a warm espresso section, not a cold generic black.
 let darkBg = lum(colors.text) <= lum(colors.bg) ? colors.text : colors.bg;
 let lightFg = darkBg === colors.text ? colors.bg : colors.text;
 if (lum(darkBg) > 110) { darkBg = "#1b1613"; lightFg = "#f2ede4"; } // palette has no deep tone
 return { background: darkBg, fg: lightFg };
 }
 if (bg === "accent") return { background: colors.accent, fg: isDark(colors.accent) ? "#ffffff" : colors.bg };
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

// Drag-to-reorder for FAQ rows — within a section and between two FAQ sections, with a snap/drop line.
// State lives in the parent (studio) so a row can travel across sections; this renderer just reports the
// drag/over/drop events and draws the indicator where the row will land.
type FaqDnd = {
 dragBlock?: string | null;
 dragIndex?: number | null;
 overBlock?: string | null;
 overIndex?: number | null;
 onGripDown: (blockId: string, index: number, e: React.PointerEvent) => void;
};
type Ctx = { colors: Colors; head?: string; body?: string; products: BlockProduct[]; shopHref: string; fg: string; edit?: boolean; onEditField?: (id: string, key: string, value: string) => void; selectedId?: string | null; onContentDragStart?: (blockId: string, e: React.PointerEvent) => void; onFaqOp?: (blockId: string, op: "add" | { remove: number }) => void; faqDnd?: FaqDnd; storeSlug?: string };

function blockBody(b: Block, ctx: Ctx) {
 const p = b.props || {};
 const { colors, head, products, shopHref, fg } = ctx;
 const selected = ctx.edit && ctx.selectedId === b.id;
 // A move grip that appears on the selected hero's content group so it can be dragged anywhere in the
 // banner (Canva-style). Grabbing it starts the drag in the parent (which owns the frame rect + snapping).
 const moveGrip = selected && ctx.onContentDragStart ? (
 <button type="button" title="Drag to move" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); ctx.onContentDragStart!(b.id, e); }} onClick={(e) => e.stopPropagation()} className="vya-content-grip absolute -top-3 left-1/2 z-20 -translate-x-1/2 cursor-move touch-none rounded-full border border-white/70 bg-[#5D0F17] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow">move</button>
 ) : null;
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

 case "hero": {
 // Free-positioned content: when the seller has dragged the content group, it's absolutely placed at
 // cx/cy% of the banner (anchored by its centre). Otherwise it keeps the default bottom-centre layout.
 const free = p.cx !== undefined && p.cx !== "" && p.cy !== undefined && p.cy !== "";
 return p.image ? (
 <div className="vya-hero-frame relative w-full overflow-hidden" style={{ minHeight: "84vh" }}>
 <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.6) 100%)" }} />
 <div
 className={`vya-hero-inner relative z-10 px-6 text-center text-white ${free ? "vya-hero-free" : "flex min-h-[84vh] flex-col items-center justify-end pb-24 pt-36"}`}
 style={free ? { position: "absolute", left: `${p.cx}%`, top: `${p.cy}%`, transform: "translate(-50%,-50%)", width: "max-content", maxWidth: "min(88%,46rem)" } : undefined}
 >
 {moveGrip}
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
 }

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

 case "collections": {
 // Shop-by-category tiles. Each line is "Label" or "Label | image URL".
 const tiles = (p.items || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [label, img] = l.split("|").map((s) => s.trim()); return { label, img: img || "" }; });
 if (!tiles.length) return ctx.edit ? <div className="px-6 py-10 text-center text-[11px] uppercase tracking-[0.25em] opacity-40">Shop by category — add tiles</div> : null;
 return (
 <section className="mx-auto max-w-6xl px-5 @xl:px-8 py-16 @xl:py-24">
 {(p.heading || ctx.edit) && <h2 {...txt(p.heading, "heading")} className="vya-heading mb-10 text-center text-3xl @xl:text-[2.4rem] leading-tight" style={{ fontFamily: head }} />}
 <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @xl:gap-4">
 {tiles.slice(0, 9).map((t, i) => (
 <a key={i} href={shopHref} className="vya-round group relative block aspect-[4/5] overflow-hidden" style={{ background: t.img ? undefined : `${fg}12` }}>
 {t.img && <img src={t.img} alt={t.label} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.05]" />}
 {t.img && <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />}
 <span className={`absolute inset-x-0 bottom-0 p-4 text-lg uppercase tracking-[0.08em] ${t.img ? "text-white" : ""}`} style={{ fontFamily: head, color: t.img ? undefined : fg }}>{t.label}</span>
 </a>
 ))}
 </div>
 </section>
 );
 }

 case "testimonials": {
 // Social proof — each line is "Quote | Name".
 const items = (p.items || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [quote, nm] = l.split("|").map((s) => s.trim()); return { quote, name: nm || "" }; });
 if (!items.length) return ctx.edit ? <div className="px-6 py-10 text-center text-[11px] uppercase tracking-[0.25em] opacity-40">Reviews — add customer quotes</div> : null;
 return (
 <section className="mx-auto max-w-5xl px-6 @xl:px-8 py-16 @xl:py-24" style={{ borderTop: `1px solid ${fg}14`, borderBottom: `1px solid ${fg}14` }}>
 {(p.heading || ctx.edit) && <h2 {...txt(p.heading, "heading")} className="vya-heading mb-12 text-center text-2xl @xl:text-3xl leading-tight" style={{ fontFamily: head }} />}
 <div className="grid gap-8 @lg:grid-cols-3 @lg:gap-10">
 {items.slice(0, 3).map((t, i) => (
 <div key={i} className="text-center @lg:text-left">
 <div className="mb-3 text-[13px] tracking-[0.25em]" style={{ color: colors.accent }}>★★★★★</div>
 <p className="text-[15px] leading-relaxed @xl:text-[16px]">{`“${t.quote}”`}</p>
 {t.name && <p className="mt-4 text-[11px] uppercase tracking-[0.18em] opacity-55">{t.name}</p>}
 </div>
 ))}
 </div>
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
 const sep = p.sep ?? "✦"; // separator character between names — customizable, or blank for none
 return (
 <div className="vya-marquee overflow-hidden whitespace-nowrap py-5" style={{ borderTop: `1px solid ${fg}1a`, borderBottom: `1px solid ${fg}1a` }}>
 <div className="vya-marquee-track inline-flex gap-12">
 {rowd.map((it, i) => <span key={i} className="text-lg uppercase tracking-wide opacity-55">{it}{sep ? <span style={{ marginLeft: "3rem", color: colors.accent }}>{sep}</span> : null}</span>)}
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

 case "contact":
 return (
 <section className="mx-auto max-w-xl px-6 py-16 @xl:py-24 text-center">
 {(p.heading || ctx.edit) && <h2 {...txt(p.heading, "heading")} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: head }} />}
 {(p.subtext || ctx.edit) && <p {...txt(p.subtext, "subtext")} className="vya-sub mt-3 mx-auto max-w-md text-sm opacity-65" />}
 <div className="mt-8 text-left">
 {!ctx.edit && ctx.storeSlug
 ? <ContactForm accent={colors.accent} storeSlug={ctx.storeSlug} />
 : (
 <div className="flex flex-col gap-2.5">
 <input disabled placeholder="Name" className="rounded-md border border-current/20 bg-transparent px-3 py-2.5 text-[14px] opacity-60" />
 <input disabled placeholder="Email" className="rounded-md border border-current/20 bg-transparent px-3 py-2.5 text-[14px] opacity-60" />
 <textarea disabled placeholder="Message" rows={4} className="rounded-md border border-current/20 bg-transparent px-3 py-2.5 text-[14px] opacity-60" />
 <span className="mt-1 grid place-items-center rounded-md py-2.5 text-[12px] font-medium uppercase tracking-wide text-white" style={{ background: colors.accent }}>Send</span>
 </div>
 )}
 </div>
 {p.email && <p className="mt-6 text-center text-xs opacity-55">Or email us at <a href={`mailto:${p.email}`} style={{ color: colors.accent }}>{p.email}</a></p>}
 </section>
 );

 case "faq": {
 // A real accordion. Q&A are stored as pairs (q0/a0, q1/a1…) so they're editable on the canvas; on
 // the live site each row is a native <details> that expands on click — interactive with zero JS.
 const pairs: { q: string; a: string; i: number }[] = [];
 for (let i = 0; p[`q${i}`] !== undefined; i++) pairs.push({ q: p[`q${i}`] || "", a: p[`a${i}`] || "", i });
 // Back-compat: an assistant-built "items" blob (question line, then answer, blank line between).
 if (!pairs.length && p.items) String(p.items).split(/\n\s*\n/).forEach((blk, i) => { const ls = blk.split("\n"); const q = (ls.shift() || "").trim(); const a = ls.join("\n").trim(); if (q) pairs.push({ q, a, i }); });
 const chev = <svg className="vya-faq-chev ml-3 shrink-0 opacity-50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
 return (
 <section className="mx-auto max-w-3xl px-5 @xl:px-8 py-16 @xl:py-20">
 {(p.heading || ctx.edit) && <h2 {...txt(p.heading, "heading")} className="vya-heading mb-3 text-center text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: head }} />}
 {(p.subtext || ctx.edit) && <p {...txtPlain(p.subtext, "subtext")} className="vya-sub mx-auto mb-8 max-w-xl text-center text-sm leading-relaxed opacity-65" />}
 <div className="vya-faq" data-faq-container data-faq-block={b.id} style={{ borderBottom: `1px solid ${fg}1f` }}>
 {pairs.map(({ q, a, i }) => ctx.edit ? (
 <div
 key={i}
 data-faq-row data-faq-block={b.id} data-faq-index={i}
 className={`group/faq relative flex items-start gap-2 py-4 ${ctx.faqDnd?.dragBlock === b.id && ctx.faqDnd?.dragIndex === i ? "opacity-40" : ""}`}
 style={{ borderTop: `1px solid ${fg}1f` }}
 >
 {/* snap line where the dragged row will land */}
 {ctx.faqDnd?.overBlock === b.id && ctx.faqDnd?.overIndex === i && <div className="pointer-events-none absolute inset-x-0 -top-px z-10 h-[2px]" style={{ background: colors.accent }} />}
 {ctx.faqDnd && (
 <span
 role="button" title="Drag to reorder" aria-label="Drag to reorder"
 onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); ctx.faqDnd!.onGripDown(b.id, i, e); }}
 onClick={(e) => e.stopPropagation()}
 className="mt-0.5 grid h-7 w-6 shrink-0 cursor-grab touch-none select-none place-items-center rounded text-current opacity-30 transition hover:bg-black/5 hover:opacity-70 group-hover/faq:opacity-60 active:cursor-grabbing"
 ><GripVertical size={15} /></span>
 )}
 <div className="min-w-0 flex-1">
 <div className="flex items-start justify-between gap-3">
 <div {...txt(q, `q${i}`)} className="vya-faq-q flex-1 text-[15px] font-medium leading-snug" />
 {ctx.onFaqOp && <button type="button" title="Remove question" onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctx.onFaqOp!(b.id, { remove: i }); }} className="shrink-0 rounded p-1 text-xs opacity-0 transition hover:bg-black/5 group-hover/faq:opacity-60">✕</button>}
 </div>
 <div {...txtPlain(a, `a${i}`)} className="vya-faq-a mt-2 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70" />
 </div>
 </div>
 ) : (
 <details key={i} style={{ borderTop: `1px solid ${fg}1f` }}>
 <summary className="flex cursor-pointer items-center justify-between gap-3 py-4 text-[15px] font-medium leading-snug">
 <span>{q}</span>{chev}
 </summary>
 <div className="pb-4 whitespace-pre-wrap text-[14px] leading-relaxed opacity-70">{a}</div>
 </details>
 ))}
 {/* drop line at the end of the list */}
 {ctx.edit && ctx.faqDnd?.overBlock === b.id && ctx.faqDnd?.overIndex === pairs.length && <div className="pointer-events-none h-[2px]" style={{ background: colors.accent }} />}
 </div>
 {ctx.edit && ctx.onFaqOp && <button type="button" onClick={() => ctx.onFaqOp!(b.id, "add")} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-[12px] font-medium opacity-60 transition hover:opacity-100" style={{ borderColor: `${fg}40` }}>+ Add question</button>}
 </section>
 );
 }

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
 onContentDragStart,
 onFaqOp,
 faqDnd,
 storeSlug,
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
 // Editor-only: drag the selected hero's content group to reposition it within the banner.
 onContentDragStart?: (blockId: string, e: React.PointerEvent) => void;
 // Editor-only: add/remove a FAQ accordion row.
 onFaqOp?: (blockId: string, op: "add" | { remove: number }) => void;
 // Editor-only: drag FAQ rows to reorder (within a section and between FAQ sections).
 faqDnd?: FaqDnd;
 // Live-site only: the store handle, so a contact section can submit to the right store.
 storeSlug?: string;
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
 const overlayCss = ".vya-ovl-layer{position:absolute;inset:0;z-index:20;pointer-events:none}.vya-ovl{position:absolute;pointer-events:auto}@container (max-width:640px){.vya-ovl-layer{position:static;display:flex;flex-direction:column;align-items:center;gap:.85rem;padding:1.75rem 1.25rem}.vya-ovl{position:static!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;max-width:100%}.vya-ovl-shape{width:52%!important}.vya-ovl-line{width:82%!important}.vya-hero-free{position:static!important;left:auto!important;top:auto!important;transform:none!important;width:auto!important;max-width:100%!important;margin:0 auto;padding:6rem 1.25rem}}";
 return (
 // `@container` makes the sections respond to THIS element's width, not the viewport — so the
 // editor's device preview reflows truthfully, and on the live site (where this is full-width) it
 // behaves like before. Breakpoints below are container variants (@xl/@lg/@2xl), not viewport ones.
 <div className="@container" style={{ fontFamily: body, color: colors.text }}>
 <style dangerouslySetInnerHTML={{ __html: ".vya-marquee-track{animation:vya-marq 30s linear infinite}@keyframes vya-marq{to{transform:translateX(-50%)}}@media(prefers-reduced-motion:reduce){.vya-marquee-track{animation:none}}.vya-faq summary{list-style:none}.vya-faq summary::-webkit-details-marker{display:none}.vya-faq-chev{transition:transform .2s ease}.vya-faq details[open]>summary .vya-faq-chev{transform:rotate(180deg)}" + radiusCss + overlayCss }} />
 {blocks.map((b, i) => {
 const { background, fg } = bgFor(b.style?.bg, colors);
 const inner = blockBody(b, { colors, head, body, products, shopHref, fg, edit, onEditField, selectedId, onContentDragStart, onFaqOp, faqDnd, storeSlug });
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
 const editing = editable && overlayEdit?.editingId === o.id;
 return (
 <div
 key={o.id}
 data-ovl={o.id}
 className={`vya-ovl ${o.kind === "rect" || o.kind === "circle" ? "vya-ovl-shape" : o.kind === "line" ? "vya-ovl-line" : ""} ${editable ? `touch-none transition-shadow ${editing ? "cursor-text shadow-[0_0_0_2px_#5D0F17]" : `cursor-move ${sel ? "shadow-[0_0_0_2px_#5D0F17]" : "hover:shadow-[0_0_0_2px_rgba(93,15,23,0.5)]"}`}` : ""}`}
 style={{ left: `${o.x}%`, top: `${o.y}%`, ...(o.w ? { width: `${o.w}%` } : {}), ...(o.h ? { height: `${o.h}%` } : {}), ...((o.kind === "rect" || o.kind === "circle") && o.w && o.h ? { aspectRatio: `${o.w} / ${o.h}` } : {}) }}
 onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); if (!editing) overlayEdit?.onSelect(b.id, o.id); } : undefined}
 onDoubleClick={editable && overlayEdit ? (e) => { e.stopPropagation(); if (o.kind === "text") overlayEdit.onStartEdit(b.id, o.id); } : undefined}
 onDragStart={editable ? (e) => e.preventDefault() : undefined}
 onPointerDown={editable && overlayEdit && !editing ? (e) => { e.stopPropagation(); overlayEdit.onDragStart(b.id, o.id, e); } : undefined}
 >
 {overlayContent(o, shopHref, head, !editable, editing && overlayEdit ? { editing: true, onText: (v) => overlayEdit.onText(b.id, o.id, v) } : undefined)}
 {sel && !editing && overlayEdit ? (HANDLE_SET[o.kind] || []).map((hd) => (
 <span
 key={hd}
 data-ovl-handle={hd}
 className={`absolute z-10 h-3 w-3 rounded-full border border-white bg-[#5D0F17] shadow ${HANDLE_POS[hd]}`}
 onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); overlayEdit.onResizeStart(b.id, o.id, hd, e); }}
 />
 )) : null}
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
