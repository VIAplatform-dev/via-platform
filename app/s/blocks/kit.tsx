/* eslint-disable @next/next/no-img-element */
// The shared editing kit every section layout is built from.
//
// Why this file exists: the studio's editing affordances — click-to-type, rich inline formatting,
// drag/scale a heading anywhere on the canvas, repeated-item editing — used to live as closures
// inside one big `blockBody` switch. That was fine for 20 layouts written in one place, but a
// section family per file cannot reach into a closure, and re-implementing "editable text" per
// layout is exactly how you end up with beautiful variants that quietly aren't editable.
//
// So the affordances live here, once, and a layout is just a composition of them. A new variant
// gets full editing parity by USING these, not by wiring anything.
//
// Everything here is hook-free: the same code renders the live storefront (a server component) and
// the editor's preview (client). `ctx.edit` is what differs — when it's off, every helper collapses
// to plain, inert markup.
import type { Block, BlockStyle, Overlay } from "@/app/lib/storefront-blocks";
import { SERIF_FONTS } from "@/app/lib/storefront-templates";
import { readItems, writeItems, type Item, type ItemSchema } from "@/app/lib/storefront-items";

export const ff = (name?: string) => (name ? `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

export type BlockProduct = { key?: string; title: string; price: string; image: string; href?: string };
export type Colors = { bg: string; text: string; accent: string };

export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "e" | "w";
export type OverlayEdit = {
 selectedId?: string | null;
 editingId?: string | null; // the text element currently being typed into
 onSelect: (blockId: string, overlayId: string) => void;
 onDragStart: (blockId: string, overlayId: string, e: React.PointerEvent) => void;
 onResizeStart: (blockId: string, overlayId: string, handle: ResizeHandle, e: React.PointerEvent) => void;
 onStartEdit: (blockId: string, overlayId: string) => void; // double-click a text element to edit inline
 onText: (blockId: string, overlayId: string, value: string) => void;
};
// Same interaction as OverlayEdit, but for a section's BUILT-IN elements (hero heading/subtext/cta, …),
// keyed by the element's edit key. Lets template content be selected, dragged, scaled, and inline-edited.
export type FreeEdit = {
 selectedKey?: string | null;
 editingKey?: string | null;
 onSelect: (blockId: string, key: string) => void;
 onStartEdit: (blockId: string, key: string) => void;
 onDragStart: (blockId: string, key: string, e: React.PointerEvent) => void;
 onResizeStart: (blockId: string, key: string, handle: ResizeHandle, e: React.PointerEvent) => void;
 onText: (blockId: string, key: string, value: string) => void;
};
// Which resize handles a kind exposes: shapes/images resize in both axes (corners), text/buttons only
// widen (side handles) since their height flows from content.
export const HANDLE_SET: Record<string, ResizeHandle[]> = {
 rect: ["nw", "ne", "sw", "se"], circle: ["nw", "ne", "sw", "se"], image: ["nw", "ne", "sw", "se"],
 triangle: ["nw", "ne", "sw", "se"],
 // A form sizes by width; its height comes from the fields inside it.
 form: ["w", "e"],
 line: ["w", "e"],
 // Corners SCALE text/buttons (font size); side handles still adjust width only.
 button: ["nw", "ne", "sw", "se", "w", "e"], text: ["nw", "ne", "sw", "se", "w", "e"],
};
export const HANDLE_POS: Record<ResizeHandle, string> = {
 nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
 ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
 sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
 se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
 w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
 e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

// Drag-to-reorder for FAQ rows — within a section and between two FAQ sections, with a snap/drop line.
// State lives in the parent (studio) so a row can travel across sections; the renderer just reports the
// drag/over/drop events and draws the indicator where the row will land.
export type FaqDnd = {
 dragBlock?: string | null;
 dragIndex?: number | null;
 overBlock?: string | null;
 overIndex?: number | null;
 onGripDown: (blockId: string, index: number, e: React.PointerEvent) => void;
};

export type Ctx = {
 colors: Colors; head?: string; body?: string; products: BlockProduct[]; shopHref: string; fg: string;
 // The store's own collections, each with the items the seller put in it. A product section can name
 // one (props.collection) and show exactly those pieces instead of "the newest few".
 collections?: { slug: string; title: string; products: BlockProduct[] }[];
 edit?: boolean;
 onEditField?: (id: string, key: string, value: string) => void;
 selectedId?: string | null;
 onContentDragStart?: (blockId: string, e: React.PointerEvent) => void;
 onFaqOp?: (blockId: string, op: "add" | { remove: number }) => void;
 faqDnd?: FaqDnd;
 storeSlug?: string;
 // Lowercased collection title -> that collection's page href, pre-built (and preview-wrapped) by
 // StorefrontView. Lets a shop-by-category tile deep-link the collection it names instead of
 // dropping every tile on the bare shop page.
 collectionHrefs?: Record<string, string>;
 onFieldFocus?: (blockId: string, key: string) => void;
 bgMedia?: BlockStyle["bgMedia"];
 freeEdit?: FreeEdit;
 // Editor-only: open the store's file picker and hand back the uploaded URL. Lets an image slot on
 // the canvas BE the upload control — click the empty frame, choose a photo, done — instead of
 // making the merchant hunt for the matching field in the side panel.
 onPickImage?: (apply: (url: string) => void) => void;
 // Upload a dropped file and hand back its URL. Separate from onPickImage because dragging a photo
 // straight onto the slot is the gesture people actually reach for — clicking, then hunting through
 // a file dialog for something already sitting in a folder, is the slower path.
 onDropImage?: (file: File, apply: (url: string) => void) => void;
};

// An image slot inside a layout (a column's photo, a split's picture, a category tile).
//
// Live: the photo, or nothing at all when it's unset — a placeholder box on a real storefront is a
// bug, not a hint. Editor: always a frame, and clicking it opens the file picker and writes the URL
// straight back through `onPick`. An existing photo is replaced the same way, so a merchant never has
// to recreate a section (or find the right panel row) to change one picture.
export function ImageSlot({ kit, src, alt, onPick, ratio = "aspect-[4/3]", className = "", rounded = "vya-round", label = "Photo" }: {
 kit: EditKit; src?: string; alt?: string; onPick: (url: string) => void;
 ratio?: string; className?: string; rounded?: string; label?: string;
}) {
 const { ctx } = kit;
 const pick = ctx.onPickImage;
 const drop = ctx.onDropImage;
 // Drag feedback is applied to the node directly rather than held in state: this file is hook-free on
 // purpose (see the header) so the very same components render the live storefront as a server
 // component. A useState here would break that, and only the editor ever sees this highlight anyway.
 const ring = "ring-2 ring-[#5D0F17]";
 if (!ctx.edit) {
  return src ? <div className={`${rounded} ${ratio} w-full overflow-hidden ${className}`} style={{ background: `${ctx.fg}0d` }}><img src={src} alt={alt || ""} loading="lazy" className="h-full w-full object-cover" /></div> : null;
 }
 const open = pick ? (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); pick(onPick); } : undefined;
 return (
  <div
   role={open ? "button" : undefined}
   tabIndex={open ? 0 : undefined}
   onClick={open}
   onKeyDown={open ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); pick!(onPick); } } : undefined}
   onDragOver={drop ? (e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add(...ring.split(" ")); } : undefined}
   onDragLeave={drop ? (e) => e.currentTarget.classList.remove(...ring.split(" ")) : undefined}
   onDrop={drop ? (e) => {
    const f = e.dataTransfer.files?.[0];
    e.currentTarget.classList.remove(...ring.split(" "));
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    drop(f, onPick);
   } : undefined}
   title={open ? (src ? "Click or drop a photo to replace" : "Click or drop a photo") : undefined}
   className={`vya-slot group/slot relative ${rounded} ${ratio} w-full overflow-hidden ${open ? "cursor-pointer" : ""} ${className} ${src ? "" : "grid place-items-center border border-dashed"}`}
   style={src ? { background: `${ctx.fg}0d` } : { borderColor: `${ctx.fg}33`, background: `${ctx.fg}08` }}
  >
   {src
    ? <img src={src} alt={alt || ""} loading="lazy" className="h-full w-full object-cover" />
    : <span className="text-[10px] uppercase tracking-[0.2em] opacity-40">{open ? `Add ${label.toLowerCase()}` : label}</span>}
   {src && open && (
    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition-opacity group-hover/slot:opacity-100">
     <span className="rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-800">Replace</span>
    </span>
   )}
  </div>
 );
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
export function serializeInline(node: Node): string {
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
export function inlineHtml(v?: string): { __html: string } | null {
 if (!v || v.indexOf("<") === -1) return null;
 return { __html: v.replace(/<\s*script/gi, "").replace(/\son\w+\s*=/gi, " ").replace(/javascript:/gi, "") };
}
/**
 * The single piece a Spotlight features, when it's been pointed at a collection. Returns the props
 * with the collection's LEAD item filled into anything the seller left blank — so curating the
 * collection is enough and they never retype a title, price, or photo they already entered once.
 *
 * A value the seller typed always wins. And with no collection chosen, nothing changes at all:
 * every Spotlight saved before this keeps rendering exactly what it renders today.
 */
export function spotlightProps(ctx: Ctx, props: Record<string, string>): Record<string, string> {
 const slug = (props.collection || "").trim();
 if (!slug) return props;
 const lead = ctx.collections?.find((c) => c.slug === slug)?.products[0];
 if (!lead) return props;
 return {
  ...props,
  heading: props.heading || lead.title,
  price: props.price || lead.price,
  image: props.image || lead.image,
 };
}
// Decode HTML entities for plain-text rendering — so a stored "Shipping &amp; Returns" shows "Shipping &
// Returns", not the literal entity. (Only used on the no-markup branch; React re-escapes on output, so safe.)
// Which products a section shows. A named collection wins; an unnamed one (or a name that no longer
// matches a collection — renamed, deleted) falls back to the store's newest items, because a shopper
// must never meet a blank section on a live storefront.
export function productsFor(ctx: Ctx, props: Record<string, string>): BlockProduct[] {
 const slug = (props.collection || "").trim();
 if (!slug) return ctx.products;
 const hit = ctx.collections?.find((c) => c.slug === slug);
 return hit && hit.products.length ? hit.products : ctx.products;
}
// Decode HTML entities for plain-text rendering — so a stored "Shipping &amp; Returns" shows "Shipping &
export function decodeEntities(s: string): string {
 return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#0?38;/g, "&");
}

// A section's built-in element (hero heading/subtext/cta, …) that can be selected, dragged anywhere in
// its section (Canva/Docs-style: hover shows the move cursor, drag the body), corner-scaled, and
// double-clicked to edit. When it has no free transform it renders inline exactly as before; a free
// transform (`style.free[key]`) positions it absolutely (centre-anchored) at x/y % of the section canvas
// (`.vya-free-canvas`) and applies a continuous `fontPx`. On the live storefront it's a plain element.
//
// Every layout that wants a draggable built-in field renders one of these — that is the whole contract.
export function FreeField({ b, ctx, fieldKey, tag, value, className, style, href, fullWidth }: {
 b: Block; ctx: Ctx; fieldKey: string; tag: "h2" | "h3" | "p" | "a" | "span"; value: string;
 className: string; style?: React.CSSProperties; href?: string;
 // A button that's meant to span its container (a form's submit bar) rather than hug its label.
 // Without this the editor's selection wrapper shrink-wraps it and the label spills out of the box.
 fullWidth?: boolean;
}) {
 const El: React.ElementType = tag;
 const fr = b.style?.free?.[fieldKey];
 const fe = ctx.freeEdit;
 // fontPx applies whether or not the element is positioned; x/y (both) pull it out of flow to float.
 // For a button (tag="a"), padding scales proportionally with it too — same ratio the free-form
 // overlay button already uses — so the WHOLE button grows/shrinks together (Google-Docs style),
 // instead of the label growing inside a fixed-size box (which reads as a crop, not a resize).
 const positioned = fr?.x != null && fr?.y != null;
 const merged = {
  ...(style || {}),
  ...(fr?.fontPx ? { fontSize: `${fr.fontPx}px`, ...(tag === "a" ? { padding: `${Math.round(fr.fontPx * 0.62)}px ${Math.round(fr.fontPx * 1.6)}px` } : {}) } : {}),
  // A field's flow margins (a button's `mt-9` spacing from the subtext above it) are meaningless once
  // it's been dragged to an absolute position — but they'd still inflate its box, which is what draws
  // the selection ring and what the drag clamp measures. So a positioned field carries no margin: the
  // ring hugs the element, and dragging isn't restricted by empty space that isn't part of it.
  ...(positioned ? { margin: 0 } : {}),
  ...(fullWidth ? { width: "100%" } : {}),
  // An explicit width (dragged from a side handle) beats whatever max-width the layout gave the
  // field — that's the point of setting one. A POSITIONED field takes its width on the wrapper
  // instead (see posStyle): the wrapper is the box that's placed, so sizing the child against it
  // would be circular.
  ...(fr?.w && !positioned ? { width: `${fr.w}%`, maxWidth: "none" } : {}),
  ...(fr?.w && positioned ? { width: "100%" } : {}),
 };
 const posStyle: React.CSSProperties | undefined = positioned
  ? { position: "absolute", left: `${fr!.x}%`, top: `${fr!.y}%`, transform: "translate(-50%,-50%)", ...(fr!.w ? { width: `${fr!.w}%`, maxWidth: "none" } : { maxWidth: "min(90%,46rem)" }) }
  : undefined;
 const safe = value ?? "";
 const htmlContent = inlineHtml(safe) ? { dangerouslySetInnerHTML: inlineHtml(safe)! } : { children: decodeEntities(safe) };
 // A field that's been dragged somewhere is absolutely positioned, which takes it out of normal flow
 // — and everything below it slides up into the space it left, so moving a heading appeared to drag
 // the subtext along with it. This invisible stand-in keeps that space, so each field stays its own
 // thing and moving one moves exactly one. It carries no `data-field`, because the editor finds a
 // field by that attribute to anchor its toolbar and must never find this instead.
 const spacer = positioned
  ? <El aria-hidden="true" className={`vya-free-spacer invisible ${className}`} style={merged} {...htmlContent} />
  : null;

 // Live storefront (or no editor wired): a plain element, positioned if it has x/y.
 if (!ctx.edit || !fe) {
  const node = <El className={className} data-field={fieldKey} style={merged} {...(tag === "a" ? { href } : {})} {...htmlContent} />;
  return positioned ? <>{spacer}<div className="vya-free-el" style={posStyle}>{node}</div></> : node;
 }
 const selected = ctx.selectedId === b.id && fe.selectedKey === fieldKey;
 const editing = ctx.selectedId === b.id && fe.editingKey === fieldKey;
 const textNode = editing
  ? <El className={className} data-field={fieldKey} style={merged} contentEditable suppressContentEditableWarning
     ref={(el: HTMLElement | null) => { if (el && document.activeElement !== el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } }}
     onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
     onBlur={(e: React.FocusEvent<HTMLElement>) => { const html = serializeInline(e.currentTarget); fe.onText(b.id, fieldKey, html.indexOf("<") === -1 ? (e.currentTarget.textContent || "").trim() : html); }}
     {...htmlContent} />
  : <El className={className} data-field={fieldKey} style={merged} {...htmlContent} />;
 return (
  <>
  {spacer}
  <div
   // The selection wrapper exists only in the editor, so its display has to reproduce what the field
   // would do WITHOUT it — otherwise the canvas stops matching the live site. A button hugs its
   // label; running text is a block. Wrapping text in an inline-block was making heading, subtext,
   // and button flow onto one line in any layout whose container is a plain block rather than a flex
   // column (a hero with no photo, split, spotlight, text).
   // inline-FLEX, not inline-block: an inline-block wrapper adds a line box under its content
   // (room for descenders), so the selection ring sat visibly lower than the button it framed.
   className={`vya-free touch-none ${positioned ? "inline-flex" : fullWidth ? "relative flex w-full" : tag === "a" ? "relative inline-flex" : "relative block"} ${editing ? "cursor-text" : "cursor-move"} ${selected ? "shadow-[0_0_0_2px_#5D0F17]" : "hover:shadow-[0_0_0_2px_rgba(93,15,23,0.5)]"}`}
   style={posStyle}
   onClick={(e) => {
    e.preventDefault(); e.stopPropagation();
    if (editing) return;
    fe.onSelect(b.id, fieldKey);
    // A button field ALSO gets its own dedicated "Edit button" panel (fill/shape/outline/hover/…) —
    // free positioning above is generic to every field, but button-specific appearance isn't, so both
    // fire together here rather than one replacing the other.
    if (fieldKey === "cta" || fieldKey.startsWith("cta")) ctx.onFieldFocus?.(b.id, fieldKey);
   }}
   onDoubleClick={(e) => { e.stopPropagation(); fe.onStartEdit(b.id, fieldKey); }}
   onPointerDown={!editing ? (e) => { e.stopPropagation(); fe.onDragStart(b.id, fieldKey, e); } : undefined}
  >
   {textNode}
   {selected && !editing && HANDLE_SET.text.map((hd) => (
    <span key={hd} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); fe.onResizeStart(b.id, fieldKey, hd, e); }}
     className={`absolute z-10 h-3 w-3 rounded-full border border-white bg-[#5D0F17] shadow ${HANDLE_POS[hd]}`} />
   ))}
  </div>
  </>
 );
}

// ── the kit a layout is handed ──────────────────────────────────────────────────────────────────
export type EditKit = {
 b: Block;
 ctx: Ctx;
 p: Record<string, string>;
 selected: boolean;
 /** Rich inline text (bold/italic/colour survive) bound to a props key. Spread onto an element. */
 txt: (v: string | undefined, key: string) => Record<string, unknown>;
 /** Plain multi-line text, where line breaks matter more than inline styling. */
 txtPlain: (v: string | undefined, key: string) => Record<string, unknown>;
 /** One field of a repeated item — commits through the caller, which rebuilds the list. */
 txtItem: (v: string | undefined, onCommit: (val: string) => void) => Record<string, unknown>;
 /** Repeated content as real objects (see storefront-items.ts). */
 items: (schema: ItemSchema) => Item[];
 /** Write repeated content back. Goes through onEditField, so undo/autosave pick it up unchanged. */
 setItems: (schema: ItemSchema, next: Item[]) => void;
 /** Editor-only drag grip for a floating content group (the hero's text block). */
 moveGrip: React.ReactNode;
};

export function makeKit(b: Block, ctx: Ctx): EditKit {
 const p = b.props || {};
 const selected = !!ctx.edit && ctx.selectedId === b.id;
 // Editor-only: type directly on the canvas. Sync on blur (not while typing, so React never
 // re-renders mid-edit and jumps the caret). Clicking text edits it; the click is swallowed so it
 // doesn't also select the whole section.
 const editBase = {
  contentEditable: true as const,
  suppressContentEditableWarning: true as const,
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
 };
 // Focusing into a text field shows that field's OWN contextual toolbar (colour/align, + font/size for
 // headings) instead of the section's background toolbar. Swallowed like onClick, for the same reason.
 const onFieldFocus = (key: string) => (e: React.FocusEvent) => { e.stopPropagation(); ctx.onFieldFocus?.(b.id, key); };

 const txt: EditKit["txt"] = (v, key) => {
  const content = inlineHtml(v) ? { dangerouslySetInnerHTML: inlineHtml(v)! } : { children: decodeEntities(v ?? "") };
  if (!ctx.edit) return content;
  // On blur: serialize to safe inline HTML, but if the result carries NO markup, store the raw text
  // instead — else "Shipping & Returns" saves as the escaped entity and renders literally. Rich
  // formatting (bold/italic/spans) still round-trips as HTML.
  // `data-field` lets the editor find THIS exact element (not just "a .vya-heading somewhere on the
  // page" — several field kinds share a class, e.g. a "quote" also renders as .vya-heading) to anchor
  // its floating toolbar beside the field you're actually in, rather than the whole section.
  return { ...editBase, "data-field": key, onFocus: onFieldFocus(key), onBlur: (e: React.FocusEvent<HTMLElement>) => { const html = serializeInline(e.currentTarget); ctx.onEditField?.(b.id, key, html.indexOf("<") === -1 ? (e.currentTarget.textContent || "").trim() : html); }, ...content };
 };
 const txtPlain: EditKit["txtPlain"] = (v, key) => {
  if (!ctx.edit) return { children: v ?? "" };
  return { ...editBase, "data-field": key, onFocus: onFieldFocus(key), onBlur: (e: React.FocusEvent<HTMLElement>) => ctx.onEditField?.(b.id, key, (e.currentTarget.textContent || "").trim()), children: v ?? "" };
 };
 // A repeated list-item field (a testimonial quote, a column heading, a category tile, …) edited straight
 // on the canvas like any other text: click it, type, done. On blur the caller rebuilds the section's items
 // blob — so no one ever hand-edits a "A | B | C" textarea again.
 const txtItem: EditKit["txtItem"] = (v, onCommit) => {
  if (!ctx.edit) return { children: v ?? "" };
  // preventDefault so clicking a card whose text sits INSIDE a link (category tile, blog post) edits the
  // text instead of following the link; stopPropagation so it doesn't also select the whole section.
  return { contentEditable: true as const, suppressContentEditableWarning: true as const, onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }, onBlur: (e: React.FocusEvent<HTMLElement>) => onCommit((e.currentTarget.textContent || "").trim()), children: v ?? "" };
 };

 // A move grip that appears on the selected section's floating content group so it can be dragged
 // anywhere in the section (Canva-style). Grabbing it starts the drag in the parent (which owns the
 // frame rect + snapping).
 const moveGrip = selected && ctx.onContentDragStart ? (
  <button type="button" title="Drag to move" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); ctx.onContentDragStart!(b.id, e); }} onClick={(e) => e.stopPropagation()} className="vya-content-grip absolute -top-3 left-1/2 z-20 -translate-x-1/2 cursor-move touch-none rounded-full border border-white/70 bg-[#5D0F17] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow">move</button>
 ) : null;

 return {
  b, ctx, p, selected, txt, txtPlain, txtItem, moveGrip,
  items: (schema) => readItems(p, schema),
  setItems: (schema, next) => ctx.onEditField?.(b.id, schema.key, writeItems(next, schema)),
 };
}

// An empty-state line for a section whose content the seller hasn't filled in yet. Shown only in the
// editor — a half-built section must never render as a stray placeholder on the live storefront.
export function emptyHint(ctx: Ctx, label: string) {
 return ctx.edit ? <div className="px-6 py-10 text-center text-[11px] uppercase tracking-[0.25em] opacity-40">{label}</div> : null;
}

// Re-exported so layout files import their whole toolkit from one place.
export type { Block, BlockStyle, Overlay, Item, ItemSchema };

// Where a shop-by-category tile actually goes. A label naming one of the store's real collections
// gets that collection's page; anything else — a template-seeded label like "Denim" — filters the
// shop by category, which the shop page already matches tolerantly. On the editor canvas there is
// no store to link into, so tiles fall back to shopHref and stay inert.
export function tileHref(ctx: Ctx, label: string): string {
 const known = ctx.collectionHrefs?.[(label || "").trim().toLowerCase()];
 if (known) return known;
 const cat = (label || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
 if (!cat || !ctx.storeSlug) return ctx.shopHref;
 return `${ctx.shopHref}${ctx.shopHref.includes("?") ? "&" : "?"}category=${encodeURIComponent(cat)}`;
}
