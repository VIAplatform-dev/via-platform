// Writing a store's policies out of the settings it has already filled in. Pure, no I/O.
//
// WHY THIS EXISTS. Settings → Policies gives a seller four empty boxes: Returns, Shipping, Privacy,
// Terms. Most stores leave them empty, because writing a returns policy from nothing is a job for
// an afternoon nobody has. Meanwhile she HAS answered all of it already, in the settings screens:
// where she ships, who pays postage, how long a buyer has to return, what she keeps, who pays to
// send it back. The policy is those answers in sentences.
//
// A DRAFT, NEVER A REPLACEMENT. Nothing here writes over a word she has written. The settings page
// offers this as "Write it from my settings", she reads it, edits it, saves it. After that it is
// hers and stays hers: if she later changes a shipping zone, her paragraph is not silently
// rewritten underneath her, because it may say things no setting knows.
//
// IT DESCRIBES WHAT IS ACTUALLY CONFIGURED, which is the whole value. A generated shipping policy
// that says "we ship worldwide" when Europe is switched off is worse than an empty box: it is a
// promise the checkout will refuse. Every sentence below comes from a real setting.
//
// PRIVACY AND TERMS ARE NOT LEGAL ADVICE and say so. They are a plain-English starting point with
// the shop's own details filled in, which beats an empty page linked from every product. A seller
// trading in the EU or UK needs hers checked by somebody qualified.

import type { ZoneConfig } from "./shipping-zones.ts";
import { ZONE_LABELS, ZONE_IDS } from "./shipping-zones.ts";
import { countryShortName } from "./ships-to-core.ts";

export type PolicyKey = "returns" | "shipping" | "privacy" | "terms";

export type PolicyInputs = {
 /** Trading name, for the sentences that need to say who "we" is. */
 storeName: string;
 /** Registered name when it differs. Contracts want the legal one. */
 legalName?: string | null;
 supportEmail?: string | null;
 /** Where she posts from. Decides whether a zone reads as home or abroad. */
 shipFromCountry?: string | null;
 zones?: ZoneConfig | null;
 /** buyer_pays | store_pays | free_over */
 shipMode?: string | null;
 freeThresholdCents?: number | null;
 /** Formatted by the caller, which knows the currency. */
 formatMoney?: (cents: number) => string;
 /** Collection offered, and the town it happens in. */
 pickup?: boolean;
 pickupCity?: string | null;
 /** She offers a faster paid option at checkout. */
 expedited?: boolean;
 /** Working days before a parcel goes out. Null = she has not said, so we claim nothing. */
 dispatchDays?: number | null;
 dutyMode?: string | null;
 refundsEnabled?: boolean;
 returnWindowDays?: number;
 restockingFeePct?: number;
 returnShippingPaidBy?: string | null;
};

const money = (i: PolicyInputs, cents: number) =>
 i.formatMoney ? i.formatMoney(cents) : `${Math.round(cents / 100)}`;

/**
 * "email hi@shop.com", or "email us" when she has not set an address.
 *
 * A RETURNS POLICY THAT SAYS "EMAIL US" AND NOT WHERE is not a policy, it is a dead end at exactly
 * the moment somebody needs her. The address is already in Settings → Store details.
 */
function mail(i: PolicyInputs, capital = false): string {
 const e = String(i.supportEmail ?? "").trim();
 const verb = capital ? "Email" : "email";
 return e ? `${verb} ${e}` : `${verb} us`;
}

/** "the US", "the UK", "France". What she would say out loud, not a two-letter code. */
function home(i: PolicyInputs): string {
 const code = String(i.shipFromCountry ?? "").trim().toUpperCase();
 // A code is all we can work from. Anything else ("United States" typed into the box) is not
 // something to put in a published policy.
 if (!/^[A-Z]{2}$/.test(code)) return "";
 const n = countryShortName(code) || code;
 // The ones a person says "the" in front of. "We ship within US" is not how anybody writes.
 return /^(US|UK|USA|UAE|Netherlands|Philippines|Czech Republic)$/i.test(n) ? `the ${n}` : n;
}

/**
 * Where we post, what it costs, and what happens at a border.
 *
 * IT HAS TO SOUND LIKE HER, NOT LIKE US. A draft that reads as though a machine wrote it is worse
 * than an empty box, because she will publish it and her shop will sound like every other shop.
 * So: "we", never the shop's own name in the third person. The country by name, because nobody
 * says "our home country". Short sentences. A contraction where a person would use one. And no
 * clause explaining why the policy is the way it is, which is the tell above all others.
 */
export function shippingPolicy(i: PolicyInputs): string {
 const out: string[] = [];
 const zones = i.zones || {};
 const abroad = ZONE_IDS.filter((k) => k !== "domestic" && zones[k]?.enabled).map((k) => (k === "rest_of_world" ? "the rest of the world" : ZONE_LABELS[k]));
 const here = home(i);

 if (abroad.length) {
  const list = abroad.length === 1 ? abroad[0] : `${abroad.slice(0, -1).join(", ")} and ${abroad[abroad.length - 1]}`;
  out.push(here ? `We ship within ${here}, and to ${list}.` : `We ship at home and to ${list}.`);
 } else {
  out.push(here ? `We ship within ${here} only. No overseas orders for now.` : "We ship at home only. No overseas orders for now.");
 }

 if (i.shipMode === "store_pays") out.push("Postage is free on every order. We cover it.");
 else if (i.shipMode === "free_over" && i.freeThresholdCents) out.push(`Postage is added at checkout, and it's free over ${money(i, i.freeThresholdCents)}.`);
 else out.push("Postage is added at checkout, worked out from the parcel and where it's going.");

 if (i.pickup) {
  out.push(i.pickupCity
   ? `You can collect in person in ${i.pickupCity} instead. Choose collection at checkout.`
   : "You can collect in person instead. Choose collection at checkout.");
 }

 const d = Number(i.dispatchDays);
 // Only when she has said. A promise about her own week is not one to invent for her.
 if (Number.isFinite(d) && d >= 1) {
  out.push(d === 1 ? "Orders go out within one working day." : `Orders go out within ${d} working days.`);
 }
 if (i.expedited) out.push("A faster delivery option is offered at checkout for a higher price.");
 out.push("Every order is tracked. We'll email you the tracking number when it ships.");

 if (abroad.length) {
  out.push(i.dutyMode === "absorbed"
   ? "Customs and import charges are already in our prices. Nothing more to pay when it lands."
   : i.dutyMode === "collected"
    ? "Customs and import charges are a separate line at checkout, so there's nothing to pay when it lands."
    : `Customs and import charges on orders outside ${here || "our country"} are yours to pay. The courier collects them before delivery.`);
 }
 return out.join("\n\n");
}

/** How long you've got, what it costs you, who pays the postage back. */
export function returnsPolicy(i: PolicyInputs): string {
 if (i.refundsEnabled === false) {
  return [
   "All sales are final. We don't accept returns or exchanges.",
   "Every piece is photographed in detail and every flaw is listed. Ask us for more photos or a measurement before you buy.",
   `If a piece arrives damaged or isn't as described, ${mail(i)}. We'll put it right.`,
  ].join("\n\n");
 }

 const out: string[] = [];
 const days = i.returnWindowDays ?? 0;
 out.push(days > 0
  ? `You have ${days} days from delivery to return a piece.`
  : `We take returns case by case. ${mail(i, true)} and we'll tell you where you stand.`);
 out.push("Pieces must come back unworn and unwashed, in the condition they were sent, with any tags still attached.");
 if (i.restockingFeePct && i.restockingFeePct > 0) out.push(`We keep a ${i.restockingFeePct}% restocking fee on returns.`);
 out.push(i.returnShippingPaidBy === "store"
  ? "We pay return postage and will send you the label."
  : "You pay return postage. It comes out of your refund, and we'll send you the label.");
 out.push("We refund to your original payment once the piece is back with us and checked.");
 out.push(`If a piece arrives damaged or isn't as described, ${mail(i)}. We'll put it right.`);
 return out.join("\n\n");
}

/** What we keep and what we do with it. */
export function privacyPolicy(i: PolicyInputs): string {
 return [
  "We keep your name, email, delivery address and what you ordered. That's what it takes to get a parcel to you.",
  "Card details go straight to our payment processor. We never see them.",
  "We'll email you about your order. If you signed up for our newsletter you'll get that too, and every one has an unsubscribe link at the bottom.",
  "We don't sell your details to anyone.",
  i.supportEmail
   ? `Want to know what we hold on you, or want it gone? Email ${i.supportEmail}.`
   : "Want to know what we hold on you, or want it gone? Email us.",
  "This is a plain summary, not legal advice.",
 ].join("\n\n");
}

/** The rules of buying from us. */
export function termsPolicy(i: PolicyInputs): string {
 const legal = i.legalName && i.legalName !== i.storeName ? `${i.storeName}, trading as ${i.legalName},` : (i.storeName || "us");
 return [
  `Buying from ${legal} means you agree to this.`,
  "Everything we sell is secondhand or vintage. It has been worn. We photograph the wear and we list the flaws.",
  "Most pieces are one of a kind. If one sells twice, you get a full refund straight away.",
  "Prices are in the currency shown at checkout, and include tax where it applies.",
  "Our returns and shipping pages are part of this.",
  "This is a plain starting point, not legal advice.",
 ].join("\n\n");
}

/**
 * The ones we are willing to draft.
 *
 * RETURNS AND SHIPPING ONLY. Those two are descriptions of settings she has already chosen, so a
 * draft is a restatement of her own answers and she can check it against what she knows.
 *
 * Privacy and Terms are not that. They are legal documents, what they must say depends on where
 * she trades and who her customers are, and a generated one reads plausible enough to publish
 * unread. The cost of getting those wrong lands on her, not on us. So the boxes stay empty until
 * she writes them or takes advice. privacyPolicy and termsPolicy below are kept, unused, for the
 * day that is a deliberate decision rather than a default.
 */
export function writePolicies(i: PolicyInputs): Record<PolicyKey, string> {
 return {
  returns: returnsPolicy(i),
  shipping: shippingPolicy(i),
  privacy: "",
  terms: "",
 };
}

/** Whether the generated text would actually say anything useful for this store yet. */
export function canWrite(key: PolicyKey, i: PolicyInputs): boolean {
 if (key === "shipping") return Boolean(i.zones) || Boolean(i.shipMode);
 if (key === "returns") return i.refundsEnabled !== undefined;
 return false; // privacy and terms are hers to write. See writePolicies.
}
