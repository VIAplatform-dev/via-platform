// Customers on the phone: the tag filter, and the edits to one customer's tags. Pure.
//
// Tags are the seller's own segments ("market", "vip", "wants fendi"); the server lowercases and
// dedupes them (store-customers-db.ts setCustomerTags), so the phone does the same before it
// shows a chip — a tag she just typed should look the way it will be stored.

export type TaggedCustomer = { email: string; tags?: string[] | null };

export const cleanTag = (t: string): string => t.trim().toLowerCase();

/** Every tag in use, most-used first, then alphabetical — the filter row at the top. */
export function allTags(customers: TaggedCustomer[]): string[] {
  const counts = new Map<string, number>();
  for (const c of customers) for (const raw of c.tags ?? []) {
    const t = cleanTag(raw);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** The list under a chip. `null` is "everyone". */
export function filterByTag<T extends TaggedCustomer>(customers: T[], tag: string | null): T[] {
  if (!tag) return customers;
  const want = cleanTag(tag);
  return customers.filter((c) => (c.tags ?? []).some((t) => cleanTag(t) === want));
}

/** Her tags with one added (deduped) or one removed — what the PATCH sends as the whole set. */
export function withTag(tags: string[] | null | undefined, tag: string): string[] {
  const t = cleanTag(tag);
  const cur = (tags ?? []).map(cleanTag).filter(Boolean);
  return !t || cur.includes(t) ? cur : [...cur, t];
}
export function withoutTag(tags: string[] | null | undefined, tag: string): string[] {
  const t = cleanTag(tag);
  return (tags ?? []).map(cleanTag).filter((x) => x && x !== t);
}
