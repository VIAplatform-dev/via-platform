// The server's "Needs you" rows, folded into the phone's list.
//
// /api/store/attention (app/lib/attention-core.ts) already decides what counts, what it is called
// and the order. The phone's Home draws three kinds of row of its own — holds with the customer's
// name, unread messages, the consignor payouts line — so this drops the server's duplicates of
// those and adds an icon and, where the app has the screen, an in-app route.

export type AttentionRow = { id: string; label: string; count: number; href: string; urgent: boolean };

/** An in-app destination: the screen, and the filter it should open on. */
export type RowRoute = { pathname: "/(seller)/orders" | "/(seller)/inbox" | "/(seller)/consignment" | "/(seller)/inventory"; params?: Record<string, string> };

export type NeedsYouRow = {
  key: string;
  /** A Feather icon name. */
  icon: string;
  title: string;
  /** A web path (/admin/…), for when there is no in-app screen. */
  href: string;
  /** The in-app screen (with its filter), or null to open `href` in the browser. */
  route: RowRoute | null;
  /** The server's own judgement of whether this needs her now. Carried through so the Notifications
   *  screen can separate "needs you" from "when you have a moment" without re-deciding it here. */
  urgent: boolean;
};

// The inventory rows open Inventory already filtered to the pieces in question (?missing=…, the
// same keys the web Inventory takes); pickups open Orders on its Collections tab. A row that lands
// on an unfiltered list is a row she has to redo by hand.
const SHAPE: Record<string, { icon: string; route: RowRoute | null }> = {
  noPhoto: { icon: "camera", route: { pathname: "/(seller)/inventory", params: { missing: "photo" } } },
  unpriced: { icon: "tag", route: { pathname: "/(seller)/inventory", params: { missing: "price" } } },
  lowConfidence: { icon: "help-circle", route: { pathname: "/(seller)/inventory", params: { missing: "confidence" } } },
  costMissing: { icon: "dollar-sign", route: { pathname: "/(seller)/inventory", params: { missing: "cost" } } },
  holdsToday: { icon: "clock", route: { pathname: "/(seller)/inventory" } },
  pickupsWaiting: { icon: "package", route: { pathname: "/(seller)/orders", params: { filter: "pickup" } } },
  unanswered24h: { icon: "mail", route: { pathname: "/(seller)/inbox" } },
  payoutsDue: { icon: "archive", route: { pathname: "/(seller)/consignment" } },
  crossListingFailed: { icon: "alert-circle", route: null },
  // "aging" is deliberately absent: the Inventory tile already carries that line.
};

export function needsYouRows(rows: AttentionRow[], shown: { holdsShown: boolean; payoutsShown: boolean }): NeedsYouRow[] {
  const out: NeedsYouRow[] = [];
  for (const r of rows) {
    const shape = SHAPE[r.id];
    if (!shape) continue;
    if (r.id === "holdsToday" && shown.holdsShown) continue;
    if (r.id === "payoutsDue" && shown.payoutsShown) continue;
    out.push({ key: r.id, icon: shape.icon, title: r.label, href: r.href, route: shape.route, urgent: Boolean(r.urgent) });
  }
  return out;
}
