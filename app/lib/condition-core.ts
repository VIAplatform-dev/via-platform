// Condition as a fixed scale. Pure — no I/O.
//
// Five grades, best first, each with the one line that says what it means — so "Very good" on one
// store's page means the same as on another's, and a buyer isn't left guessing whether "good" is
// good news. Free text a seller already saved is mapped onto the nearest grade when she edits;
// until then it prints as she wrote it. Anything she wants to add beyond the grade goes in the
// condition note, not the grade.
//
// The intake model grades on its own five (Deadstock/NWT … Fair — data-layer/config.ts, which the
// pricer still uses); normalizeCondition folds those onto this scale so the two never disagree.

import { normalizeConditionGrade } from "./data-layer/config.ts";

export const CONDITION_GRADES = ["Mint", "Excellent", "Very good", "Good", "Fair"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const CONDITION_DEFINITIONS: Record<ConditionGrade, string> = {
 Mint: "Unworn, or as good as. Tags or deadstock, no wear at all.",
 Excellent: "Worn and cared for. No visible flaws without looking hard.",
 "Very good": "Light, honest wear. Any marks are small and listed below.",
 Good: "Clearly worn, still lovely. Wear you can see, all listed below.",
 Fair: "Well loved. Visible wear or a repair — priced for it, all listed below.",
};

export const isConditionGrade = (v: unknown): v is ConditionGrade => typeof v === "string" && (CONDITION_GRADES as readonly string[]).includes(v);

export function conditionDefinition(grade: ConditionGrade): string {
 return CONDITION_DEFINITIONS[grade];
}

/** The pricer's scale → this one. */
const FROM_INTAKE: Record<string, ConditionGrade> = {
 "Deadstock/NWT": "Mint",
 Excellent: "Excellent",
 "Very Good": "Very good",
 Good: "Good",
 Fair: "Fair",
};

/**
 * Free text → a grade, or null when nothing in it says one. A bare grade in any case is itself
 * ("mint" is Mint, not Excellent — the pricer folds mint into Excellent, the scale doesn't).
 */
export function normalizeCondition(text: string | null | undefined): ConditionGrade | null {
 const s = String(text ?? "").trim();
 if (!s) return null;
 const lower = s.toLowerCase();
 const exact = CONDITION_GRADES.find((g) => g.toLowerCase() === lower);
 if (exact) return exact;
 if (/^mint\b/.test(lower)) return "Mint";
 const intake = normalizeConditionGrade(s);
 return intake ? FROM_INTAKE[intake] ?? null : null;
}
