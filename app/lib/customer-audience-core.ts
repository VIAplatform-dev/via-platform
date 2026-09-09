// Who a filter reaches. Pure — no I/O.
//
// The customer list and the campaign sender both run THIS, so the count on the page is the count
// that sends. Two implementations of "tagged vip and spent over £50" is how a seller emails 40
// people after being told 38.

export type AudienceCustomer = {
 email: string;
 tags: string[];
 spentCents: number;
 /** Categories of the pieces this customer has bought, lower-cased. */
 categories: string[];
};

export type AudienceFilter = {
 /** Any-of. A customer carrying one of these is in. */
 tags?: string[];
 /** Strictly more than this. */
 spentOverCents?: number | null;
 category?: string | null;
};

const lc = (s: string) => s.trim().toLowerCase();

export function audienceIsEmpty(f: AudienceFilter): boolean {
 return !(f.tags?.length) && (f.spentOverCents == null) && !(f.category && f.category.trim());
}

export function filterCustomers<T extends AudienceCustomer>(customers: T[], f: AudienceFilter): T[] {
 const tags = (f.tags ?? []).map(lc).filter(Boolean);
 const cat = f.category ? lc(f.category) : null;
 const over = f.spentOverCents == null ? null : f.spentOverCents;
 return customers.filter((c) => {
  if (tags.length && !c.tags.some((t) => tags.includes(lc(t)))) return false;
  if (over != null && !(c.spentCents > over)) return false;
  if (cat && !c.categories.some((x) => lc(x) === cat)) return false;
  return true;
 });
}

/** ?tag=a,b&spentOver=50&category=bags → a filter. `spentOver` is in whole currency, like the input. */
export function parseAudience(q: Record<string, string | string[] | null | undefined>): Required<AudienceFilter> {
 const raw = q.tag;
 const tagList = (Array.isArray(raw) ? raw : raw ? raw.split(",") : []).map(lc).filter(Boolean);
 const so = Array.isArray(q.spentOver) ? q.spentOver[0] : q.spentOver;
 const n = so != null && so !== "" ? Number(so) : NaN;
 const catRaw = Array.isArray(q.category) ? q.category[0] : q.category;
 return {
  tags: Array.from(new Set(tagList)),
  spentOverCents: Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null,
  category: catRaw && catRaw.trim() ? catRaw.trim() : null,
 };
}

export function describeAudience(f: AudienceFilter, symbol = "$"): string {
 if (audienceIsEmpty(f)) return "Everyone";
 const parts: string[] = [];
 if (f.tags?.length) parts.push(`Tagged ${f.tags.join(" or ")}`);
 if (f.spentOverCents != null) parts.push(`spent over ${symbol}${(f.spentOverCents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
 if (f.category) parts.push(`bought ${f.category}`);
 return parts.join(" · ");
}
