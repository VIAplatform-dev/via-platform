// The Home "Set up your store" card, as words and states.
//
// Option B on the left: one next step, one button, a quiet "then …" line. Option F on the right:
// a ring (done/total) and every step as a row. Everything here is pure over the steps
// setup-core.ts already orders, so the card can be tested without rendering it.

import { setupSummary, stepVerb, type SetupStep, type SetupStepId } from "./setup-core.ts";

/** How long the step takes, in her terms — the cue under the headline. */
const TIME_CUE: Record<SetupStepId, string> = {
 ship_from: "Two minutes.",
 payments: "About five minutes.",
 shipping: "One minute.",
 first_listing: "Five minutes with a photo.",
 returns: "One minute.",
 domain: "Ten minutes, whenever.",
};

const SHORT: Record<SetupStepId, string> = {
 ship_from: "Ship-from address",
 payments: "Stripe",
 shipping: "Shipping",
 first_listing: "First piece",
 returns: "Returns",
 domain: "Domain",
};

/** The word the then-line uses for a step. */
export function shortLabel(step: Pick<SetupStep, "id">): string {
 return SHORT[step.id];
}

export type ThenLine = {
 /** The next two REQUIRED steps after the headline one, short. */
 then: string[];
 /** The optional step still open (grey), or null once it is done or skipped. */
 optional: string | null;
};

export type NextStepCopy = {
 eyebrow: string;
 headline: string;
 hint: string;
 verb: string;
 href: string;
 thenLine: ThenLine;
};

/** What the left column says, or null when there is nothing required left to do. */
export function nextStepCopy(steps: SetupStep[]): NextStepCopy | null {
 const next = setupSummary(steps).next;
 if (!next) return null;
 const remaining = steps.filter((s) => !s.done).length;
 const after = steps.filter((s) => !s.done && !s.optional && s.id !== next.id);
 const optional = steps.find((s) => s.optional && !s.done) ?? null;
 return {
  eyebrow: `Next · ${remaining} to go`,
  headline: next.label,
  hint: next.hint ? `${next.hint}. ${TIME_CUE[next.id]}` : TIME_CUE[next.id],
  verb: stepVerb(next),
  href: next.href,
  thenLine: { then: after.slice(0, 2).map(shortLabel), optional: optional ? shortLabel(optional) : null },
 };
}

/** The conic ring's filled arc, in degrees. */
export function ringProgress(done: number, total: number): number {
 if (!(total > 0) || !(done > 0)) return 0;
 return Math.round(Math.min(1, done / total) * 360);
}

export type RowState = "done" | "next" | "later" | "optional";

/** How a list row draws: filled dot and strike for done, ringed dot for next, hollow for later, grey for the optional. */
export function rowState(step: SetupStep, nextId: SetupStepId | null | undefined): RowState {
 if (step.done) return "done";
 if (nextId && step.id === nextId) return "next";
 return step.optional ? "optional" : "later";
}
