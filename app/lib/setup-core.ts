// "Set up your store" — the steps between a new seller and a first sale that has nowhere to go wrong.
//
// Pure over flags the onboarding-status route already has, so the web Home card and the phone's
// setup block are the same six lines in the same order. The domain is optional: shown, so she knows
// it exists, never counted against her — her VYA address works from day one.

export type SetupStepId = "ship_from" | "payments" | "shipping" | "first_listing" | "returns" | "domain";

export type SetupInput = {
 /** A complete ship-from address (needed to quote shipping and buy labels). */
 shipFromSet: boolean;
 /** A Stripe Connect account exists for the store. */
 paymentsConnected: boolean;
 /** Stripe will actually take a card for it — the cached flag, never a live call from Home. */
 chargesEnabled: boolean;
 /** The store has saved shipping settings at all. */
 shippingConfigured: boolean;
 /** How many shipping zones are switched on. */
 servedZoneCount: number;
 liveListings: number;
 /** A returns policy row exists (all-sales-final counts — it is a decision either way). */
 policySet: boolean;
 customDomain: string | null;
 /** Optional steps she chose to skip (setup_skipped on the store's profile row). Required ids are ignored. */
 skipped?: SetupStepId[];
};

export type SetupStep = {
 id: SetupStepId;
 label: string;
 hint?: string;
 href: string;
 done: boolean;
 /** Never blocks completeness. */
 optional?: boolean;
 /** She skipped it (optional steps only): done for completeness, hidden from the list. */
 skipped?: boolean;
};

export function setupSteps(i: SetupInput, base = "/admin"): SetupStep[] {
 const paymentsDone = i.paymentsConnected && i.chargesEnabled;
 const stripeHalfway = i.paymentsConnected && !i.chargesEnabled;
 return [
  { id: "ship_from", label: "Add the address you ship from", hint: "Needed before a listing can go live", href: `${base}/settings/locations`, done: i.shipFromSet },
  {
   id: "payments",
   label: stripeHalfway ? "Finish Stripe setup" : "Connect Stripe so you can get paid",
   hint: stripeHalfway ? "Stripe still needs a few details" : undefined,
   href: `${base}/settings/payments`,
   done: paymentsDone,
  },
  { id: "shipping", label: "Switch shipping on", href: `${base}/settings/shipping`, done: i.shippingConfigured && i.servedZoneCount > 0 },
  { id: "first_listing", label: "List your first piece", href: `${base}/add-listing`, done: i.liveListings > 0 },
  { id: "returns", label: "Set your returns policy", href: `${base}/settings/general`, done: i.policySet },
  domainStep(i, base),
 ];
}

function domainStep(i: SetupInput, base: string): SetupStep {
 const step: SetupStep = { id: "domain", label: "Connect your own domain", hint: "Optional — your VYA address works today", href: `${base}/settings/domain`, done: Boolean(i.customDomain), optional: true };
 // Skipped = done for completeness and out of the list, but still optional, so a connected domain
 // later reads as done (not skipped) and nothing ever counts it against her.
 if (!step.done && (i.skipped ?? []).includes("domain")) return { ...step, done: true, skipped: true };
 return step;
}

/** The one button's verb for a step — what she does, not what the step is called. */
export function stepVerb(step: Pick<SetupStep, "id" | "label">): string {
 switch (step.id) {
  case "ship_from": return "Add address";
  case "payments": return step.label === "Finish Stripe setup" ? "Finish Stripe setup" : "Connect Stripe";
  case "shipping": return "Switch shipping on";
  case "first_listing": return "List a piece";
  case "returns": return "Set returns policy";
  case "domain": return "Connect domain";
 }
}

export type SetupSummary = {
 done: number;
 total: number;
 /** Every required step is done (the optional domain does not count against her). */
 complete: boolean;
 /** The first required step still to do, or null when complete. */
 next: SetupStep | null;
};

export function setupSummary(steps: SetupStep[]): SetupSummary {
 const required = steps.filter((s) => !s.optional);
 return {
  done: steps.filter((s) => s.done).length,
  total: steps.length,
  complete: required.every((s) => s.done),
  next: required.find((s) => !s.done) ?? null,
 };
}
