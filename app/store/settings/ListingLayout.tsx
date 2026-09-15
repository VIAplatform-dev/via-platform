"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button, Field, cn } from "../ui";
import { SECTIONS, SPEC, DEFAULT_LAYOUT, type LayoutSection, type SectionKey } from "@/app/lib/description-layout";

// Where a seller says how she wants her listings written.
//
// THE POINT. VYA reads the shape of a shop's existing listings and copies it, which is right up
// until she wants something different: everything it writes is copied from what she has already
// published, so there was no way to say "measurements first, then the size, then the era". This is
// that way, and what she sets here beats what VYA read.
//
// MOVED WITH BUTTONS, NOT DRAGGED. Drag and drop is the obvious build and the wrong one: it is
// fiddly with a finger, invisible to a keyboard, and this screen has to work on the phone like
// everything else. Up and down are unambiguous with a thumb.

const ta = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-900/[0.06]";

/** What the drafter will actually produce, drawn out. Worth more than any amount of explaining. */
function Preview({ layout }: { layout: LayoutSection[] }) {
 if (!layout.length) {
  return <p className="text-[13px] text-stone-400">Add a part below and your listings will take shape here.</p>;
 }
 const lead = layout[0]?.key === "description" ? layout[0] : null;
 const rest = lead ? layout.slice(1) : layout;
 return (
  <div className="space-y-2 text-[13px] leading-[1.7] text-stone-700">
   {lead && <p>A sentence or two about the piece. Cut, fabric, the details worth naming.</p>}
   {rest.length > 0 && (
    <p className="whitespace-pre-wrap">
     {rest.map((s) => (
      <span key={`${s.key}:${s.label}`} className="block">
       <span className="text-stone-900">{s.label}:</span>{" "}
       <span className={SPEC[s.key].filledBy === "seller" ? "text-stone-400" : "text-stone-500"}>
        {SPEC[s.key].filledBy === "seller" ? "left for you to fill in" : sample(s.key)}
       </span>
      </span>
     ))}
    </p>
   )}
  </div>
 );
}

function sample(key: SectionKey): string {
 const s: Partial<Record<SectionKey, string>> = {
  era: "2000s", brand: "Bazar de Christian Lacroix", material: "Textured cotton blend",
  colour: "Pink", condition: "Excellent", fit: "Cut close. Suits a modern extra small",
  care: "Dry clean only", description: "written above",
 };
 return s[key] ?? "written for you";
}

export default function ListingLayout({
 layout, onChange, learned, onSave, busy, saved,
}: {
 layout: LayoutSection[];
 onChange: (next: LayoutSection[]) => void;
 learned: { layout: LayoutSection[]; words: number } | null;
 onSave: () => void;
 busy: boolean;
 saved: boolean;
}) {
 const move = (i: number, by: number) => {
  const next = [...layout];
  const j = i + by;
  if (j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j], next[i]];
  onChange(next);
 };
 const add = (key: SectionKey) => onChange([...layout, { key, label: SPEC[key].label }]);
 const remove = (i: number) => onChange(layout.filter((_, x) => x !== i));
 const relabel = (i: number, label: string) => onChange(layout.map((s, x) => (x === i ? { ...s, label } : s)));
 const rehint = (i: number, hint: string) => onChange(layout.map((s, x) => (x === i ? { ...s, hint } : s)));

 // Anything not already in the list. Her own sections are always offerable: a shop can have several.
 const unused = SECTIONS.filter((s) => s.key === "custom" || !layout.some((l) => l.key === s.key));

 return (
  <div className="space-y-6 px-5 py-4">
   {layout.length === 0 && (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
     <p className="text-[13px] text-stone-600">
      {learned
       ? "You already write to a format, and VYA has been following it. Start from that and change what you like."
       : "Nothing set, so VYA writes a short description and follows whatever your listings already do."}
     </p>
     <div className="mt-3 flex flex-wrap gap-2">
      {learned && <Button onClick={() => onChange(learned.layout)}>Start from my format</Button>}
      <button type="button" onClick={() => onChange(DEFAULT_LAYOUT)}
       className="rounded-md border border-stone-300 px-3 py-1.5 text-[13px] text-stone-700 transition hover:border-stone-400">
       Start from a standard one
      </button>
     </div>
    </div>
   )}

   {layout.map((s, i) => (
    <div key={`${s.key}:${i}`} className="rounded-lg border border-stone-200 p-3">
     <div className="flex items-start gap-2">
      <div className="flex flex-col gap-0.5 pt-1">
       <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
        aria-label={`Move ${s.label} up`}
        className="rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25 disabled:hover:bg-transparent">
        <ArrowUp size={14} />
       </button>
       <button type="button" onClick={() => move(i, 1)} disabled={i === layout.length - 1}
        aria-label={`Move ${s.label} down`}
        className="rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25 disabled:hover:bg-transparent">
        <ArrowDown size={14} />
       </button>
      </div>
      <span className="pt-1.5 text-[11px] tabular-nums text-stone-400">{i + 1}</span>
      <div className="min-w-0 flex-1 space-y-2">
       <input value={s.label} onChange={(e) => relabel(i, e.target.value)} maxLength={60}
        aria-label={`What to call ${SPEC[s.key].label}`}
        className={cn(ta, "font-medium")} placeholder={SPEC[s.key].label} />
       <p className="text-xs text-stone-500">
        {s.key === "custom" ? "Your own section." : SPEC[s.key].blurb}
        {SPEC[s.key].filledBy === "seller" && s.key !== "custom" && (
         <span className="text-stone-400"> VYA leaves this one for you.</span>
        )}
       </p>
       {s.key === "custom" && (
        <input value={s.hint ?? ""} onChange={(e) => rehint(i, e.target.value)} maxLength={200}
         aria-label={`What goes in ${s.label}`}
         className={ta} placeholder="What goes in it, e.g. two ways to wear it" />
       )}
      </div>
      <button type="button" onClick={() => remove(i)} aria-label={`Remove ${s.label}`}
       className="rounded p-1 text-stone-300 transition hover:bg-stone-100 hover:text-stone-600">
       <X size={15} />
      </button>
     </div>
    </div>
   ))}

   {unused.length > 0 && (
    <div>
     <p className="mb-2 text-[13px] font-medium text-stone-700">Add a part</p>
     <div className="flex flex-wrap gap-2">
      {unused.map((s) => (
       <button key={s.key} type="button" onClick={() => add(s.key)} title={s.blurb}
        className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-[13px] text-stone-600 transition hover:border-stone-400">
        <Plus size={12} />{s.label}
       </button>
      ))}
     </div>
    </div>
   )}

   <div className="border-t border-stone-100 pt-5">
    <Field label="How a listing will read">
     <div className="rounded-lg border border-stone-200 bg-white p-4"><Preview layout={layout} /></div>
    </Field>
   </div>

   <div className="flex items-center gap-3">
    <Button onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save layout"}</Button>
    {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
    {layout.length > 0 && (
     <button type="button" onClick={() => onChange([])} className="text-[13px] text-stone-400 transition hover:text-stone-600">
      Clear and let VYA decide
     </button>
    )}
   </div>
  </div>
 );
}
