// Shapes returned by the VYA API. Kept deliberately close to what the routes actually send —
// see app/api/public/* and app/api/mobile/* in the web repo, which are the source of truth.

export type Product = {
  id: number;
  name: string;
  storeSlug: string;
  storeName: string;
  price: string; // pre-formatted by the API, e.g. "$1,200"
  image: string | null;
  images?: string[];
  size?: string | null;
};

export type Store = {
  slug: string;
  name: string;
  image?: string | null;
  bio?: string | null;
};

export type User = {
  id: string;
  email: string;
  name?: string | null;
};

export type SearchResponse = {
  products: Product[];
  designers?: { slug: string; label: string }[];
  categories?: { slug: string; label: string }[];
  stores?: { slug: string; name: string }[];
};

/** Paged list endpoints (new-arrivals, browse) share this envelope. */
export type PagedProducts = {
  products: Product[];
  nextOffset: number;
  hasMore: boolean;
};

export type SavedSearch = {
  id: number;
  query: string | null;
  label?: string | null;
  createdAt?: string;
};

/** One line in the cart. The cart is local to the device — see lib/cart.tsx for why. */
export type CartLine = {
  productId: number;
  name: string;
  price: string;
  image: string | null;
  storeSlug: string;
  storeName: string;
  size?: string | null;
};

/** "$1,200" → 1200. The API sends prices pre-formatted, so a total has to parse them back. */
export function priceToNumber(formatted: string | null | undefined): number {
  if (!formatted) return 0;
  const n = Number(String(formatted).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Back to the same shape the API sends, so a computed total sits beside listed prices unnoticed. */
export function formatPrice(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
