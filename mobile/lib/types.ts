export type Product = {
  id: number;
  name: string;
  storeSlug: string;
  storeName: string;
  price: string; // pre-formatted, e.g. "$1,200"
  image: string | null;
  images?: string[];
};

export type SearchResponse = {
  products: Product[];
  designers: { slug: string; label: string }[];
  categories: { slug: string; label: string }[];
  stores: { slug: string; name: string }[];
};
