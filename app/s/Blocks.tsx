/* eslint-disable @next/next/no-img-element */
// Presentational renderer for the section-based storefront. No hooks / no client
// APIs, so it renders identically in the live store (server component) and the
// editor's live preview (client). Sections come from theme.blocks.
import type { Block, BlockStyle, Overlay } from "@/app/lib/storefront-blocks";
import { backgroundEmbedSrc } from "@/app/lib/storefront-blocks";
import { resolveVariant } from "@/app/lib/storefront-variants";
import { skinCss } from "@/app/lib/storefront-skins";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import SandboxEmbed from "./SandboxEmbed";
// The shared editing kit + the per-family layout files. See blocks/kit.tsx for why the editing
// affordances live outside this file.
import { ff, makeKit, inlineHtml, decodeEntities, HANDLE_SET, HANDLE_POS, type Ctx, type Colors, type BlockProduct, type OverlayEdit, type FreeEdit, type FaqDnd } from "./blocks/kit";
import { renderHero } from "./blocks/hero";
import { renderFeatured } from "./blocks/featured";
import { renderCollections } from "./blocks/collections";
import { renderTestimonials } from "./blocks/testimonials";
import { renderColumns } from "./blocks/columns";
import { renderSplit } from "./blocks/split";
import { renderAnnouncement, renderText, renderStatement, renderMarquee } from "./blocks/content";
import { renderImage, renderGallery, renderVideo } from "./blocks/media";
import { renderCountdown, renderNewsletter, renderContact } from "./blocks/marketing";
import { renderBlog, renderSpotlight } from "./blocks/editorial";
import { renderFaq } from "./blocks/faq";

export type { BlockProduct };
// Re-exported for the studio, which imports it from here.
export { decodeEntities };
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
// A section's resize handle: just the bottom-edge pill (dragging it down grows the section, up
// shrinks it). No corners, no top handle — a section is full-bleed with no width to speak of, and
// one clear handle beat a box of six that fought neighbouring sections for clicks along the edges.
const SEC_HANDLE_POS: [edge: "bottom", pos: string][] = [
 ["bottom", "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2"],
];
function overlayContent(o: Overlay, shopHref: string, head: string | undefined, live: boolean, editText?: { editing: boolean; onText: (v: string) => void }) {
 const p = o.props || {};
 if (o.kind === "button") {
 // Size: padding + type scale. "md" matches the pre-existing default exactly, so unset buttons don't shift.
 const SIZE_CLS: Record<string, string> = { sm: "px-5 py-2 text-[10px]", md: "px-7 py-3 text-[12px]", lg: "px-9 py-3.5 text-[13px]" };
 // fontPx (set by a corner-drag) scales the button continuously — inline font-size + proportional
 // padding override the preset class. Unset → preset, so existing buttons don't shift.
 const fpx = p.fontPx ? Math.min(200, Math.max(8, Number(p.fontPx))) : null;
 const cls = `vya-cta inline-block whitespace-nowrap font-medium uppercase tracking-[0.18em] ${fpx ? "" : SIZE_CLS[p.size || "md"]}`;
 // Shape overrides the theme's global corner style for this one button (undefined = inherit it, via .vya-cta's own CSS rule).
 const SHAPE_RADIUS: Record<string, string> = { square: "0", rounded: "10px", pill: "999px" };
 // "No fill": transparent background, coloured border + text — defaults to the button's own fill
 // colour so toggling Fill→No-fill keeps the same colour, just hollowed out (mirrors the section CTA).
 const outline = p.outline === "1";
 const outlineColor = p.borderColor || p.bg || "#1a1a1a";
 const bw = Number(p.border ?? (outline ? 2 : 0));
 const style = {
 background: outline ? "transparent" : (p.bg || "#1a1a1a"),
 color: outline ? (p.color || outlineColor) : (p.color || "#ffffff"),
 fontFamily: p.font ? ff(p.font) : undefined,
 borderRadius: p.shape ? SHAPE_RADIUS[p.shape] : undefined,
 border: bw > 0 ? `${bw}px solid ${outline ? outlineColor : (p.borderColor || "transparent")}` : undefined,
 ...(fpx ? { fontSize: `${fpx}px`, padding: `${Math.round(fpx * 0.62)}px ${Math.round(fpx * 1.6)}px` } : {}),
 };
 return live
 ? <a href={p.href || shopHref} className={cls} style={style}>{p.label || "Button"}</a>
 : <span className={cls} style={style}>{p.label || "Button"}</span>;
 }
 if (o.kind === "image") {
 // Sized (h set) → fill the box and cover; unsized → natural height by width.
 const cls = o.h != null ? "vya-round block h-full w-full object-cover" : "vya-round block h-auto w-full object-cover";
 const opacity = Number(p.opacity ?? 100) / 100;
 return p.src
 ? <img src={p.src} alt={p.alt || ""} className={cls} style={{ opacity }} draggable={false} />
 : <div className="vya-round grid h-full w-full place-items-center bg-black/10 text-[10px] uppercase tracking-wide text-black/40" style={{ aspectRatio: o.h != null ? undefined : "1", opacity }}>Image</div>;
 }
 if (o.kind === "rect") {
 const bw = Number(p.border ?? 0);
 return <div className="h-full w-full" style={{ background: p.fill || "#1a1a1a", borderRadius: `${p.radius ?? "10"}px`, opacity: (Number(p.opacity ?? 100) / 100), border: bw > 0 ? `${bw}px solid ${p.borderColor || "#1a1a1a"}` : undefined, boxShadow: p.shadow ? SHADOW_CSS[p.shadow] : undefined }} />;
 }
 if (o.kind === "circle") {
 const bw = Number(p.border ?? 0);
 return <div className="h-full w-full" style={{ background: p.fill || "#1a1a1a", borderRadius: "50%", opacity: (Number(p.opacity ?? 100) / 100), border: bw > 0 ? `${bw}px solid ${p.borderColor || "#1a1a1a"}` : undefined, boxShadow: p.shadow ? SHADOW_CSS[p.shadow] : undefined }} />;
 }
 if (o.kind === "line") {
 // border-top (not a background block) so dashed/dotted styles are possible — solid looks identical to before.
 return <div className="flex h-full w-full items-center"><div className="w-full" style={{ borderTopWidth: `${p.thickness ?? "2"}px`, borderTopStyle: (p.dash || "solid") as React.CSSProperties["borderTopStyle"], borderTopColor: p.color || "#1a1a1a" }} /></div>;
 }
 const font = p.font ? ff(p.font) : (p.size === "lg" || p.size === "xl" ? head : undefined);
 // fontPx (set by a corner-drag) scales the text continuously, overriding the preset size class.
 const tFpx = p.fontPx ? Math.min(200, Math.max(8, Number(p.fontPx))) : null;
 const tStyle = { color: p.color || "#ffffff", fontFamily: font, fontWeight: p.bold === "1" ? 700 : 500, fontStyle: p.italic === "1" ? "italic" as const : undefined, textDecoration: p.underline === "1" ? "underline" as const : undefined, ...(tFpx ? { fontSize: `${tFpx}px` } : {}) };
 const tCls = `${tFpx ? "" : OVL_TEXT_SIZE[p.size || "md"]} leading-tight`;
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
const SHADOW_CSS: Record<string, string> = { sm: "0 1px 3px rgba(20,16,12,.12)", md: "0 8px 24px -6px rgba(20,16,12,.18)", lg: "0 20px 44px -12px rgba(20,16,12,.28)", xl: "0 30px 70px -18px rgba(20,16,12,.38)" };
// Resolve a section's background to a CSS `background` value (solid / gradient), or undefined.
function sectionBg(st: BlockStyle, colors: Colors): string | undefined {
 if (st.bgGradient) { const [c1, c2, a] = st.bgGradient.split("|"); return `linear-gradient(${a || 180}deg, ${c1}, ${c2})`; }
 const b = st.bg;
 if (!b) return undefined;
 if (b === "dark") return bgFor("dark", colors).background;
 if (b === "accent") return colors.accent;
 if (/^#[0-9a-fA-F]{6}$/.test(b)) return b;
 return undefined;
}

// The effective solid colours a section actually renders with — for the editor's colour swatches, so the
// displayed box matches what's on the page. `bg` falls back to the page/theme background when the section
// has no solid fill of its own (Page default, or a gradient/photo that isn't a single colour); `text`
// resolves exactly like the section's foreground (explicit override → contrast-aware default).
export function effectiveSectionColors(st: BlockStyle, colors: Colors): { bg: string; text: string } {
 const solid = sectionBg(st, colors);
 const bg = solid && solid.startsWith("#") ? solid : colors.bg;
 const text = st.textColor || bgFor(st.bg, colors).fg;
 return { bg, text };
}
function sectionOverrideCss(id: string, st: BlockStyle): string {
 const sel = `.vya-b-${id}`;
 const out: string[] = [];
 if (st.align) {
 // Section-wide default — applies to any text (by class, so it also covers fields with no dedicated
 // per-field override below, like "quote"/"price"/"attribution"). The per-field rules that follow are
 // emitted after this, so they win for the fields they cover without touching the others.
 out.push(`${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{text-align:${st.align}!important}`);
 out.push(`${sel} .vya-hero-inner{align-items:${ALIGN_FLEX[st.align]}!important;text-align:${st.align}!important}`);
 }
 // Per-field alignment: heading/subtext/cta/body can each be aligned independently of one another and
 // of the section-wide default above — targeted by `data-field`, not by class, since the class alone
 // can't tell two DIFFERENT fields apart (e.g. a "quote" also renders with the .vya-heading class).
 // `align-self` is a no-op outside a flex container, so it's safe to always include — it only actually
 // repositions the field within a flex hero, where align-items alone would otherwise move every field together.
 for (const [field, a] of [["heading", st.headingAlign], ["subtext", st.subtextAlign], ["body", st.bodyAlign]] as const) {
 if (!a) continue;
 out.push(`${sel} [data-field="${field}"]{text-align:${a}!important;align-self:${ALIGN_FLEX[a]}!important}`);
 }
 // The button needs a DIFFERENT technique: it's a small inline-block pill, not full-width running
 // text, so `text-align` on itself has nothing to do — text-align only matters to a box's OWN wrapped
 // content. What actually repositions a small box is `display:block` + `width:max-content` (so it
 // shrinks back to its label instead of stretching full-width) + auto-margins, which centers/pins it
 // regardless of whether the parent happens to be a flex container (the hero WITH a photo) or a plain
 // block (the hero with none — align-self alone does nothing there, which is why an earlier version
 // of this control visibly did nothing for that variant).
 if (st.ctaAlign) {
 const a = st.ctaAlign;
 const ml = a === "right" ? "auto" : "0", mr = a === "left" ? "auto" : "0";
 out.push(`${sel} [data-field="cta"]{display:block!important;width:max-content!important;max-width:100%!important;margin-left:${ml}!important;margin-right:${mr}!important;align-self:${ALIGN_FLEX[a]}!important}`);
 }
 if (st.textColor) out.push(`${sel},${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{color:${st.textColor}!important}`);
 // Explicit px wins over the preset scale — same "numeric overrides preset" pattern as padY/space.
 if (st.headingSizePx) out.push(`${sel} .vya-heading{font-size:${st.headingSizePx}px!important;line-height:1.12!important}`);
 else if (st.headingSize) out.push(`${sel} .vya-heading{font-size:${HEAD_SCALE[st.headingSize]}!important;line-height:1.12!important}`);
 if (st.headingFont) out.push(`${sel} .vya-heading{font-family:'${st.headingFont}',Georgia,serif!important}`);
 if (st.tracking != null) out.push(`${sel} .vya-heading{letter-spacing:${(st.tracking / 100).toFixed(3)}em!important}`);
 if (st.subtextSizePx) out.push(`${sel} .vya-sub{font-size:${st.subtextSizePx}px!important}`);
 if (st.subtextFont) out.push(`${sel} .vya-sub{font-family:'${st.subtextFont}',Georgia,serif!important}`);
 if (st.lineHeight != null) out.push(`${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{line-height:${(st.lineHeight / 100).toFixed(2)}!important}`);
 if (st.textBold) out.push(`${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{font-weight:700!important}`);
 if (st.textItalic) out.push(`${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{font-style:italic!important}`);
 if (st.textUnderline) out.push(`${sel} .vya-heading,${sel} .vya-sub,${sel} .vya-body{text-decoration:underline!important}`);
 // Per-ELEMENT text styling (free[key]) — the Figma/Canva-style per-field overrides. Emitted AFTER the
 // section-wide size/weight/etc. rules above so a field's own styling always wins (equal specificity → later).
 if (st.free) for (const [field, fv] of Object.entries(st.free)) {
 const d: string[] = [];
 if (fv.fontPx) d.push(`font-size:${fv.fontPx}px`);
 if (fv.font) d.push(`font-family:'${fv.font}',Georgia,serif`);
 if (fv.bold != null) d.push(`font-weight:${fv.bold ? 700 : 400}`);
 if (fv.italic != null) d.push(`font-style:${fv.italic ? "italic" : "normal"}`);
 if (fv.underline != null) d.push(`text-decoration:${fv.underline ? "underline" : "none"}`);
 if (fv.color) d.push(`color:${fv.color}`);
 if (fv.align) d.push(`text-align:${fv.align}`);
 if (fv.ls != null) d.push(`letter-spacing:${(fv.ls / 100).toFixed(3)}em`);
 if (fv.lh != null) d.push(`line-height:${(fv.lh / 100).toFixed(2)}`);
 if (fv.transform) d.push(`text-transform:${fv.transform}`);
 if (d.length) out.push(`${sel} [data-field="${field}"]{${d.map((x) => x + "!important").join(";")}}`);
 }
 // The section's own built-in CTA (`.vya-cta`) — distinct from a free-form overlay button.
 // "Fill" (default) vs "No fill" (outline): the outline's border/text colour defaults to ctaBg, so
 // toggling Fill→No-fill on an already-coloured button keeps the same colour, just hollowed out.
 const ctaBase: string[] = [];
 if (st.ctaOutline) {
 const c = st.ctaBorderColor || st.ctaBg || "currentColor";
 ctaBase.push("background:transparent!important", `color:${st.ctaColor || c}!important`, `border-color:${c}!important`);
 } else {
 if (st.ctaBg) ctaBase.push(`background:${st.ctaBg}!important`, `border-color:${st.ctaBg}!important`);
 if (st.ctaColor) ctaBase.push(`color:${st.ctaColor}!important`);
 }
 if (st.ctaShape) ctaBase.push(`border-radius:${st.ctaShape === "pill" ? "999px" : st.ctaShape === "rounded" ? "10px" : "0"}!important`);
 if (st.ctaFont) ctaBase.push(`font-family:'${st.ctaFont}',Georgia,serif!important`);
 // Same sm/md/lg scale as a free-form overlay button's own Size control (SIZE_CLS below), so the two
 // read as literally the same control, just applied to a different kind of button.
 if (st.ctaSize) { const CTA_SIZE_PX: Record<string, string> = { sm: "padding:8px 20px!important;font-size:10px!important", md: "padding:12px 28px!important;font-size:12px!important", lg: "padding:14px 36px!important;font-size:13px!important" }; ctaBase.push(CTA_SIZE_PX[st.ctaSize]); }
 const ctaBorderW = st.ctaBorder ?? (st.ctaOutline ? 2 : undefined); // outline defaults to a visible 2px if no width was set
 if (ctaBorderW != null) ctaBase.push("border-style:solid!important", `border-width:${ctaBorderW}px!important`);
 // Full width wins over any per-field alignment set above (a 100%-wide button has nowhere left/right
 // to move to) — this rule is declared after that one, so it correctly takes precedence for `.vya-cta`.
 if (st.ctaFullWidth) ctaBase.push("display:block!important", "width:100%!important", "max-width:none!important", "text-align:center!important");
 if (ctaBase.length) out.push(`${sel} .vya-cta{${ctaBase.join(";")}}`);
 if (st.ctaHoverBg || st.ctaHoverColor || st.ctaOutline) {
 // A "No fill" button fills in on hover by default — reads as an intentional action even if no
 // explicit hover colour was set.
 const hoverBg = st.ctaHoverBg || (st.ctaOutline ? (st.ctaBorderColor || st.ctaBg) : undefined);
 const hoverColor = st.ctaHoverColor || (st.ctaOutline ? "#ffffff" : undefined);
 const parts = [hoverBg ? `background:${hoverBg}!important;border-color:${hoverBg}!important` : "", hoverColor ? `color:${hoverColor}!important` : ""].filter(Boolean).join(";");
 if (parts) out.push(`${sel} .vya-cta:hover{${parts}}`);
 }
 // Padding: explicit px wins over the preset.
 if (st.padY != null || st.padX != null) {
 const py = st.padY != null ? `${st.padY}px` : (st.space ? PAD_SCALE[st.space] : null);
 const parts = [py != null ? `padding-top:${py}!important;padding-bottom:${py}!important` : "", st.padX != null ? `padding-left:${st.padX}px!important;padding-right:${st.padX}px!important` : ""].filter(Boolean).join(";");
 if (parts) out.push(`${sel}{${parts}}`);
 } else if (st.space) out.push(`${sel}{padding-top:${PAD_SCALE[st.space]}!important;padding-bottom:${PAD_SCALE[st.space]}!important}`);
 if (st.minH) {
 // A HARD height, not a floor: `min-height` can only ever grow a box, never shrink it below its
 // content's natural size — so dragging a resize handle inward (smaller) would silently do nothing.
 // `height` (+ clipping the overflow) makes the box match exactly what was dragged, in both directions.
 out.push(`${sel}{height:${st.minH}px!important;overflow:hidden}`);
 // A section can force its own height from INSIDE itself — a hero's image frame carries an inline
 // 84vh, and (when the content isn't free-positioned) its text wrapper carries min-h-[84vh] — both
 // independent of the section box above. Override those too, or resizing visibly does nothing.
 // `.vya-fill` is the general contract for this: any layout whose wrapper sets its own height wears
 // it, so a NEW variant participates in section resizing without this compiler learning about it.
 out.push(`${sel} .vya-fill,${sel} .vya-hero-frame,${sel} .vya-hero-inner,${sel} .vya-fill .vya-slide{height:${st.minH}px!important;min-height:0!important}`);
 }
 // Border · radius · shadow — the section reads as a styled card.
 const box: string[] = [];
 if (st.radius) box.push(`border-radius:${st.radius}px`, "overflow:hidden");
 if (st.border) box.push(`border:${st.border}px solid ${st.borderColor || "currentColor"}`);
 if (st.shadow) box.push(`box-shadow:${SHADOW_CSS[st.shadow]}`);
 if (box.length) out.push(`${sel}{${box.join(";")}}`);
 return out.join("");
}

// A free-form overlay BUTTON's hover state. Inline styles can't express `:hover`, so this scopes a
// real CSS rule to the one overlay via its `data-ovl` attribute (already on its wrapper element).
function overlayOverrideCss(o: Overlay): string {
 if (o.kind !== "button") return "";
 const p = o.props || {};
 if (!p.hoverBg && !p.hoverColor) return "";
 const parts = [p.hoverBg ? `background:${p.hoverBg}!important` : "", p.hoverColor ? `color:${p.hoverColor}!important` : ""].filter(Boolean).join(";");
 return `[data-ovl="${o.id}"] .vya-cta:hover{${parts}}`;
}

function blockBody(b: Block, ctx: Ctx) {
 // Every editing affordance a layout needs — see blocks/kit.tsx.
 const kit = makeKit(b, ctx);
 const { p } = kit;
 const { colors, head, fg } = ctx;
 // Which LAYOUT this section renders as. An absent or unrecognized id resolves to the type's default,
 // so a storefront never goes blank because of a variant this build doesn't know about.
 const variant = resolveVariant(b.type, b.variant)?.id ?? "";
 switch (b.type) {
 case "announcement": return renderAnnouncement(kit, variant);

 // The hero family lives in blocks/hero.tsx — five layouts sharing one editing contract. The
 // default ("bleed") is the exact markup this switch used to hold, so existing storefronts are
 // unchanged.
 case "hero": return renderHero(kit, variant);

 case "featured": return renderFeatured(kit, variant);

 case "collections": return renderCollections(kit, variant);

 case "testimonials": return renderTestimonials(kit, variant);

 case "countdown": return renderCountdown(kit, variant);

 case "blog": return renderBlog(kit, variant);

 case "columns": return renderColumns(kit, variant);

 case "text": return renderText(kit, variant);

 case "image": return renderImage(kit, variant);

 case "gallery": return renderGallery(kit, variant);

 case "split": return renderSplit(kit, variant);

 case "marquee": return renderMarquee(kit, variant);

 case "statement": return renderStatement(kit, variant);

 case "spotlight": return renderSpotlight(kit, variant);

 case "video": return renderVideo(kit, variant);

 case "newsletter": return renderNewsletter(kit, variant);

 case "contact": return renderContact(kit, variant);

 case "faq": return renderFaq(kit, variant);

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
 freeEdit,
 onContentDragStart,
 onFaqOp,
 faqDnd,
 storeSlug,
 onFieldFocus,
 onResizeSectionStart,
 onPickImage,
 skin,
}: {
 blocks: Block[];
 colors: Colors;
 fonts: { heading?: string; body?: string };
 products: BlockProduct[];
 shopHref?: string;
 // Global corner style ("shapes") — rounds product cards, images, and buttons store-wide.
 radius?: Radius;
 // Global style skin — type scale, spacing, and button shape across every section at once.
 // Emitted with NO !important, so any per-section override the merchant sets still beats it.
 skin?: string;
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
 onMove?: (i: number, dir: "up" | "down") => void; // one-click nudge, next to the drag grip
 };
 // Editor-only: drag free-form overlay elements around a section. Drag math (px→%) lives in the parent
 // since it needs the section's rect; this renderer just reports select + drag-start.
 overlayEdit?: OverlayEdit;
 freeEdit?: FreeEdit;
 // Editor-only: drag the selected hero's content group to reposition it within the banner.
 onContentDragStart?: (blockId: string, e: React.PointerEvent) => void;
 // Editor-only: add/remove a FAQ accordion row.
 onFaqOp?: (blockId: string, op: "add" | { remove: number }) => void;
 // Editor-only: drag FAQ rows to reorder (within a section and between FAQ sections).
 faqDnd?: FaqDnd;
 // Live-site only: the store handle, so a contact section can submit to the right store.
 storeSlug?: string;
 // Editor-only: focusing a text field inside a section reports (blockId, field key) — the parent
 // uses this to show that field's own contextual toolbar instead of the section's background one.
 onFieldFocus?: (blockId: string, key: string) => void;
 // Editor-only: drag a section's top/bottom resize handle to set its height explicitly.
 onResizeSectionStart?: (blockId: string, edge: "top" | "bottom", e: React.PointerEvent) => void;
 // Editor-only: open the file picker for an image slot clicked directly on the canvas.
 onPickImage?: (apply: (url: string) => void) => void;
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
 // Skin rules are emitted LAST so they lose to nothing but the merchant's own !important overrides.
 const skinRules = skinCss(skin);
 const overlayCss = ".vya-ovl-layer{position:absolute;inset:0;z-index:20;pointer-events:none}.vya-ovl{position:absolute;pointer-events:auto}@container (max-width:640px){.vya-ovl-layer{position:static;display:flex;flex-direction:column;align-items:center;gap:.85rem;padding:1.75rem 1.25rem}.vya-ovl{position:static!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;max-width:100%}.vya-ovl-shape{width:52%!important}.vya-ovl-line{width:82%!important}.vya-hero-free{position:static!important;left:auto!important;top:auto!important;transform:none!important;width:auto!important;max-width:100%!important;margin:0 auto;padding:6rem 1.25rem}.vya-free,.vya-free-el{position:static!important;left:auto!important;top:auto!important;transform:none!important;max-width:100%!important}.vya-free-spacer{display:none!important}}";
 return (
 // `@container` makes the sections respond to THIS element's width, not the viewport — so the
 // editor's device preview reflows truthfully, and on the live site (where this is full-width) it
 // behaves like before. Breakpoints below are container variants (@xl/@lg/@2xl), not viewport ones.
 <div className={`@container${skinRules ? ` vya-skin-${skin}` : ""}`} style={{ fontFamily: body, color: colors.text }}>
 <style dangerouslySetInnerHTML={{ __html: ".vya-marquee-track{animation:vya-marq 30s linear infinite}@keyframes vya-marq{to{transform:translateX(-50%)}}@media(prefers-reduced-motion:reduce){.vya-marquee-track{animation:none}}.vya-faq summary{list-style:none}.vya-faq summary::-webkit-details-marker{display:none}.vya-faq-chev{transition:transform .2s ease}.vya-faq details[open]>summary .vya-faq-chev{transform:rotate(180deg)}" + radiusCss + overlayCss + skinRules }} />
 {blocks.map((b, i) => {
 const { fg } = bgFor(b.style?.bg, colors);
 const background = b.style ? sectionBg(b.style, colors) : undefined; // solid or gradient
 const inner = blockBody(b, { colors, head, body, products, shopHref, fg, edit, onEditField, selectedId, onContentDragStart, onFaqOp, faqDnd, storeSlug, onFieldFocus, bgMedia: b.style?.bgMedia, freeEdit, onPickImage });
 const editable = typeof onSelect === "function";
 // Stable, targetable classes so custom CSS (AI- or hand-written) can hook any section
 // and element: e.g. `.vya-hero .vya-heading { ... }` or `.vya-b-<id> { ... }`.
 const secClass = `vya-sec vya-${b.type} vya-b-${b.id}`;
 const dragging = reorder?.dragIndex ?? null;
 const showLine = editable && reorder && reorder.overIndex === i && dragging !== null && dragging !== i;
 const overrideCss = (b.style ? sectionOverrideCss(b.id, b.style) : "") + (b.overlays?.length ? b.overlays.map(overlayOverrideCss).join("") : "");
 // A section background photo (full-bleed, behind everything). Wins over a bg colour; a soft scrim
 // keeps overlaid text legible without forcing the seller to fiddle. url() is quote-escaped.
 // Hero/image sections render their OWN picture (props.image), so they ignore this layer — otherwise a
 // stale bgImage would show a grey scrim behind them.
 // Background media: a bgMedia object (image/video/embed) supersedes the legacy bgImage string.
 // Hero/image sections paint their own picture, so they opt out of this full-bleed layer.
 const selfPaints = b.type === "hero" || b.type === "image";
 const media = selfPaints ? undefined : b.style?.bgMedia;
 const bgImg = selfPaints ? undefined : (media?.kind === "image" ? media.url : b.style?.bgImage);
 const bgVideo = media?.kind === "video" ? media.url : null;
 const bgVideoPoster = media?.kind === "video" ? media.poster : undefined;
 const bgEmbed = media?.kind === "embed" ? backgroundEmbedSrc(media.url) : null;
 const ov = (b.style?.bgOverlay ?? 24) / 100; // scrim strength over a photo/video (keeps text legible)
 const scrim = `linear-gradient(rgba(0,0,0,${(ov * 0.75).toFixed(2)}),rgba(0,0,0,${ov.toFixed(2)}))`;
 const secStyle: React.CSSProperties = bgImg
 ? { backgroundImage: `${scrim}, url("${bgImg.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: "center", color: b.style?.textColor || "#ffffff" }
 : (bgVideo || bgEmbed) ? { background: background || "#000", color: b.style?.textColor || "#ffffff" }
 : background ? { background, color: b.style?.textColor || fg } : {};
 return (
 <div
 key={b.id}
 onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onSelect!(b.id); } : undefined}
 onDragOver={editable && reorder ? (e) => { if (Array.from(e.dataTransfer.types).includes("Files")) return; e.preventDefault(); reorder.onOver(i); } : undefined}
 onDrop={editable && reorder ? (e) => { if (Array.from(e.dataTransfer.types).includes("Files")) return; e.preventDefault(); reorder.onDrop(i); } : undefined}
 // A section CLIPS its own content. A free-positioned heading dragged near an edge (or any position
 // stored before the drag clamp existed) would otherwise paint over the section above or below it —
 // on the live storefront as much as in the editor. Sections resized with the handle already did
 // this via style.minH; this makes it true of every section.
 className={editable ? `${secClass} group/sec relative overflow-hidden cursor-pointer transition-shadow ${dragging === i ? "opacity-40" : ""} ${selectedId === b.id ? "shadow-[inset_0_0_0_2px_#5D0F17]" : "hover:shadow-[inset_0_0_0_2px_rgba(93,15,23,0.45)]"}` : `${secClass} relative overflow-hidden`}
 style={Object.keys(secStyle).length ? secStyle : undefined}
 >
 {overrideCss && <style dangerouslySetInnerHTML={{ __html: overrideCss }} />}
 {showLine && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] bg-[#5D0F17]" />}
 {editable && (
 <span className={`pointer-events-none absolute left-2 top-2 z-20 rounded bg-[#5D0F17] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white transition-opacity ${selectedId === b.id ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"}`}>{b.type.replace(/[-_]/g, " ")}</span>
 )}
 {editable && reorder && (
 <div className={`absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-md bg-white/90 p-0.5 shadow-sm backdrop-blur transition-opacity ${selectedId === b.id ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"}`}>
 {reorder.onMove && (
 <>
 <button type="button" title="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); reorder.onMove!(i, "up"); }} className="grid h-6 w-6 place-items-center rounded text-[#5D0F17] transition hover:bg-[#5D0F17]/10 disabled:opacity-25"><ChevronUp size={14} /></button>
 <button type="button" title="Move down" disabled={i === blocks.length - 1} onClick={(e) => { e.stopPropagation(); reorder.onMove!(i, "down"); }} className="grid h-6 w-6 place-items-center rounded text-[#5D0F17] transition hover:bg-[#5D0F17]/10 disabled:opacity-25"><ChevronDown size={14} /></button>
 </>
 )}
 <button
 type="button"
 draggable
 title="Drag to reorder"
 onClick={(e) => e.stopPropagation()}
 onDragStart={(e) => { reorder.onStart(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); const sec = (e.currentTarget as HTMLElement).closest(".vya-sec"); if (sec) e.dataTransfer.setDragImage(sec as Element, 30, 20); }}
 onDragEnd={() => reorder.onEnd()}
 className="grid h-6 w-6 cursor-grab place-items-center rounded text-[#5D0F17] transition hover:bg-[#5D0F17]/10 active:cursor-grabbing"
 >
 <GripVertical size={14} />
 </button>
 </div>
 )}
 {editable && onResizeSectionStart && selectedId === b.id && SEC_HANDLE_POS.map(([edge, pos]) => (
 // A larger, invisible hit box (z-30, above the reorder controls/section label) with the small
 // visible pill centred inside it, so a slightly-off click still lands.
 <span
 key={edge + pos}
 title="Drag to resize the section"
 onClick={(e) => e.stopPropagation()}
 onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeSectionStart(b.id, edge, e); }}
 className={`absolute z-30 cursor-ns-resize touch-none h-3 w-12 ${pos}`}
 >
 <span className="pointer-events-none absolute inset-0 m-auto h-2 w-10 rounded-full border border-white bg-[#5D0F17] shadow" />
 </span>
 ))}
 {/* Full-bleed video / embed background behind the section — click-through, muted, looping. */}
 {(bgVideo || bgEmbed) && (
 <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
 {bgVideo
 ? <video className="absolute inset-0 h-full w-full object-cover" src={bgVideo} poster={bgVideoPoster} autoPlay muted loop playsInline preload="metadata" />
 : <iframe className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full max-w-none -translate-x-1/2 -translate-y-1/2 border-0" src={bgEmbed!} title="Background video" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" tabIndex={-1} />}
 <div className="absolute inset-0" style={{ background: scrim }} />
 </div>
 )}
 {(bgVideo || bgEmbed) ? <div className="relative z-[1]">{inner}</div> : inner}
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
