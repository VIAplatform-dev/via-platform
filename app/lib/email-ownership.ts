// ───────────────────────────────────────────────────────────────────────────
// Who sends what, once a store has connected Klaviyo or Mailchimp.
//
// Without a rule here, a shopper who abandons a basket gets TWO emails about it: ours, and the one
// the store's own tool now has the data to send. That's the single worst outcome of connecting an
// email tool, and it's silent — the store finds out from a customer.
//
// The split is the same one Shopify uses, and it holds up for a reason:
//
//   TRANSACTIONAL stays with VYA, always. An order confirmation, a shipping notice, a booking
//   confirmation — these are a receipt for something that just happened. They have to go out in
//   seconds whether or not a marketing tool is connected, working, or paid up, and they're not
//   something a store composes. Handing them to Mailchimp would mean an order confirmation that
//   depends on a marketing subscription being current.
//
//   MARKETING moves to the store's tool. New arrivals, abandoned baskets, win-backs — the tool they
//   already use does these better than we do, with their templates and their timing, and now has
//   the data to. Us sending them too is the double-email problem.
//
// A store can take marketing back with one switch. What it can never do is have both send the same
// thing, because that's a decision nobody makes on purpose.
// ───────────────────────────────────────────────────────────────────────────

/** Everything VYA can send on a store's behalf. */
export type EmailKind =
 // Transactional — a receipt for something that happened.
 | "order-confirmation" | "shipping" | "delivery" | "refund"
 | "appointment-confirmation" | "appointment-reminder" | "appointment-decision"
 | "rental-confirmation" | "rental-return" | "deposit-receipt"
 | "offer-reply" | "message-reply" | "consignor-payout"
 // Marketing — sent because a store wants to sell something.
 | "new-arrivals" | "abandoned-basket" | "welcome" | "win-back" | "custom-automation" | "campaign";

const MARKETING: ReadonlySet<EmailKind> = new Set<EmailKind>([
 "new-arrivals", "abandoned-basket", "welcome", "win-back", "custom-automation", "campaign",
]);

export function isMarketing(kind: EmailKind): boolean {
 return MARKETING.has(kind);
}

export type Sender = "vya" | "esp";

export type OwnershipState = {
 /** A working Klaviyo/Mailchimp connection with a list chosen. A half-set-up one doesn't count. */
 espConnected: boolean;
 /** The store's choice. True (the default) hands marketing to their tool. */
 handOverMarketing: boolean;
};

/**
 * Who sends this email.
 *
 * A campaign the seller writes and presses send on in VYA is still VYA's to send — she's standing
 * in front of it. Handover is about the automatic ones that fire without anyone watching.
 */
export function sender(kind: EmailKind, s: OwnershipState): Sender {
 if (!isMarketing(kind)) return "vya";
 if (kind === "campaign") return "vya";
 return s.espConnected && s.handOverMarketing ? "esp" : "vya";
}

/** Should VYA send this itself? The one question the sending code needs answered. */
export function vyaShouldSend(kind: EmailKind, s: OwnershipState): boolean {
 return sender(kind, s) === "vya";
}

export const TRANSACTIONAL_EXAMPLES = [
 "Order confirmations and receipts",
 "Shipping and delivery updates",
 "Refunds",
 "Appointment confirmations and reminders",
 "Rental confirmations, returns and deposits",
 "Replies to messages and offers",
];

export const MARKETING_EXAMPLES = [
 "New arrivals",
 "Abandoned baskets",
 "Welcome emails",
 "Win-backs",
 "Any automation you've built in VYA",
];

/** One line for the settings page, so a store can see the arrangement without reading a list. */
export function describe(s: OwnershipState, providerName: string): string {
 if (!s.espConnected) return "VYA sends everything: your order emails and your marketing.";
 return s.handOverMarketing
  ? `VYA sends your order emails. ${providerName} sends your marketing, so nobody gets the same email twice.`
  : `VYA sends everything. ${providerName} has your customer list, but isn't sending to it — watch for people getting two of the same email.`;
}
