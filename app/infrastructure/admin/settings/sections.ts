// The one list of settings sections.
//
// Shared by the left rail and the Settings landing page so the two can never disagree about what
// exists — the failure mode with two lists is a section that's reachable from one and invisible in
// the other, which is how settings end up "somewhere in there".
//
// Everything a store configures lives under /admin/settings now, including the things that used to
// sit loose in the sidebar (payments, plan) or hide inside a feature (its domain, its marketplaces).
// A seller looking for a setting should have exactly one place to look.

export type SettingsSection = {
 href: string;
 label: string;
 /** One line, shown on the landing page. Says what the section is FOR, not what it contains. */
 blurb: string;
 /** Lucide icon name, resolved by the components so this file stays free of JSX. */
 icon: string;
 /** VYA's own, not a store's. Hidden from sellers; only the VYA owner sees it. */
 vyaOnly?: boolean;
};

export type SettingsGroup = { label: string; items: SettingsSection[] };

const B = "/admin/settings";

export const SETTINGS_GROUPS: SettingsGroup[] = [
 {
  label: "Store",
  items: [
   { href: `${B}/general`, label: "General", blurb: "How VYA writes and prices for you, and your returns handling.", icon: "Store" },
   { href: `${B}/details`, label: "Store details", blurb: "Your legal name, support contact and company numbers — used on receipts and customs forms.", icon: "Building2" },
   { href: `${B}/locations`, label: "Locations", blurb: "Where parcels ship from, and where buyers can collect.", icon: "MapPin" },
   { href: `${B}/plan`, label: "Plan & billing", blurb: "What you’re on, what you’ve been charged, and your card on file.", icon: "Sparkles" },
   { href: `${B}/payments`, label: "Payments", blurb: "How you get paid, and the Stripe account payouts land in.", icon: "CreditCard" },
   { href: `${B}/users`, label: "People", blurb: "Who can sign in and work on this store, and how many seats your plan includes.", icon: "Users" },
   // VYA's own list of who may open a store at all — nothing to do with a seller's own settings, and
   // hidden from them. Kept here so it's one place to look rather than a URL you have to remember.
   { href: `${B}/invites`, label: "Who can open a store", blurb: "VYA is invite-only. The emails allowed to create a store here.", icon: "Mail", vyaOnly: true },
  ],
 },
 {
  label: "Selling",
  items: [
   { href: `${B}/shipping`, label: "Shipping & duties", blurb: "Where you ship, what postage costs, and who pays customs.", icon: "Truck" },
   { href: `${B}/tax`, label: "Sales tax", blurb: "Where you’re registered to collect, and how each piece is taxed.", icon: "Receipt" },
   { href: `${B}/inbox`, label: "Messages & offers", blurb: "Whether shoppers can message you or name their price — and how offers work.", icon: "MessageCircle" },
   { href: `${B}/policies`, label: "Policies", blurb: "Returns, shipping, privacy and terms — linked from every storefront page.", icon: "ScrollText" },
   { href: `${B}/appointments`, label: "Appointments", blurb: "Let people book a time with you — fittings, collections, sourcing chats. Yours whether or not you rent.", icon: "CalendarClock" },
   { href: `${B}/rentals`, label: "Rentals", blurb: "Rent pieces out instead of selling them once — who can book, for how long, and on what terms.", icon: "CalendarRange" },
  ],
 },
 {
  label: "Channels",
  items: [
   { href: `${B}/domain`, label: "Your domain", blurb: "Connect a domain you own, or buy one here.", icon: "Globe" },
   { href: `${B}/marketplaces`, label: "Marketplaces", blurb: "Depop, eBay and the accounts VYA cross-lists to.", icon: "Share2" },
   { href: `${B}/consignment`, label: "Consignment", blurb: "Splits, payout terms, and what consignors can see.", icon: "Handshake" },
  ],
 },
];

/** Flat, for the rail and for matching the current path. */
export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.items);

/** The section a path is inside, or null on the landing page itself. */
export function sectionFor(pathname: string): SettingsSection | null {
 // Longest match first: /settings/shipping must not be claimed by a shorter prefix.
 return (
  [...SETTINGS_SECTIONS]
   .sort((a, b) => b.href.length - a.href.length)
   .find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`)) ?? null
 );
}
