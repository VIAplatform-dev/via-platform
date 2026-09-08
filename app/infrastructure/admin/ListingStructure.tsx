"use client";

import { useEffect, useState } from "react";
import { CONDITION_GRADES, CONDITION_DEFINITIONS, normalizeCondition, isConditionGrade, type ConditionGrade } from "@/app/lib/condition-core";
import { templateFor, measurementLabel, unitFor, type MeasurementKey, type MeasurementUnit, type Measurement } from "@/app/lib/measurements-core";
import { weightUnitFor, toOz, fromOz, type WeightUnit } from "@/app/lib/weight-units";
import { tierForWeight, parcelMismatch, describeParcel, defaultParcelFor, type ParcelEstimate } from "@/app/lib/parcel-core";
import { cn } from "./ui";

// Sizing and condition as structure — the three rows both listing forms share (owner audit #27,
// #31). Pure display over the -core modules; the forms own the state.

const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-[12px] transition", on ? "border-[var(--accent,#0e9f76)] bg-[var(--accent,#0e9f76)] text-white" : "border-stone-300 bg-white text-stone-600 hover:border-stone-400");
const inputCls = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400";

/**
 * The grade as chips, and a note for whatever the grade doesn't say. A stored value that isn't on
 * the scale (free text from before) is shown as-is under the chips until she picks one.
 */
export function ConditionChips({ value, onChange, note, onNoteChange, flagged }: { value: string; onChange: (grade: ConditionGrade) => void; note: string; onNoteChange: (v: string) => void; flagged?: React.ReactNode }) {
 const grade = isConditionGrade(value) ? value : null;
 const nearest = !grade && value.trim() ? normalizeCondition(value) : null;
 return (
  <div data-testid="condition-chips">
   <label className="mb-1.5 block text-[12px] font-medium text-stone-700">Condition{flagged}</label>
   <div className="flex flex-wrap gap-1.5">
    {CONDITION_GRADES.map((g) => (
     <button key={g} type="button" onClick={() => onChange(g)} className={chip(grade === g)} title={CONDITION_DEFINITIONS[g]} aria-pressed={grade === g}>{g}</button>
    ))}
   </div>
   {grade && <p className="mt-1.5 text-[11.5px] text-stone-400">{CONDITION_DEFINITIONS[grade]}</p>}
   {!grade && value.trim() && (
    <p className="mt-1.5 text-[11.5px] text-stone-500">Saved as “{value}”{nearest ? <> — closest is <button type="button" className="underline" onClick={() => onChange(nearest)}>{nearest}</button></> : null}. Pick a grade to put it on the scale.</p>
   )}
   <input value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="Condition note — light wear to the sole, tiny mark inside…" className={cn(inputCls, "mt-2")} aria-label="Condition note" />
  </div>
 );
}

/** The category's template, as inputs. Empty ones are simply not sent (measurements-core.ts). */
export function MeasurementFields({ category, values, onChange, unit }: { category: string | null | undefined; values: Partial<Record<MeasurementKey, string>>; onChange: (next: Partial<Record<MeasurementKey, string>>) => void; unit: MeasurementUnit }) {
 const keys = templateFor(category);
 if (!keys.length) return null;
 return (
  <div data-testid="measurement-fields">
   <label className="mb-1.5 block text-[12px] font-medium text-stone-700">Measurements <span className="font-normal text-stone-400">— flat, in {unit === "cm" ? "centimetres" : "inches"}</span></label>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {keys.map((k) => (
     <label key={k} className="block">
      <span className="mb-1 block text-[11px] text-stone-500">{measurementLabel(k)}</span>
      <span className="flex items-center gap-1">
       <input inputMode="decimal" value={values[k] ?? ""} onChange={(e) => onChange({ ...values, [k]: e.target.value.replace(/[^\d.]/g, "") })} aria-label={measurementLabel(k)} className={inputCls} />
       <span className="text-[11px] text-stone-400">{unit}</span>
      </span>
     </label>
    ))}
   </div>
  </div>
 );
}

/** Form strings → the list the API stores. */
export function measurementsFromForm(values: Partial<Record<MeasurementKey, string>>, unit: MeasurementUnit): Measurement[] {
 return (Object.entries(values) as [MeasurementKey, string | undefined][])
  .filter(([, v]) => v != null && v.trim() !== "")
  .map(([key, v]) => ({ key, value: Number(v), unit }));
}
export function measurementsToForm(list: Measurement[] | null | undefined): Partial<Record<MeasurementKey, string>> {
 const out: Partial<Record<MeasurementKey, string>> = {};
 for (const m of list ?? []) out[m.key] = String(m.value);
 return out;
}

/**
 * "Ships as": the tier her weight lands in, and a warning when that disagrees with what the piece
 * looks like (the AI's estimate, or the category's). Editable weight lives here so the row and the
 * warning update together.
 */
export function ShipsAsRow({ weightOz, onChange, estimate, category, hint, weightUnit = "oz" }: { weightOz: string; onChange: (v: string) => void; estimate: ParcelEstimate | null | undefined; category: string | null | undefined; hint?: string; weightUnit?: WeightUnit }) {
 const typed = weightOz.trim() === "" ? null : Number(weightOz);
 const est = estimate ?? (() => { const d = defaultParcelFor(category); return { ...d, source: "category" as const }; })();
 const tier = tierForWeight(typed) ?? est.tier;
 const mismatch = parcelMismatch({ typedWeightOz: typed, estimate: est, category });
 return (
  <div data-testid="ships-as">
   <label className="mb-1.5 block text-[12px] font-medium text-stone-700">Ships as</label>
   <div className="flex flex-wrap items-center gap-3">
    <span className="text-[13px] text-stone-800">{describeParcel(tier, typed ?? est.weightOz)}</span>
    <span className="flex items-center gap-1 text-[12px] text-stone-500">
     {/* Typed in the store's unit, handed back in ounces — one stored unit, her numbers. */}
     <input
      inputMode="numeric"
      value={weightOz ? String(fromOz(weightOz, weightUnit)) : ""}
      onChange={(e) => { const t = e.target.value.replace(/[^\d]/g, ""); onChange(t ? String(toOz(t, weightUnit)) : ""); }}
      placeholder={String(fromOz(est.weightOz, weightUnit))}
      aria-label={`Weight (${weightUnit})`}
      className={cn(inputCls, "w-20")}
     /> {weightUnit}
    </span>
    <span className="text-[11px] text-stone-400">{typed == null ? (est.source === "ai" ? "estimated from the photos" : "estimated from the category") : hint ?? ""}</span>
   </div>
   {mismatch && <p data-testid="parcel-mismatch" className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 ring-1 ring-amber-200">{mismatch.message}</p>}
  </div>
 );
}

/** The store's unit and currency, from its shipping settings. `null` until loaded. */
export function useStoreUnits(withStore: (p: string) => string): { unit: MeasurementUnit; weightUnit: WeightUnit; currency: string } {
 const [u, setU] = useState<{ unit: MeasurementUnit; weightUnit: WeightUnit; currency: string }>({ unit: "cm", weightUnit: "g", currency: "USD" });
 useEffect(() => {
  let on = true;
  fetch(withStore("/api/store/shipping")).then((r) => (r.ok ? r.json() : null)).then((d) => {
   if (!on || !d) return;
   const store = { country: d.shipFrom?.country, currency: d.currency };
   setU({ unit: unitFor(store), weightUnit: weightUnitFor(store), currency: d.currency || "USD" });
  }).catch(() => {});
  return () => { on = false; };
 }, [withStore]);
 return u;
}
