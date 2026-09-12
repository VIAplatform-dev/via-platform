"use client";

// The Grid panel: settings for a product grid she added to her imported site.
//
// Every change is sent to the page at once ({vya:"gridset"}), which re-renders the grid from live
// inventory in her theme's card — so what she sees is what a shopper gets. Bounds come from the one
// definition the save and the shopper's page also use (app/lib/site-builder/grid-config.ts).
import { Minus, Plus, RotateCw, Trash2 } from "lucide-react";
import { GRID_BOUNDS, type GridConfig, type GridRatio, type GridCard } from "@/app/lib/site-builder/grid-config";

export type GridCollection = { slug: string; title: string; itemCount: number };

const RATIOS: [GridRatio, string][] = [["theme", "Theme"], ["portrait", "Portrait"], ["square", "Square"], ["landscape", "Landscape"]];
const CARDS: [GridCard, string][] = [["theme", "Theme card"], ["simple", "Simple"]];

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
 return (
  <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-lg border border-black/10 bg-white">
   {options.map(([v, text]) => (
    <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
     className={`flex-1 px-2 py-1.5 text-[12px] font-medium transition ${value === v ? "bg-[#5D0F17] text-white" : "text-stone-600 hover:bg-stone-100"}`}>
     {text}
    </button>
   ))}
  </div>
 );
}

export default function GridPanel(props: {
 config: GridConfig;
 kit: "theme" | "simple" | null;
 empty: boolean;
 collections: GridCollection[] | null;
 refreshing: boolean;
 refreshNote: string | null;
 onChange: (next: GridConfig) => void;
 onRefresh: () => void;
 onDone: () => void;
 onDelete: () => void;
 piece: { title: string } | null;
 piecePanel?: React.ReactNode;
}) {
 const { config: c, onChange } = props;
 const set = (patch: Partial<GridConfig>) => onChange({ ...c, ...patch });
 const known = props.collections?.some((x) => x.slug === c.collection) ?? false;
 const cols = Array.from({ length: GRID_BOUNDS.cols.max }, (_, i) => i + 1).map((n) => [n, String(n)] as [number, string]);
 const mcols = Array.from({ length: GRID_BOUNDS.mcols.max }, (_, i) => i + 1).map((n) => [n, String(n)] as [number, string]);
 return (
  <>
   <div className="mb-3 flex items-center justify-between">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Product grid</p>
    <button type="button" onClick={props.onDone} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#5D0F17] hover:bg-[#5D0F17]/[0.06]">Done</button>
   </div>
   <p className="mb-4 text-[12px] leading-snug text-stone-500">Live pieces from your Inventory, in your site&rsquo;s own product card. When a piece sells or changes, this grid changes with it.</p>

   {props.piece && props.piecePanel && <div className="mb-4">{props.piecePanel}</div>}

   <div className="space-y-4">
    <label className="block">
     <span className="mb-1 block text-[12px] font-medium text-stone-600">Collection</span>
     <select value={c.collection} onChange={(e) => set({ collection: e.target.value })} aria-label="Collection"
      className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#5D0F17]/50">
      <option value="all">All pieces</option>
      {!known && c.collection !== "all" && <option value={c.collection}>{c.collection}</option>}
      {(props.collections || []).map((col) => <option key={col.slug} value={col.slug}>{col.title} ({col.itemCount})</option>)}
     </select>
    </label>
    {props.empty && <p className="-mt-2 text-[11.5px] leading-snug text-amber-700">No pieces in this collection yet — shoppers won&rsquo;t see this grid until it has some.</p>}

    <div>
     <span className="mb-1 block text-[12px] font-medium text-stone-600">How many</span>
     <div className="flex w-fit items-center overflow-hidden rounded-lg border border-black/10 bg-white">
      <button type="button" aria-label="Fewer" disabled={c.count <= GRID_BOUNDS.count.min} onClick={() => set({ count: c.count - 1 })} className="grid h-8 w-9 place-items-center text-stone-500 transition hover:bg-stone-100 disabled:opacity-40"><Minus size={14} /></button>
      <span aria-live="polite" className="w-10 text-center text-[13px] font-semibold tabular-nums text-stone-800">{c.count}</span>
      <button type="button" aria-label="More" disabled={c.count >= GRID_BOUNDS.count.max} onClick={() => set({ count: c.count + 1 })} className="grid h-8 w-9 place-items-center text-stone-500 transition hover:bg-stone-100 disabled:opacity-40"><Plus size={14} /></button>
     </div>
    </div>

    <div>
     <span className="mb-1 block text-[12px] font-medium text-stone-600">Desktop columns</span>
     <Segmented label="Desktop columns" value={c.cols} options={cols} onChange={(v) => set({ cols: v })} />
    </div>
    <div>
     <span className="mb-1 block text-[12px] font-medium text-stone-600">Mobile columns</span>
     <Segmented label="Mobile columns" value={c.mcols} options={mcols} onChange={(v) => set({ mcols: v })} />
    </div>
    <div>
     <span className="mb-1 block text-[12px] font-medium text-stone-600">Image shape</span>
     <Segmented label="Image shape" value={c.ratio} options={RATIOS} onChange={(v) => set({ ratio: v })} />
    </div>
    <div>
     <span className="mb-1 block text-[12px] font-medium text-stone-600">Card style</span>
     <Segmented label="Card style" value={c.card} options={CARDS} onChange={(v) => set({ card: v })} />
     {c.card === "theme" && props.kit === "simple" && (
      <p className="mt-1.5 text-[11.5px] leading-snug text-stone-400">Your site&rsquo;s own card couldn&rsquo;t be read from its collection pages, so this grid uses the simple card.</p>
     )}
    </div>

    <p className="text-[11.5px] leading-snug text-stone-400">Sold pieces show the way this collection is set to on your site.</p>

    <div className="flex items-center justify-between border-t border-black/10 pt-3">
     <button type="button" onClick={props.onRefresh} disabled={props.refreshing} className="flex items-center gap-1.5 text-[12px] text-stone-500 underline underline-offset-2 hover:text-[#5D0F17] disabled:opacity-50">
      <RotateCw size={12} className={props.refreshing ? "animate-spin" : ""} /> Refresh card look
     </button>
     <button type="button" onClick={props.onDelete} className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">
      <Trash2 size={13} /> Remove grid
     </button>
    </div>
    {props.refreshNote && <p className="text-[11.5px] text-stone-500">{props.refreshNote}</p>}
   </div>
  </>
 );
}
