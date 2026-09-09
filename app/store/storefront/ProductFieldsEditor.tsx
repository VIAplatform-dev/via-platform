"use client";
// What each piece's page SAYS, and in what order.
//
// Shared by the two editors, because it is one setting: the block builder's Design → Product details
// and the imported-site editor's Design tab both write the same `theme.productPage`. It lived only in
// the studio, which a seller who brought her own site across never sees — so the one place to decide
// whether her pages print an era, a material or a condition was behind a door she had no key to.
import { GripVertical } from "lucide-react";
import { canChip, FIELD_CATALOGUE, type ProductField, type ProductFieldKey, type FieldMode, type ProductFacts } from "@/app/lib/storefront-product-page";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type ProductFieldsEditorProps = {
 fields: ProductField[];
 /** Change one field: shown or not, how it is printed, what it is called. */
 onSet: (key: ProductFieldKey, patch: Partial<ProductField>) => void;
 onMove: (from: number, to: number) => void;
 /** A real listing of hers, so "switched it on and nothing happened" can be answered in place. */
 sample?: { title: string; facts?: ProductFacts | null } | null;
};

export function ProductFieldsEditor({ fields, onSet, onMove, sample }: ProductFieldsEditorProps) {
 return (
  <div className="space-y-1.5">
   {fields.map((f, i) => {
    const cat = FIELD_CATALOGUE.find((c) => c.key === f.key);
    const empty = !!(sample && !String(sample.facts?.[f.key] ?? "").trim());
    return (
     <div
      key={f.key}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData("text/plain")); if (Number.isFinite(from)) onMove(from, i); }}
      className={cn("rounded-lg border px-2.5 py-2 transition", f.show ? "border-black/10 bg-white" : "border-black/[0.06] bg-stone-50")}
     >
      <div className="flex items-center gap-2">
       <GripVertical size={13} className="shrink-0 cursor-grab text-stone-300" />
       <button type="button" onClick={() => onSet(f.key, { show: !f.show })} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-[12.5px] font-medium", f.show ? "text-stone-700" : "text-stone-400")}>{cat?.name || f.key}</span>
        {/* The answer to "I switched it on and nothing happened" — given where the switch is. */}
        {f.show && sample && empty && (
         <span className="mt-0.5 block truncate text-[10.5px] text-amber-700">Empty on this listing — add it in Inventory</span>
        )}
       </button>
       <button type="button" role="switch" aria-checked={f.show} aria-label={`Show ${cat?.name || f.key}`} onClick={() => onSet(f.key, { show: !f.show })}
        className="relative h-[18px] w-8 shrink-0 rounded-full transition" style={{ background: f.show ? "#5D0F17" : "#d6d3d1" }}>
        <span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all", f.show ? "left-[16px]" : "left-[2px]")} />
       </button>
      </div>
      {f.show && (
       <div className="mt-2 flex items-center gap-1.5 pl-[21px]">
        {/* Chip is offered only where the value is short — see LONG_FIELDS. */}
        {(["inline", "drawer", "chip"] as FieldMode[]).filter((m) => m !== "chip" || canChip(f.key)).map((m) => (
         <button key={m} type="button" onClick={() => onSet(f.key, { mode: m })}
          className={cn("rounded-md border px-2 py-0.5 text-[11px] transition", f.mode === m ? "border-[#5D0F17] text-[#5D0F17]" : "border-black/10 text-stone-400 hover:border-black/25")}>
          {m === "inline" ? "On the page" : m === "drawer" ? "In a drawer" : "As a chip"}
         </button>
        ))}
        {/* Description is the piece's own writing — inline it needs no heading, so a label would
            only ever apply to the drawer. Every other field is labelled either way. */}
        {(f.mode !== "inline" || f.key !== "description") && (
         <input
          value={f.label ?? ""}
          onChange={(e) => onSet(f.key, { label: e.target.value })}
          placeholder={cat?.label || ""}
          className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] text-stone-700 outline-none focus:border-[#5D0F17]/50"
         />
        )}
       </div>
      )}
     </div>
    );
   })}
  </div>
 );
}
