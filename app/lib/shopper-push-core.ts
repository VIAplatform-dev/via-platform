import type { PushPayload } from "./push";

// What a shopper's phone actually says, for every moment VYA already emails about.
//
// Pure, so the copy can be read and tested without a database or a network. The crons import
// these; nothing writes a push body inline.
//
// THE RULES THIS COPY FOLLOWS, because a push is not a small email:
//
//  · It is read on a lock screen in under a second, sideways, one-handed. Two lines, no preamble.
//  · It names the PIECE, not the category. "Your Chanel flap" is a reason to open the app;
//    "1 new item" is a reason to turn notifications off.
//  · It never says more than it knows. Where a count or a name could be missing, the builder
//    returns null and nothing is sent. Silence beats a push that reads "undefined".
//  · `data.type` is what the app routes on when it is tapped (see routeForPush in app/_layout).
//    A notification that opens the home screen has wasted the tap.

/** A piece, as much of it as any of these builders needs. */
export type PushItem = { id?: number | string; name?: string | null; storeSlug?: string | null };

/** The first real name in the list, if there is one. */
function firstName(items: PushItem[]): string | null {
  for (const i of items) {
    const n = (i.name ?? "").trim();
    if (n) return n;
  }
  return null;
}

/** "X", "X and 1 more", "X and 4 more". Names the piece, then admits there are others. */
function nameAndMore(items: PushItem[]): string | null {
  const name = firstName(items);
  if (!name) return null;
  const rest = items.length - 1;
  if (rest <= 0) return name;
  return `${name} and ${rest} more`;
}

/** New arrivals across the marketplace. "New pieces just dropped." */
export function newArrivalsPush(count: number, items: PushItem[] = []): PushPayload | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const name = firstName(items);
  return {
    title: "New pieces just dropped",
    body: name
      ? `${name} and ${count - 1 > 0 ? `${count - 1} more` : "more"} just landed on VYA.`
      : `${count} new piece${count === 1 ? "" : "s"} just landed on VYA.`,
    data: { type: "new_arrivals" },
  };
}

/** A store you follow added something. */
export function storeDropPush(storeName: string, count: number, storeSlug: string): PushPayload | null {
  if (!storeName.trim() || !Number.isFinite(count) || count <= 0) return null;
  return {
    title: "New arrivals ✨",
    body: `${storeName} just added ${count} new piece${count === 1 ? "" : "s"}.`,
    data: { type: "store_drop", storeSlug },
  };
}

/** Something you saved or looked at is getting attention. */
export function trendingPush(items: PushItem[]): PushPayload | null {
  const what = nameAndMore(items);
  if (!what) return null;
  return {
    title: "Trending right now",
    body: `${what}: other people are looking too.`,
    data: { type: "trending", productId: items[0]?.id ?? null },
  };
}

/** You looked at this and didn't buy it. */
export function viewedItemPush(items: PushItem[]): PushPayload | null {
  const what = nameAndMore(items);
  if (!what) return null;
  return {
    title: "Still thinking about it?",
    body: `${what} is still available.`,
    data: { type: "viewed_item", productId: items[0]?.id ?? null },
  };
}

/** One of one, and someone else is circling. */
export function lastChancePush(items: PushItem[]): PushPayload | null {
  const what = nameAndMore(items);
  if (!what) return null;
  return {
    title: "Last chance",
    body: `${what}: one of one, and it won't come back.`,
    data: { type: "last_chance", productId: items[0]?.id ?? null },
  };
}

/** You left something in the basket. */
export function abandonedCartPush(items: PushItem[]): PushPayload | null {
  const what = nameAndMore(items);
  if (!what) return null;
  return {
    title: "You left something behind",
    body: `${what} is still in your bag.`,
    data: { type: "cart" },
  };
}

/** We haven't seen you. Tone shifts with how long. A fortnight is a nudge, a month is a pitch. */
export function winbackPush(tier: "14d" | "30d"): PushPayload {
  return tier === "14d"
    ? { title: "New since you last looked", body: "Fresh pieces from your stores are up on VYA.", data: { type: "winback" } }
    : { title: "A lot has landed", body: "A month of new arrivals is waiting on VYA.", data: { type: "winback" } };
}

/** A saved search matched something. */
export function savedSearchPush(searchName: string, count: number): PushPayload | null {
  if (!searchName.trim() || !Number.isFinite(count) || count <= 0) return null;
  return {
    title: `${count} new for “${searchName}”`,
    body: `New piece${count === 1 ? "" : "s"} matching your saved search.`,
    data: { type: "saved_search" },
  };
}

/** A piece you favourited dropped in price or is about to go. */
export function favoritePush(items: PushItem[]): PushPayload | null {
  const what = nameAndMore(items);
  if (!what) return null;
  return {
    title: "Something you saved",
    body: `${what}: worth another look.`,
    data: { type: "favorite", productId: items[0]?.id ?? null },
  };
}
