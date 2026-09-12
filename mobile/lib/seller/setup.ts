// "Set up your store" on the phone. Mirrors app/lib/setup-core.ts on the web.
//
// The steps themselves come from /api/store/onboarding-status, already worded and ordered; what
// the phone decides is the count in the pill and where a tap goes.
//
// EVERY STEP NOW HAS A PHONE SCREEN. It did not used to: returns and domain opened the web
// workspace in a browser, and payments landed on a Payouts screen that could only tell her to go to
// a desktop — so the checklist that exists to get a store trading sent her away from the app three
// times out of six. `href` is still carried for the web's own use; the phone no longer reads it.

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

export type PhoneRoute =
  | "/(seller)/list"
  | "/(seller)/payouts"
  | "/(seller)/policy"
  | "/(seller)/domain"
  | "/(seller)/shipping";

/**
 * The in-app screen for a step, or null when there is genuinely nowhere in the app to send her.
 *
 * `ship_from` is the one that still answers null: the address a parcel leaves from lives in the
 * shipping settings, and until that screen exists a tap has nowhere to land. Returning null is how
 * the caller knows to fall back — better than pointing at a screen that cannot do the job.
 */
export function phoneRouteFor(step: Pick<SetupStep, "id">): PhoneRoute | null {
  if (step.id === "first_listing") return "/(seller)/list";
  if (step.id === "payments") return "/(seller)/payouts";
  if (step.id === "returns") return "/(seller)/policy";
  if (step.id === "domain") return "/(seller)/domain";
  if (step.id === "shipping" || step.id === "ship_from") return "/(seller)/shipping";
  return null;
}
