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
import { isPlaceholderImage } from "@/app/lib/storefront-placeholder-image";

export const ff = (name?: string) => (name ? `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

export type BlockProduct = { key?: string; title: string; price: string; image: string; href?: string };
export type Colors = { bg: string; text: string; accent: string };

export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "e" | "w" | "n" | "s";
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
 n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
 s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
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
// bug, not a hint.
//
// Editor: always a frame. An EMPTY slot is one big target — click anywhere in it to pick a file.
// A FILLED slot is not, because a photo you can't touch without the file dialog opening is a photo
// you can't compose with: dragging it pans the crop, and replacing it is the explicit "Replace"
// button that appears on hover. Panning writes `objectPosition` through `onPos`; a slot that doesn't
// pass one simply isn't pannable (thumbnails, gallery tiles) and keeps the Replace button.
export function ImageSlot({ kit, src, alt, onPick, pos, onPos, zoom, ratio = "aspect-[4/3]", className = "", rounded = "vya-round", label = "Photo" }: {
 kit: EditKit; src?: string; alt?: string; onPick: (url: string) => void;
 pos?: string; onPos?: (v: string) => void;
 // Magnification, as a percent (100 = fit the frame as before). Panning alone can only slide a photo
 // that already overflows its frame; a photo whose shape matches the frame has nothing to slide, so
 // "I want THIS part of the picture" was unreachable. Zoom gives the crop something to move within.
 zoom?: string | number;
 ratio?: string; className?: string; rounded?: string; label?: string;
}) {
 const { ctx } = kit;
 const pick = ctx.onPickImage;
 const drop = ctx.onDropImage;
 // Zoom is a transform, not a change of object-fit, so it composes with the focal point instead of
 // fighting it: scaling about `objectPosition` means the spot you panned to is the spot you magnify.
 // Everything below 101% renders exactly as it did before this existed.
 const zoomPct = Math.min(400, Math.max(100, Number(zoom) || 100));
 const zoomStyle: React.CSSProperties = zoomPct > 100 ? { transform: `scale(${zoomPct / 100})`, transformOrigin: pos || "50% 50%" } : {};
 // Drag feedback is applied to the node directly rather than held in state: this file is hook-free on
 // purpose (see the header) so the very same components render the live storefront as a server
 // component. A useState here would break that, and only the editor ever sees this highlight anyway.
 const ring = "ring-2 ring-[#5D0F17]";
 if (!ctx.edit) {
  return src ? <div className={`${rounded} ${ratio} w-full overflow-hidden ${className}`} style={{ background: `${ctx.fg}0d` }}><img src={src} alt={alt || ""} loading="lazy" className="h-full w-full object-cover" style={{ ...(pos ? { objectPosition: pos } : {}), ...zoomStyle }} /></div> : null;
 }
 const open = pick ? (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); pick(onPick); } : undefined;
 // Pan the crop by dragging the photo. Hook-free like the rest of this file (it also renders on the
 // server): the drag writes straight to the node's style for feedback and commits the final value
 // once, on release — so an in-flight drag never round-trips through React.
 const pannable = !!(src && onPos);
 const startPan = pannable ? (e: React.PointerEvent) => {
  if (e.button !== 0) return;
  const frame = e.currentTarget as HTMLElement;
  const img = frame.querySelector("img");
  if (!img) return;
  e.preventDefault(); e.stopPropagation();
  const box = frame.getBoundingClientRect();
  const m = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(pos || "");
  const sx = m ? parseFloat(m[1]) : 50, sy = m ? parseFloat(m[2]) : 50;
  const x0 = e.clientX, y0 = e.clientY;
  let nx = sx, ny = sy, moved = false;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const move = (ev: PointerEvent) => {
   const dx = ev.clientX - x0, dy = ev.clientY - y0;
   if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
   moved = true;
   frame.style.cursor = "grabbing";
   // Drag right and the picture should follow your finger, which means revealing what is to its
   // LEFT — object-position counts the other way, so the delta is subtracted.
   nx = clamp(sx - (dx / Math.max(1, box.width)) * 100);
   ny = clamp(sy - (dy / Math.max(1, box.height)) * 100);
   img.style.objectPosition = `${nx}% ${ny}%`;
  };
  const up = () => {
   window.removeEventListener("pointermove", move);
   window.removeEventListener("pointerup", up);
   frame.style.cursor = "";
   if (moved) onPos!(`${Math.round(nx)}% ${Math.round(ny)}%`);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
 } : undefined;
 return (
  <div
   role={open && !src ? "button" : undefined}
   tabIndex={open && !src ? 0 : undefined}
   onClick={src ? undefined : open}
   onPointerDown={startPan}
   onKeyDown={open && !src ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); pick!(onPick); } } : undefined}
   onDragOver={drop ? (e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add(...ring.split(" ")); } : undefined}
   onDragLeave={drop ? (e) => e.currentTarget.classList.remove(...ring.split(" ")) : undefined}
   onDrop={drop ? (e) => {
    const f = e.dataTransfer.files?.[0];
    e.currentTarget.classList.remove(...ring.split(" "));
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    drop(f, onPick);
   } : undefined}
   title={src ? (pannable ? "Drag to reposition · Replace to change the photo" : undefined) : open ? "Click or drop a photo" : undefined}
   className={`vya-slot group/slot relative ${rounded} ${ratio} w-full overflow-hidden ${src ? (pannable ? "cursor-grab" : "") : open ? "cursor-pointer" : ""} ${className} ${src ? "" : "grid place-items-center border border-dashed"}`}
   style={src ? { background: `${ctx.fg}0d` } : { borderColor: `${ctx.fg}33`, background: `${ctx.fg}08` }}
  >
   {src
    ? <img src={src} alt={alt || ""} loading="lazy" draggable={false} className="h-full w-full select-none object-cover" style={{ ...(pos ? { objectPosition: pos } : {}), ...zoomStyle }} />
    : <span className="text-[10px] uppercase tracking-[0.2em] opacity-40">{open ? `Add ${label.toLowerCase()}` : label}</span>}
   {/* A PLACEHOLDER is ours, not the seller's — so it says so, permanently rather than on hover, and
       greys back so it reads as scaffolding rather than as a design decision someone made. Editor
       only: on the live storefront it renders as a plain picture, which is the point of having one. */}
   {src && open && isPlaceholderImage(src) && (
    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/45">
     <span className="rounded-full bg-black/70 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Replace with your image</span>
    </span>
   )}
   {src && open && !isPlaceholderImage(src) && (
    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 opacity-0 transition-opacity group-hover/slot:opacity-100">
     <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={open}
      className="pointer-events-auto rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-800 transition hover:bg-white"
     >Replace</button>
     {pannable && <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/80">Drag to reposition</span>}
    </span>
   )}
   {src && open && isPlaceholderImage(src) && (
    <span className="absolute inset-0 flex items-end justify-center pb-3 opacity-0 transition-opacity group-hover/slot:opacity-100">
     <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={open}
      className="pointer-events-auto rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-800 transition hover:bg-white"
     >Add your photo</button>
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
  //
  // BUTTONS ARE EXEMPT. A button resizes by corner-drag (fontPx scales the whole pill), never by
  // side-width — a percentage width squeezes the pill narrower than its label, and with the wide
  // letter-spacing the label then stacks vertically ("SHOP / THE / EDIT"). So a button never takes
  // fr.w, and always stays on one line. It hugs its label, full stop.
  ...(fr?.w && !positioned && tag !== "a" ? { width: `${fr.w}%`, maxWidth: "none" } : {}),
  ...(fr?.w && positioned && tag !== "a" ? { width: "100%" } : {}),
  ...(tag === "a" ? { whiteSpace: "nowrap" as const } : {}),
 };
 const posStyle: React.CSSProperties | undefined = positioned
  ? { position: "absolute", left: `${fr!.x}%`, top: `${fr!.y}%`, transform: "translate(-50%,-50%)", ...(tag === "a" ? { maxWidth: "none" } : fr!.w ? { width: `${fr!.w}%`, maxWidth: "none" } : { maxWidth: "min(90%,46rem)" }) }
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

 // The selection ring is drawn on the WRAPPER, so the wrapper has to BE the field's box — otherwise
 // the ring frames one thing and the merchant sees the text somewhere else inside it.
 //
 // TWO families of class decide that box: flow margins (a button's mt-9 gap from the subtext) and,
 // just as much, the field's measure and placement — `max-w-3xl mx-auto` on a hero heading. Only the
 // margins used to move. The width cap stayed on the element while the wrapper ran full width, so a
 // centred hero heading drew a full-width ring around a 768px box pinned to its LEFT, with the text
 // centred inside THAT — landing left of the page's centre and looking, in the merchant's words,
 // "kind of left-aligned but not fully". Moving `mx-auto` up couldn't fix it either: auto margins on
 // a full-width block are a no-op.
 //
 // The live storefront was never wrong, which is the tell — live renders no wrapper (see the branch
 // above) and keeps every class on the element. Moving the width cap up too makes the wrapper the
 // real box, and makes the editor agree with the site it is previewing.
 const boxCls = (className.match(/(?:^|\s)(!?-?m[trblxy]?-[^\s]+|max-w-[^\s]+)/g) || []).map((s) => s.trim()).join(" ");
 const innerClassName = className.replace(/(?:^|\s)(?:!?-?m[trblxy]?-[^\s]+|max-w-[^\s]+)/g, " ").replace(/\s+/g, " ").trim();

 // A SIDE-handle drag sizes the box and rewraps the text inside it (one long line becomes three, or
 // three become one) — the Figma gesture. In the editor that width therefore belongs on the wrapper,
 // with the element filling it; `maxWidth:none` so dragging WIDER than the layout's own measure isn't
 // silently ignored by the very max-w that measure came from.
 const sizedBox = fr?.w != null && !positioned && tag !== "a";
 const boxStyle: React.CSSProperties | undefined = positioned ? posStyle : sizedBox ? { width: `${fr!.w}%`, maxWidth: "none" } : undefined;
 const innerStyle: React.CSSProperties = sizedBox ? { ...merged, width: "100%", maxWidth: "none" } : merged;

 // Live storefront (or no editor wired): a plain element, positioned if it has x/y.
 if (!ctx.edit || !fe) {
  const node = <El className={className} data-field={fieldKey} style={merged} {...(tag === "a" ? { href } : {})} {...htmlContent} />;
  // `vya-free-pos` on the LIVE wrapper too, not just the editor's. The narrow-screen rule that
  // re-centres a dragged field is keyed to it, and the published storefront is the surface that
  // actually matters — a rule that only matched in the studio would leave every real phone with the
  // headline jammed against the left margin while the editor looked perfect.
  return positioned ? <>{spacer}<div className="vya-free-el vya-free-pos" style={posStyle}>{node}</div></> : node;
 }
 const selected = ctx.selectedId === b.id && fe.selectedKey === fieldKey;
 const editing = ctx.selectedId === b.id && fe.editingKey === fieldKey;
 const textNode = editing
  ? <El className={innerClassName} data-field={fieldKey} style={innerStyle} contentEditable suppressContentEditableWarning
     ref={(el: HTMLElement | null) => { if (el && document.activeElement !== el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } }}
     onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
     onBlur={(e: React.FocusEvent<HTMLElement>) => { const html = serializeInline(e.currentTarget); fe.onText(b.id, fieldKey, html.indexOf("<") === -1 ? (e.currentTarget.textContent || "").trim() : html); }}
     {...htmlContent} />
  : <El className={innerClassName} data-field={fieldKey} style={innerStyle} {...htmlContent} />;
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
   // boxCls moves the field's flow margin AND its measure onto the wrapper (not positioned ones —
   // those are absolute and margin would nudge them) so the ring IS the box being edited.
   className={`vya-free touch-none ${positioned ? "vya-free-pos inline-flex" : `${boxCls} ${fullWidth ? "relative flex w-full" : tag === "a" ? "relative inline-flex" : "relative block"}`} ${editing ? "cursor-text" : "cursor-move"} ${selected ? "shadow-[0_0_0_2px_#5D0F17]" : "hover:shadow-[0_0_0_2px_rgba(93,15,23,0.5)]"}`}
   // In the editor THIS is the field's box, so the alignment CSS has to be able to place it: the
   // element inside now fills the wrapper, where auto margins would have nothing left to do.
   data-field-box={fieldKey}
   style={boxStyle}
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

/**
 * A section's PHOTO as a first-class object — the counterpart to FreeField.
 *
 * A photo used to be whatever hole the layout left for it: you could pan the crop inside that hole
 * and nothing else. Not move it, not resize it, not delete it without hunting through a dropdown. So
 * a photo gets the same contract the text already has — select it, drag it anywhere in the section,
 * pull a corner to resize it, press ⌫ to remove it.
 *
 * It reuses `style.free.image` and the studio's existing free-transform handlers rather than growing
 * a parallel mechanism: x/y position it (centre-anchored, % of the SECTION), w/h size it.
 *
 * Two drags, deliberately kept apart, because they mean different things and both are wanted:
 *   • dragging the PHOTO pans the crop (which part of the picture shows) — as it always has,
 *   • dragging the MOVE grip moves the frame (where the picture sits).
 * Corner and side handles resize the frame. Untouched, it renders exactly as the layout laid it out,
 * so every storefront saved before this looks identical.
 */
export function PhotoFrame({ kit, className = "", style, children }: {
 kit: EditKit; className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
 const { b, ctx } = kit;
 const key = "image";
 const fr = b.style?.free?.[key];
 const fe = ctx.freeEdit;
 const positioned = fr?.x != null && fr?.y != null;
 // "Framed" = the merchant has moved or resized this photo. Only those need the mobile fallback; an
 // untouched photo keeps rendering exactly as its layout draws it, at every width.
 const framed = positioned || fr?.w != null || fr?.h != null;
 const boxStyle: React.CSSProperties = {
  ...(style || {}),
  ...(positioned ? { position: "absolute", left: `${fr!.x}%`, top: `${fr!.y}%`, transform: "translate(-50%,-50%)" } : {}),
  ...(fr?.w != null ? { width: `${fr.w}%`, maxWidth: "none", flex: "none" } : {}),
  // Height comes from an ASPECT RATIO, never a percentage.
  //
  // `height: 50%` looks right and is a trap: a percentage height resolves against the parent's
  // height, and when that parent's height is itself content-driven (a hero-stack strip inside a
  // flex column) the percentage computes to `auto`. The frame's only child is absolutely positioned,
  // so `auto` measured zero — the box collapsed and the photo VANISHED the moment it was made
  // smaller. An aspect ratio needs no parent height at all: width is definite, so height is too.
  // It also stays correct on a phone, where a fixed height would not.
  ...(fr?.h != null ? { aspectRatio: `100 / ${fr.h}`, height: "auto", minHeight: 0, flex: "none" } : {}),
 };
 // Free positioning takes the frame OUT of flow, which means the space it occupied disappears and
 // everything below slides up — on a hero that reads as "half the section vanished". This invisible
 // stand-in holds the slot open, so moving the photo moves exactly the photo. Same device FreeField
 // uses for a dragged heading, and the reason a section keeps its shape while you rearrange it.
 const spacer = positioned ? <div aria-hidden="true" className={`vya-free-spacer invisible ${className}`} style={{ ...(style || {}) }} /> : null;
 // The classes go on the LIVE element too, not just the editor's. The mobile fallback keyed to
 // `.vya-photo-framed` is for the published storefront above all — a shopper on a phone is the whole
 // reason it exists, and rendering it only in the studio would mean the editor looked fine while the
 // real site overlapped.
 const cls = `vya-photo ${framed ? "vya-photo-framed" : ""} ${className}`;
 // Same contract as ImageSlot, for the full-bleed photos that aren't slots — a hero's picture, a
 // split's panel. Without it those would be the one place a placeholder looked like a real choice.
 const note = isPlaceholderImage(b.props?.image) ? (
  <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/45">
   <span className="rounded-full bg-black/70 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Replace with your image</span>
  </span>
 ) : null;
 if (!ctx.edit || !fe) return <>{spacer}<div className={cls} style={boxStyle}>{children}</div></>;
 const selected = ctx.selectedId === b.id && fe.selectedKey === key;
 // All eight. Sides crop the width, TOP AND BOTTOM crop the height, corners do both — the top edge
 // should pull in exactly the way the sides already do, and there is no reason for it to be the one
 // edge that can't. (It was dropped for a round because it sat where the move grip sat and stole its
 // clicks; the grip has moved to the middle instead, where no handle can ever reach it.)
 const handles: ResizeHandle[] = ["nw", "ne", "sw", "se", "w", "e", "n", "s"];
 // A small dark dot disappears against a dark photo. White fill with a coloured ring reads on any
 // picture, and each handle is a generous invisible hit box with the visible pill centred inside it.
 const vert = (hd: ResizeHandle) => hd === "n" || hd === "s";
 const horz = (hd: ResizeHandle) => hd === "w" || hd === "e";
 const hit = (hd: ResizeHandle) => vert(hd) ? "h-7 w-20" : horz(hd) ? "h-20 w-7" : "h-8 w-8";
 const pill = (hd: ResizeHandle) => vert(hd) ? "h-2 w-12 rounded-full" : horz(hd) ? "h-12 w-2 rounded-full" : "h-3.5 w-3.5 rounded-full";
 return (
  <>
  {spacer}
  <div
   className={`vya-photo group/photo ${framed ? "vya-photo-framed" : ""} ${className} ${selected ? "shadow-[0_0_0_2px_#5D0F17]" : "hover:shadow-[0_0_0_2px_rgba(93,15,23,0.5)]"}`}
   data-field-box={key}
   style={boxStyle}
   onClick={(e) => { e.preventDefault(); e.stopPropagation(); fe.onSelect(b.id, key); }}
  >
   {children}
   {note}
   {/* Nobody guesses that dragging a photo pans the crop. On hover the picture says so itself —
       and names the other gesture too, so the difference between "move the frame" and "move the
       picture inside the frame" is legible without anyone having to be told. Pointer-events off, so
       the hint can never eat the drag it is describing. */}
   <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-9 opacity-0 transition-opacity group-hover/photo:opacity-100">
    <span className="rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white backdrop-blur">Drag the photo to reposition it</span>
   </span>
   {selected && (
    <button
     type="button"
     title="Drag to move the photo's frame"
     onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); fe.onDragStart(b.id, key, e); }}
     onClick={(e) => e.stopPropagation()}
     // Dead centre. Every edge and corner belongs to a resize handle, so the middle is the only place
     // a grip can live without something else claiming its clicks — and it's the easiest thing on the
     // frame to hit, which matters most for the gesture people reach for first.
     className="absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 cursor-move touch-none items-center gap-1.5 rounded-full border border-white/70 bg-[#5D0F17] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg"
    >
     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
     Move frame
    </button>
   )}
   {selected && handles.map((hd) => (
    <span
     key={hd}
     onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); fe.onResizeStart(b.id, key, hd, e); }}
     className={`absolute z-30 grid touch-none place-items-center ${hit(hd)} ${HANDLE_POS[hd]}`}
    >
     <span className={`pointer-events-none border-2 border-[#5D0F17] bg-white shadow-md ${pill(hd)}`} />
    </span>
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

// Where a shop-by-category tile actually goes, in order:
//   1. an explicit link the seller set on the tile (t.href) — a specific collection or any page,
//   2. else a label that names one of the store's real collections → that collection's page,
//   3. else the label as a shop category filter, which the shop page matches tolerantly.
// Accepts the whole tile (for its href) or a bare label string, so older call sites still work.
// On the editor canvas there's no store to link into, so tiles fall back to shopHref and stay inert.
export function tileHref(ctx: Ctx, tileOrLabel: string | { label?: string; href?: string }): string {
 const tile = typeof tileOrLabel === "string" ? { label: tileOrLabel } : tileOrLabel;
 const label = tile.label || "";
 const href = (tile.href || "").trim();
 // An explicit link wins. Same safety shape as elsewhere: only same-origin paths or http(s).
 if (href && /^(https?:\/\/|\/)/i.test(href)) return href;
 const known = ctx.collectionHrefs?.[label.trim().toLowerCase()];
 if (known) return known;
 const cat = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
 if (!cat || !ctx.storeSlug) return ctx.shopHref;
 return `${ctx.shopHref}${ctx.shopHref.includes("?") ? "&" : "?"}category=${encodeURIComponent(cat)}`;
}

// ── Background-image panning ──────────────────────────────────────────────────────────────────────
// A hero/split photo is a full-bleed background with the text laid OVER it, so it can't be an
// ImageSlot (that's for framed, standalone images). This gives any such <img> the same "drag to
// reposition" feel: it reads the stored focal point and, in the editor, lets you drag the exposed
// image to pan the crop — writing objectPosition back as `imagePos`. Hook-free like the rest of this
// file so it also renders on the server. Spread onto the <img>: <img {...panBgImg(ctx, b)} … />.
// Takes the two fields it actually reads rather than a whole Ctx, so the SECTION renderer in
// Blocks.tsx (which has `edit`/`onEditField` in hand but never builds a Ctx of its own) can give a
// full-bleed section background the identical drag-to-pan behaviour. A Ctx still satisfies it.
export function panBgImg(ctx: { edit?: boolean; onEditField?: (id: string, key: string, value: string) => void }, b: Block, posKey = "imagePos", zoomKey = "imageZoom"): {
 style?: React.CSSProperties; onPointerDown?: (e: React.PointerEvent) => void; className?: string; draggable?: boolean;
} {
 const pos = b.props?.[posKey];
 // Same zoom contract as ImageSlot: scale about the focal point the pan already stores.
 const z = Math.min(400, Math.max(100, Number(b.props?.[zoomKey]) || 100));
 const style: React.CSSProperties | undefined = (pos || z > 100)
  ? { ...(pos ? { objectPosition: pos } : {}), ...(z > 100 ? { transform: `scale(${z / 100})`, transformOrigin: pos || "50% 50%" } : {}) }
  : undefined;
 if (!ctx.edit || !ctx.onEditField) return { style };
 const onPointerDown = (e: React.PointerEvent) => {
  if (e.button !== 0) return;
  const img = e.currentTarget as HTMLElement;
  const box = img.getBoundingClientRect();
  if (!box.width || !box.height) return;
  e.preventDefault(); e.stopPropagation();
  const m = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(pos || "");
  const sx = m ? parseFloat(m[1]) : 50, sy = m ? parseFloat(m[2]) : 50;
  const x0 = e.clientX, y0 = e.clientY;
  let nx = sx, ny = sy, moved = false;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const move = (ev: PointerEvent) => {
   const dx = ev.clientX - x0, dy = ev.clientY - y0;
   if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
   moved = true; img.style.cursor = "grabbing";
   nx = clamp(sx - (dx / box.width) * 100);
   ny = clamp(sy - (dy / box.height) * 100);
   img.style.objectPosition = `${nx}% ${ny}%`;
  };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); img.style.cursor = ""; if (moved) ctx.onEditField!(b.id, posKey, `${Math.round(nx)}% ${Math.round(ny)}%`); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
 };
 return { style, onPointerDown, className: "cursor-grab touch-none", draggable: false };
}
