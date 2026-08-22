"use client";
// The editor for any section's repeated content — hero slides, category tiles, reviews, columns,
// blog posts, gallery photos. One component, driven by the section's ITEM_SCHEMA, because "a list of
// things you can add to, delete from, and reorder" is the same interaction every time.
//
// This is what replaces hand-editing a pipe-delimited textarea. The merchant sees rows with real
// fields and real buttons; the delimiter never surfaces (see storefront-items.ts).
import { useState } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { readItems, writeItems, addItem, removeItem, moveItem, duplicateItem, type Item, type ItemSchema } from "@/app/lib/storefront-items";

// Human labels for the schema field names. Anything unlisted falls back to a title-cased key, so a
// new schema field is readable the moment it's added rather than blocking on this map.
const FIELD_LABEL: Record<string, string> = {
 heading: "Heading", subtext: "Text", body: "Text", cta: "Button label", image: "Image", img: "Image",
 src: "Image", quote: "Quote", name: "Name", title: "Title", excerpt: "Excerpt", link: "Link",
 btn: "Button label", href: "Button link", label: "Label", price: "Price",
};
const IMAGE_FIELDS = new Set(["image", "img", "src"]);
const label = (f: string) => FIELD_LABEL[f] || f.charAt(0).toUpperCase() + f.slice(1);
// The field that names a row in its collapsed header — the first non-image field carries the meaning.
const titleField = (schema: ItemSchema) => schema.fields.find((f) => !IMAGE_FIELDS.has(f)) || schema.fields[0];

export default function ItemsEditor({ props, schema, onChange, pick, uploading, addLabel = "Add item", singular = "Item" }: {
 props: Record<string, string> | undefined;
 schema: ItemSchema;
 onChange: (key: string, value: string) => void;
 pick: (cb: (url: string) => void) => void;
 uploading: boolean;
 addLabel?: string;
 singular?: string;
}) {
 const items = readItems(props, schema);
 // Which row is expanded. A list of slides is far easier to reorder when each row is one line, so
 // rows collapse to their title and open on click.
 const [open, setOpen] = useState<number | null>(items.length === 1 ? 0 : null);
 const commit = (next: Item[]) => onChange(schema.key, writeItems(next, schema));
 const inp = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-[#5D0F17]/50";
 const tf = titleField(schema);

 return (
  <div className="mb-3.5">
   <div className="flex flex-col gap-1.5">
    {items.map((it, i) => {
     const isOpen = open === i;
     return (
      <div key={i} className="overflow-hidden rounded-lg border border-black/10 bg-white">
       <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" onClick={() => setOpen(isOpen ? null : i)} className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-stone-700">
         <span className="mr-1.5 text-stone-400">{i + 1}.</span>
         {it[tf] || <span className="text-stone-400">{singular} {i + 1}</span>}
        </button>
        <button type="button" title="Move up" disabled={i === 0} onClick={() => commit(moveItem(items, i, i - 1))} className="grid h-6 w-6 place-items-center rounded text-stone-400 transition enabled:hover:bg-stone-100 enabled:hover:text-stone-700 disabled:opacity-25"><ChevronUp size={13} /></button>
        <button type="button" title="Move down" disabled={i === items.length - 1} onClick={() => commit(moveItem(items, i, i + 1))} className="grid h-6 w-6 place-items-center rounded text-stone-400 transition enabled:hover:bg-stone-100 enabled:hover:text-stone-700 disabled:opacity-25"><ChevronDown size={13} /></button>
        <button type="button" title="Duplicate" onClick={() => commit(duplicateItem(items, i))} className="grid h-6 w-6 place-items-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"><Copy size={12} /></button>
        <button type="button" title={`Delete ${singular.toLowerCase()}`} onClick={() => { commit(removeItem(items, i)); setOpen(null); }} className="grid h-6 w-6 place-items-center rounded text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
       </div>
       {isOpen && (
        <div className="border-t border-black/[0.06] px-2.5 py-2.5">
         {schema.fields.map((f) => (
          <div key={f} className="mb-2.5 last:mb-0">
           <label className="mb-1 block text-[11px] font-medium text-stone-500">{label(f)}</label>
           {IMAGE_FIELDS.has(f) ? (
            <div className="flex items-center gap-2">
             {it[f]
              ? <span className="h-9 w-9 shrink-0 rounded-md bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url("${it[f].replace(/"/g, "%22")}")` }} />
              : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-400"><ImageIcon size={14} /></span>}
             <button type="button" disabled={uploading} onClick={() => pick((url) => commit(items.map((x, j) => (j === i ? { ...x, [f]: url } : x))))} className="rounded-md bg-[#5D0F17] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#4a0c12] disabled:opacity-50">{uploading ? "Uploading…" : it[f] ? "Replace" : "Upload"}</button>
             {it[f] && <button type="button" onClick={() => commit(items.map((x, j) => (j === i ? { ...x, [f]: "" } : x)))} className="rounded-md px-2 py-1.5 text-[12px] text-stone-500 hover:bg-stone-100">Remove</button>}
            </div>
           ) : (
            // Uncontrolled + commit on blur: the same discipline the canvas uses, so React can't
            // re-render mid-keystroke and jump the caret.
            <input defaultValue={it[f] || ""} key={`${i}-${f}-${it[f] || ""}`} onBlur={(e) => { if (e.target.value !== (it[f] || "")) commit(items.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x))); }} className={inp} />
           )}
          </div>
         ))}
        </div>
       )}
      </div>
     );
    })}
   </div>
   <button type="button" onClick={() => { commit(addItem(items, schema)); setOpen(items.length); }} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/20 py-2 text-[12px] font-medium text-stone-500 transition hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"><Plus size={13} /> {addLabel}</button>
  </div>
 );
}
