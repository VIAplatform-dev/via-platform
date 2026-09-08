// "Set up your store" on the phone. Mirrors app/lib/setup-core.ts on the web.
//
// The steps themselves come from /api/store/onboarding-status, already worded and ordered; what
// the phone decides is the count in the pill and where a tap goes. Two steps the app can do
// itself (list a piece, connect payouts); the rest open the web workspace's settings, which is
// where those forms live and the one place they should be edited.

export type SetupStepId = "ship_from" | "payments" | "shipping" | "first_listing" | "returns" | "domain";

export type SetupStep = {
  id: SetupStepId;
  label: string;
  hint?: string;
  /** A web path (/admin/…). Prefix with API_BASE_URL to open it in the browser. */
  href: string;
  done: boolean;
  optional?: boolean;
};

export type SetupSummary = { done: number; total: number; complete: boolean; next: SetupStep | null };

export function setupSummary(input: SetupStep[] | null | undefined): SetupSummary {
  // An older server answers without `setup` at all. Nothing to show is not an error.
  const steps = Array.isArray(input) ? input : [];
  const required = steps.filter((s) => !s.optional);
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    complete: required.every((s) => s.done),
    next: required.find((s) => !s.done) ?? null,
  };
}

/** The in-app screen for a step, or null when it opens the web workspace instead. */
export function phoneRouteFor(step: Pick<SetupStep, "id">): "/(seller)/list" | "/(seller)/payouts" | null {
  if (step.id === "first_listing") return "/(seller)/list";
  if (step.id === "payments") return "/(seller)/payouts";
  return null;
}
