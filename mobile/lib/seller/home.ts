// Shaping for the seller Home screen.
//
// Pure functions only — no fetching, no React. Home is the screen a seller opens forty times a day
// and reads in two seconds, so the numbers on it are worth testing on their own rather than through
// a rendered tree.

/** Currencies VYA's pilot stores actually price in. Anything else falls back to its code, which is
 *  honest — inventing the wrong symbol misstates the amount. */
const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

/** Thousands separators by hand rather than `toLocaleString`: Hermes ships a cut-down Intl, and a
 *  grouping that silently differs between the simulator and a device is worse than none. */
function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Minor units → what Home displays. Whole units only: the takings line is the largest type on the
 * screen and pennies there cost a character everyone has to read past.
 *
 * `currency` comes from /api/store/me, never a constant — the mockups are one London store.
 */
export function formatMoney(cents: number, currency: string): string {
  const units = Math.round(cents / 100);
  const code = currency.toUpperCase();
  const symbol = SYMBOLS[code] ?? `${code} `;
  return `${units < 0 ? "-" : ""}${symbol}${group(Math.abs(units))}`;
}

/**
 * Percentage change against the prior period, whole percent, for the `↑ 22%` beside the takings.
 *
 * Null when there is no prior period to compare against. A first day of trading is not "up 100%"
 * — it is a comparison that cannot be made, and the caller should show the takings alone.
 */
export function percentDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

/**
 * The wide tile at the top of Home. Fulfilling an order is the most time-critical thing a seller
 * does — often standing in a post office queue — so this outranks every other number on the screen.
 */
export function ordersToPostLabel(count: number): string {
  if (count === 0) return "Nothing to post";
  return `${count} ${count === 1 ? "order" : "orders"} to post`;
}

/** The Inventory tile's second line: what is live, and what is still waiting to be finished. */
export function inventoryLabel({ active, draft }: { active: number; draft: number }): string {
  if (active === 0 && draft === 0) return "Nothing listed yet";
  const live = `${group(active)} live`;
  if (draft === 0) return live;
  return `${live} · ${group(draft)} ${draft === 1 ? "draft" : "drafts"}`;
}

/** The order statuses that mean a parcel is sitting on her table. `pending` is money that has not
 *  landed; `shipped` has already gone; the rest are nobody's work. */
const TO_POST = new Set(["paid"]);

/** Orders awaiting a parcel, in the order the API returned them (newest first). */
export function toPostOrders<T extends { status: string }>(orders: T[]): T[] {
  return orders.filter((o) => TO_POST.has(o.status));
}

/** The tile's second line. Two names only — it is one line on a phone, and the count above it
 *  already carries the total. */
export function toPostSubtitle(orders: { itemTitle: string | null }[]): string {
  return orders
    .map((o) => o.itemTitle)
    .filter((t): t is string => Boolean(t))
    .slice(0, 2)
    .join(" · ");
}

/** "Good morning, Blummier." Local hour in, greeting out — passed in rather than read here so the
 *  screen stays testable and the boundary between clock and copy stays visible. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}
