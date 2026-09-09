// The workspace sidebar, as data.
//
// JSX-free on purpose (the same pattern as settings/sections.ts): icons are lucide NAMES the layout
// resolves, so Node can load this file and a test can say what a seller's left rail contains
// without rendering anything. The layout owns the chrome; this file owns what is in it.


export type NavSub = { href: string; label: string };
export type NavItem = {
 href: string;
 label: string;
 /** Lucide icon name, resolved by the layout so this file stays free of React. */
 icon: string;
 children?: NavSub[];
 /** Extra paths that keep this row active/expanded (a child that lives outside its prefix). */
 match?: string[];
 /** Counts what's waiting on the seller in this section — shown as a pill on the row. */
 badgeKey?: "rentals" | "appointments";
};
export type NavGroup = { label?: string; items: NavItem[] };

export const B = "/admin";
export const M = `${B}/market`;

export const GROUPS: NavGroup[] = [
 // The sidebar exactly as it was before the owner audit (2026-09-08): the owner asked for the old
 // sidebar back, unchanged. Only the owner-only Platform group carries one extra row (the setup
 // funnel), which no seller sees.
 { items: [{ href: `${B}/home`, label: "Home", icon: "Home" }] },
 {
  label: "Sell",
  items: [
   {
    href: `${B}/inventory`, label: "Inventory", icon: "Package",
    // Listing a piece belongs to Inventory rather than beside it. It briefly had a top-level row
    // of its own — the reasoning being that it's the action that makes money — but two entries
    // pointing at the same work read as two different features.
    match: [`${B}/add-listing`, `${B}/bulk-upload`], // keep Inventory active/expanded while adding listings
    children: [
     { href: `${B}/add-listing`, label: "Add listing" },
     { href: `${B}/bulk-upload`, label: "Bulk upload" },
     { href: `${B}/inventory/collections`, label: "Collections" },
     { href: `${B}/inventory/drafts`, label: "Drafts" },
     { href: `${B}/inventory/sold`, label: "Sold" },
    ],
   },
   { href: `${B}/cross-listing`, label: "Cross-listing", icon: "Share2", match: [`${B}/cross-listing/analytics`], children: [{ href: `${B}/cross-listing`, label: "Listings" }, { href: `${B}/cross-listing/analytics`, label: "Analytics" }, { href: `${B}/cross-listing/settings`, label: "Marketplaces" }] },
   { href: `${B}/consignment`, label: "Consignment", icon: "Handshake", children: [{ href: `${B}/consignment/consignors`, label: "Consignors" }, { href: `${B}/consignment/payouts`, label: "Payouts" }, { href: `${B}/consignment/settings`, label: "Settings" }] },
   { href: `${B}/rentals`, label: "Rentals", icon: "CalendarRange", badgeKey: "rentals" },
   { href: `${B}/appointments`, label: "Appointments", icon: "CalendarClock", badgeKey: "appointments" },
   { href: `${B}/orders`, label: "Orders", icon: "ShoppingBag" },
   { href: `${B}/inbox`, label: "Inbox", icon: "MessageCircle" },
  ],
 },
 {
  label: "Store",
  items: [
   {
    // Lands on the storefronts list, NOT the editor. The editor is full-screen and covers this
    // sidebar, so making it the parent's destination meant one click buried the sub-items with no
    // way back to Drafts or the domain without leaving the section entirely.
    href: `${B}/storefront/versions`, label: "Storefront", icon: "Store",
    match: [`${B}/storefront`],
    children: [
     { href: `${B}/storefront`, label: "Edit site" },
     { href: `${B}/storefront/versions`, label: "Drafts" },
     { href: `${B}/settings/domain`, label: "Your domain" },
    ],
   },
   { href: `${B}/import`, label: "Bring your site", icon: "Plug" },
   {
    href: `${B}/customers`, label: "Customers", icon: "Users",
    children: [{ href: `${B}/customers/buyers`, label: "Buyers" }, { href: `${B}/customers/recovery`, label: "Cart recovery" }],
   },
   {
    href: `${B}/marketing`, label: "Marketing", icon: "Megaphone",
    children: [
     { href: `${B}/marketing/campaigns`, label: "Campaigns" },
     { href: `${B}/marketing/design`, label: "Email design" },
     { href: `${B}/marketing/share-links`, label: "Share links" },
     { href: `${B}/marketing/instagram`, label: "Instagram" },
     { href: `${B}/marketing/automations`, label: "Automations" },
    ],
   },
   { href: `${B}/discounts`, label: "Discounts", icon: "Tag" },
  ],
 },
 {
  label: "Apps",
  items: [{
   href: `${B}/apps`, label: "Apps & integrations", icon: "LayoutGrid",
   children: [
    { href: `${B}/apps`, label: "All apps" },
    { href: `${B}/apps/email`, label: "Klaviyo & Mailchimp" },
   ],
  }],
 },
 {
  label: "Business",
  items: [
   { href: `${B}/dashboard`, label: "Analytics", icon: "BarChart3" },
   {
    href: `${B}/settings`, label: "Settings", icon: "Settings",
    // Five sections, not the sixteen the audit expanded to. `match` on /apps is deliberately NOT
    // here: main added it while Settings was the only home for Apps & integrations, and this
    // restores Apps as its own group above — lighting both for one page is worse than neither.
    children: [
     { href: `${B}/settings/general`, label: "General" },
     { href: `${B}/settings/plan`, label: "Plan & billing" },
     { href: `${B}/settings/payments`, label: "Payments" },
     { href: `${B}/settings/shipping`, label: "Shipping & duties" },
     { href: `${B}/settings/tax`, label: "Sales tax" },
    ],
   },
  ],
 },
 { label: "Platform", items: [
  { href: `${B}/trends`, label: "Trends", icon: "TrendingUp" },
  { href: `${B}/ai`, label: "AI accuracy", icon: "Target" },
  { href: `${B}/golden-review`, label: "Golden set", icon: "Gem" },
  // Owner-only, like the three above it: where stores stall on the way to their first sale.
  // Lost in a merge — the comment at the top of this file promised it and the route exists.
  { href: `${B}/setup-funnel`, label: "Where stores get stuck", icon: "Filter" },
 ] },
];

// ── Market Mode ──────────────────────────────────────────────────────────────────────────────
// A temporary operating mode for selling in person. When ON (per store, server-persisted so every
// device agrees), the nav collapses to just what a market needs and a phone gets a bottom tab bar.
// Turning it off is instant and never touches a checkout in flight — those live on the server.
export const MARKET_GROUPS: NavGroup[] = [
 { items: [{ href: M, label: "Market home", icon: "Home" }] },
 { label: "Sell", items: [
  { href: `${M}/find`, label: "Find item", icon: "Camera" },
  { href: `${M}/quick`, label: "Quick list", icon: "Plus" },
  { href: `${M}/cart`, label: "Cart", icon: "ShoppingBag" },
  { href: `${M}/sales`, label: "Sales today", icon: "Receipt" },
 ] },
 { label: "Inventory", items: [{ href: `${M}/inventory`, label: "At this market", icon: "Boxes" }, { href: `${M}/bring`, label: "Bring list", icon: "ClipboardList" }] },
 // Payments is the SAME Payments as Settings › Payments — one place to look, whichever mode she is in.
 { label: "Market", items: [{ href: `${M}/setup`, label: "Setup", icon: "SlidersHorizontal" }, { href: `${B}/payments`, label: "Payments", icon: "CreditCard" }] },
];

export const MARKET_TABS: { href: string; label: string; icon: string }[] = [
 { href: M, label: "Home", icon: "Home" },
 { href: `${M}/find`, label: "Find", icon: "Camera" },
 { href: `${M}/quick`, label: "Quick list", icon: "Plus" },
 { href: `${M}/sales`, label: "Sales", icon: "Receipt" },
 { href: `${M}/inventory`, label: "Items", icon: "Boxes" },
 { href: `${M}/bring`, label: "Bring", icon: "ClipboardList" },
];

// VYA's own tooling, not a store's. Trends, AI accuracy and the golden set are how WE measure the
// model. "Import your site" is a step INSIDE onboarding, not a place in the workspace — a seller
// who has just imported her site should not see an invitation to import it again. Owner-only.
export const INTERNAL = new Set([`${B}/trends`, `${B}/ai`, `${B}/golden-review`, `${B}/setup-funnel`, `${B}/apps`, `${B}/import`]);

export type NavSwitches = {
 /** The workspace owner (ADMIN_PASSWORD), NOT a signed-in store partner. */
 isOwner: boolean;
 /** Rentals is a mode a store opts into; null = not loaded yet, which reads as off. */
 rentalsOn?: boolean | null;
 /** Appointments are their own feature with their own switch. */
 apptsOn?: boolean | null;
 /** Messaging and offers are ON by default, so the Inbox hides only once we KNOW both are off. */
 inboxOff?: boolean;
};

/** The workspace nav with the rows this store cannot use taken out, and empty groups with them. */
export function visibleNavGroups({ isOwner, rentalsOn = null, apptsOn = null, inboxOff = false }: NavSwitches): NavGroup[] {
 return GROUPS
  .map((g) => ({
   ...g,
   items: g.items.filter((n) => (isOwner || !INTERNAL.has(n.href))
    && (n.href !== `${B}/rentals` || rentalsOn === true)
    && (n.href !== `${B}/appointments` || apptsOn === true)
    && (n.href !== `${B}/inbox` || !inboxOff)),
  }))
  .filter((g) => g.items.length > 0);
}
