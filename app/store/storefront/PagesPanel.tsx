"use client";

// The Pages rail: her site's pages, in the order her menu shows them.
//
// Shaped like Shopify's navigation and pages screens put together, because that is the mental model
// she already has: the menu at the top, in menu order, reorderable — then the pages that exist but are
// not in it. Per row: open it, rename it, take it in or out of the menu, hide it.
//
// Hiding is the reversible one and the default: shoppers get "Page not found" and the menu links go,
// but the page is untouched and Show brings it straight back. Deleting for good is a second,
// confirmed choice — the same rule Step 2 settled on for sections.
//
// REORDERING IS NOT A DRAG-ONLY FEATURE. This started on the browser's own drag-and-drop
// (draggable + dragstart/drop), and on a trackpad it frequently refused to start at all — the owner
// reported the rows simply would not move. So: pointer events, which behave the same for a mouse, a
// trackpad and a finger, plus ▲▼ on every row, which always work and are reachable by keyboard.
//
// Row lives OUTSIDE this component on purpose. Declared inside, it is a new component type on every
// render, so React throws every row away and rebuilds it whenever any state changes — which drops the
// pointer capture the drag depends on the instant the drag sets state, and the row never moves.
import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Pencil, Plus, ExternalLink, Lock } from "lucide-react";

export type PageEntryView = {
 path: string; label: string; title: string | null; navLabel: string | null;
 hidden: boolean; kind: "captured" | "added"; group: "menu" | "collections" | "other" | "unlinked" | "product";
 inMenu: boolean; canHide: boolean; refusal: string | null;
 /** How many links on her navigation pages still point here — the warning before she hides it. */
 linkedFrom?: number;
};

const GROUPS: { id: PageEntryView["group"]; title: string; note?: string }[] = [
 { id: "menu", title: "In your menu", note: "This is the order shoppers see, on desktop and on a phone. Use ▲▼, or drag a row by its handle." },
 { id: "collections", title: "Collections" },
 { id: "other", title: "Other pages" },
 { id: "unlinked", title: "Not linked", note: "These came over fine, but nothing on your site links to them." },
 { id: "product", title: "Product page" },
];

type RowProps = {
 p: PageEntryView;
 idx: number;
 list: PageEntryView[];
 selPath: string;
 busy: boolean;
 dragPath: string | null;
 overPath: string | null;
 setDragPath: (v: string | null) => void;
 setOverPath: (v: string | null) => void;
 onOpen: (path: string) => void;
 onRename: (page: PageEntryView) => void;
 onToggleHidden: (page: PageEntryView) => void;
 onToggleMenu: (page: PageEntryView) => void;
 onReorder: (from: string, to: string) => void;
};

function Row({ p, idx, list, selPath, busy, dragPath, overPath, setDragPath, setOverPath, onOpen, onRename, onToggleHidden, onToggleMenu, onReorder }: RowProps) {
 const inMenuGroup = p.group === "menu";
 const move = (delta: -1 | 1) => { const other = list[idx + delta]; if (other) onReorder(p.path, other.path); };
 return (
  <div
   data-menu-row={inMenuGroup ? p.path : undefined}
   className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition ${selPath === p.path ? "border-[#5D0F17] bg-[#5D0F17]/[0.04]" : "border-black/10 bg-white hover:border-black/25"} ${p.hidden ? "opacity-60" : ""} ${dragPath === p.path ? "opacity-50" : ""} ${overPath === p.path ? "ring-2 ring-[#5D0F17]/40" : ""}`}
  >
   {inMenuGroup && (
    <>
     {/* Pointer events, not HTML5 drag: a trackpad press-and-move (and a finger) both work, and
         `touch-none` stops the panel scrolling underneath the drag instead of moving the row. */}
     <span
      title="Drag to reorder"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragPath(p.path); setOverPath(null); }}
      onPointerMove={(e) => {
       if (!dragPath) return;
       const under = e.currentTarget.ownerDocument.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
       const row = under?.closest("[data-menu-row]")?.getAttribute("data-menu-row") || null;
       setOverPath(row && row !== dragPath ? row : null);
      }}
      onPointerUp={() => { if (dragPath && overPath && dragPath !== overPath) onReorder(dragPath, overPath); setDragPath(null); setOverPath(null); }}
      onPointerCancel={() => { setDragPath(null); setOverPath(null); }}
      className="shrink-0 cursor-grab touch-none text-stone-300 transition hover:text-stone-500 active:cursor-grabbing"
     >
      <GripVertical size={13} />
     </span>
     {/* Always available, and the only way that works from a keyboard. */}
     <span className="flex shrink-0 flex-col">
      {([["up", -1 as const, ChevronUp], ["down", 1 as const, ChevronDown]] as const).map(([name, delta, Icon]) => (
       <button
        key={name}
        type="button"
        onClick={() => move(delta)}
        disabled={busy || !list[idx + delta]}
        title={`Move ${name}`}
        aria-label={`Move ${p.label} ${name}`}
        className="rounded p-0.5 text-stone-400 transition hover:bg-stone-100 hover:text-[#5D0F17] disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-stone-400"
       >
        <Icon size={11} />
       </button>
      ))}
     </span>
    </>
   )}
   <button type="button" onClick={() => onOpen(p.path)} className="min-w-0 flex-1 text-left">
    <span className={`block truncate text-[13px] ${selPath === p.path ? "font-semibold text-[#5D0F17]" : "text-stone-700"}`}>{p.label}</span>
    <span className="block truncate text-[10.5px] text-stone-400">
     {p.path}
     {p.kind === "added" ? " · added by you" : ""}
     {p.hidden ? " · hidden from shoppers" : ""}
    </span>
   </button>
   {p.refusal ? (
    <span title={p.refusal} className="shrink-0 p-1 text-stone-300"><Lock size={12} /></span>
   ) : (
    <>
     <button type="button" onClick={() => onRename(p)} title="Rename this page" aria-label={`Rename ${p.label}`}
      className="shrink-0 rounded-md p-1 text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-[#5D0F17] focus:opacity-100 group-hover:opacity-100"><Pencil size={13} /></button>
     <button type="button" onClick={() => onToggleMenu(p)} title={p.inMenu ? "Take out of the menu" : "Add to the menu"} aria-label={p.inMenu ? `Take ${p.label} out of the menu` : `Add ${p.label} to the menu`}
      className={`shrink-0 rounded-md p-1 text-[10px] font-semibold uppercase tracking-wide transition hover:bg-stone-100 ${p.inMenu ? "text-[#5D0F17]" : "text-stone-400 opacity-0 focus:opacity-100 group-hover:opacity-100"}`}>menu</button>
     <button type="button" onClick={() => onToggleHidden(p)} title={p.hidden ? "Show to shoppers" : "Hide from shoppers"} aria-label={p.hidden ? `Show ${p.label}` : `Hide ${p.label}`}
      className="shrink-0 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-[#5D0F17]">{p.hidden ? <Eye size={13} /> : <EyeOff size={13} />}</button>
    </>
   )}
  </div>
 );
}

export default function PagesPanel(props: {
 pages: PageEntryView[];
 ready: boolean;
 busy: boolean;
 note: string | null;
 drifted: boolean;
 selPath: string;
 onOpen: (path: string) => void;
 onRename: (page: PageEntryView) => void;
 onToggleHidden: (page: PageEntryView) => void;
 onToggleMenu: (page: PageEntryView) => void;
 onReorder: (from: string, to: string) => void;
 onAdd: () => void;
 dragRef: { current: string | null };
}) {
 const { pages } = props;
 // The row being dragged, and the row the pointer is over — the one it will change places with.
 const [dragPath, setDragPath] = useState<string | null>(null);
 const [overPath, setOverPath] = useState<string | null>(null);

 return (
  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
   <div className="mb-1 flex items-center justify-between">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Pages</p>
    <button type="button" onClick={props.onAdd} disabled={props.busy || !props.ready}
     className="flex items-center gap-1 rounded-lg bg-[#5D0F17] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-[#4a0c12] disabled:opacity-50">
     <Plus size={13} /> Add page
    </button>
   </div>
   <p className="mb-3 text-[12px] leading-snug text-stone-400">
    Your menu order is what shoppers see. Renaming changes the page&rsquo;s name and its menu label — never its web address, so no link anyone has ever breaks.
   </p>

   {!props.ready && (
    <p className="mb-3 rounded-lg border border-[#5D0F17]/25 bg-white px-3 py-2 text-[11.5px] leading-relaxed text-[#5D0F17]">
     Page settings aren&rsquo;t switched on for this site yet, so renaming, hiding and adding pages are unavailable. Your pages are all still listed below.
    </p>
   )}
   {props.drifted && (
    <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
     Your menu changed since you last arranged it, so we&rsquo;re showing the one on your site now. Move anything to save a new order.
    </p>
   )}
   {props.note && <p className="mb-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-[11.5px] leading-relaxed text-stone-600">{props.note}</p>}

   {GROUPS.map((g) => {
    const rows = pages.filter((p) => p.group === g.id);
    if (!rows.length) return null;
    return (
     <div key={g.id} className="mb-4">
      <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
       <span>{g.title}</span><span className="font-normal text-stone-300">{rows.length}</span>
      </p>
      {g.note && <p className="mb-2 text-[11px] leading-snug text-stone-400">{g.note}</p>}
      <div className="space-y-1.5">
       {rows.map((p, i) => (
        <Row
         key={p.path}
         p={p} idx={i} list={rows}
         selPath={props.selPath} busy={props.busy}
         dragPath={dragPath} overPath={overPath} setDragPath={setDragPath} setOverPath={setOverPath}
         onOpen={props.onOpen} onRename={props.onRename} onToggleHidden={props.onToggleHidden} onToggleMenu={props.onToggleMenu} onReorder={props.onReorder}
        />
       ))}
      </div>
     </div>
    );
   })}

   {!pages.length && <p className="text-[12px] text-stone-400">No pages yet.</p>}
   <p className="mt-4 flex items-center gap-1 text-[11px] text-stone-400"><ExternalLink size={11} /> A hidden page still opens here, so you can keep working on it.</p>
  </div>
 );
}
