// ───────────────────────────────────────────────────────────────────────────
// One-of-one inventory — pure logic (no DB), so the rules are unit-testable in
// isolation. The DB-backed engine (inventory.ts) enforces these atomically.
// ───────────────────────────────────────────────────────────────────────────

export type ItemStatus = "draft" | "active" | "reserved" | "sold" | "removed";

/** Default checkout hold — how long a reservation locks an item. */
export const DEFAULT_RESERVATION_TTL_SECONDS = 600; // 10 minutes

/** Allowed status transitions for a one-of-one item. */
export const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
 draft: ["active", "reserved", "removed"], // → reserved = an in-person (Market Mode) checkout of a quick-listed draft
 active: ["reserved", "draft", "removed"],
 reserved: ["sold", "active", "removed"], // → active = reservation released
 sold: ["removed"], // terminal except admin removal; never back to available
 removed: [],
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
 return ITEM_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Is an item buyable right now (purely from its status)? */
export function isAvailable(status: ItemStatus): boolean {
 return status === "active";
}

/** Has a reservation's hold elapsed? */
export function reservationExpired(expiresAt: Date, now: Date = new Date()): boolean {
 return now.getTime() >= expiresAt.getTime();
}

/** When a reservation started now (or `from`) should expire. */
export function reservationExpiry(ttlSeconds: number = DEFAULT_RESERVATION_TTL_SECONDS, from: Date = new Date()): Date {
 return new Date(from.getTime() + ttlSeconds * 1000);
}
