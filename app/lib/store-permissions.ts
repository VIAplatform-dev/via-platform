// ───────────────────────────────────────────────────────────────────────────
// What each person on a store is allowed to do.
//
// "Staff" was one shape for everyone, and real shops don't work that way: the person who shoots and
// lists shouldn't necessarily see what every piece cost or what the store made, and someone hired to
// answer messages has no reason to be able to delete inventory.
//
// So the OWNER keeps everything — that never changes, and there is always at least one — and staff
// get a set of areas the owner picks per person. A staff member with nothing chosen still gets the
// default set below, so nobody who already had access loses it when this ships.
//
// Pure and tested. The API and the nav both read it, so "can they see this" has one answer.
// ───────────────────────────────────────────────────────────────────────────

export type StoreRole = "owner" | "staff";

/** One thing a person can be given. Grouped the way the sidebar is, because that's how it's read. */
export type Area =
 | "inventory" | "cross-listing" | "consignment" | "rentals" | "appointments"
 | "orders" | "inbox" | "customers" | "storefront" | "marketing" | "discounts"
 | "numbers" | "costs" | "settings";

export const AREAS: { key: Area; label: string; hint: string; group: string }[] = [
 { key: "inventory", label: "Inventory", hint: "Add, edit and publish pieces.", group: "Selling" },
 { key: "cross-listing", label: "Cross-listing", hint: "List pieces on other sites.", group: "Selling" },
 { key: "consignment", label: "Consignment", hint: "Consignors, splits and payouts.", group: "Selling" },
 { key: "rentals", label: "Rentals", hint: "Bookings, returns and rental settings.", group: "Selling" },
 { key: "appointments", label: "Appointments", hint: "The schedule and who's coming in.", group: "Selling" },
 { key: "orders", label: "Orders", hint: "Orders, shipping labels and refunds.", group: "Orders" },
 { key: "inbox", label: "Inbox", hint: "Messages and offers from shoppers.", group: "Orders" },
 { key: "customers", label: "Customers", hint: "Your customer list and their history.", group: "Orders" },
 { key: "storefront", label: "Storefront", hint: "Edit how the store looks.", group: "Store" },
 { key: "marketing", label: "Marketing", hint: "Emails, campaigns and share links.", group: "Store" },
 { key: "discounts", label: "Discounts", hint: "Create and edit discount codes.", group: "Store" },
 { key: "numbers", label: "Sales figures", hint: "Revenue, performance and analytics.", group: "Money" },
 { key: "costs", label: "What pieces cost you", hint: "Cost price and profit on every piece.", group: "Money" },
 { key: "settings", label: "Store settings", hint: "Payments, shipping, tax and policies. Not billing or people.", group: "Money" },
];

/**
 * What a staff member gets when nobody has chosen for them.
 *
 * The everyday work of a shop, and nothing about money. Someone who joins to list and pack can do
 * that on day one; seeing margins and revenue is a decision an owner makes deliberately.
 */
export const DEFAULT_STAFF: Area[] = [
 "inventory", "cross-listing", "rentals", "appointments", "orders", "inbox", "customers",
];

/** Only the owner, ever. Handing over billing or access is not a permission, it's ownership. */
export const OWNER_ONLY = ["billing", "people"] as const;
export type OwnerOnly = (typeof OWNER_ONLY)[number];

export type Person = { role: StoreRole; permissions?: Area[] | null };

/** Everything this person can reach. An owner gets the lot. */
export function areasFor(p: Person): Area[] {
 if (p.role === "owner") return AREAS.map((a) => a.key);
 // null means "never chosen" — the default. An empty array means the owner deliberately took
 // everything away, and that has to be respected rather than read as unset.
 return p.permissions == null ? [...DEFAULT_STAFF] : p.permissions.filter(isArea);
}

export function can(p: Person, area: Area | OwnerOnly): boolean {
 if ((OWNER_ONLY as readonly string[]).includes(area)) return p.role === "owner";
 return areasFor(p).includes(area as Area);
}

export function isArea(v: unknown): v is Area {
 return typeof v === "string" && AREAS.some((a) => a.key === v);
}

/** Clean whatever the form sent: known areas only, no duplicates, in catalogue order. */
export function normalisePermissions(v: unknown): Area[] {
 const given = Array.isArray(v) ? v.filter(isArea) : [];
 return AREAS.map((a) => a.key).filter((k) => given.includes(k));
}

/** A short line for the row, so the list reads without opening every person. */
export function summarise(p: Person): string {
 if (p.role === "owner") return "Everything, including billing and access";
 const n = areasFor(p).length;
 if (n === 0) return "Nothing yet — pick what they can do";
 if (n === AREAS.length) return "Everything except billing and access";
 return `${n} of ${AREAS.length} areas`;
}
