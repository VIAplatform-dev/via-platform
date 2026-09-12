"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import ProductCard from "@/app/components/ProductCard";
import TrackedStoreLink from "@/app/components/TrackedStoreLink";
import { trackSearchResults } from "@/app/lib/firebase-analytics";

type SearchProduct = {
 id: number;
 name: string;
 storeSlug: string;
 storeName: string;
 price: string;
 image?: string;
 images?: string[];
};

type SearchDesigner = { slug: string; label: string };
type SearchCategory = { slug: string; label: string };
type SearchStore = { slug: string; name: string; location: string };

type SortOption = "relevance" | "price-asc" | "price-desc";

// One screenful and change. The API caps a page at 200; asking for everything at once
// means ~780KB for a query like "bag", almost all of it per-product image JSON.
const PAGE_SIZE = 96;

const SORT_LABELS: Record<SortOption, string> = {
 relevance: "Relevance",
 "price-asc": "Price: Low to High",
 "price-desc": "Price: High to Low",
};


// Persist the search store-filter + sort PER QUERY so it survives back navigation
// (search → filter → open a result → hit back → your filter is still applied).
const searchFilterKey = (q: string) => `via_search_filter:${q}`;
function readSearchFilter(q: string): { selectedStore: string | null; sort: SortOption } {
 if (typeof window === "undefined") return { selectedStore: null, sort: "relevance" };
 try {
 const s = JSON.parse(sessionStorage.getItem(searchFilterKey(q)) || "{}");
 return { selectedStore: s.selectedStore ?? null, sort: s.sort ?? "relevance" };
 } catch {
 return { selectedStore: null, sort: "relevance" };
 }
}

function SearchResultsContent({ q }: { q: string }) {
 const [products, setProducts] = useState<SearchProduct[]>([]);
 const [designers, setDesigners] = useState<SearchDesigner[]>([]);
 const [categories, setCategories] = useState<SearchCategory[]>([]);
 const [matchedStores, setMatchedStores] = useState<SearchStore[]>([]);
 const [storeFacets, setStoreFacets] = useState<{ slug: string; name: string; count: number }[]>([]);
 const [total, setTotal] = useState(0);
  const [suggestion, setSuggestion] = useState<{ term: string; count: number } | null>(null);
 const router = useRouter();
 const [refine, setRefine] = useState(q);
 const [storesOpen, setStoresOpen] = useState(false);
 const [sortOpen, setSortOpen] = useState(false);
 const [hasMore, setHasMore] = useState(false);
 const [loading, setLoading] = useState(true);
 const [loadingMore, setLoadingMore] = useState(false);

 const [selectedStore, setSelectedStore] = useState<string | null>(() => readSearchFilter(q).selectedStore);
 const [sort, setSort] = useState<SortOption>(() => readSearchFilter(q).sort);

 // When the query changes (a new search in the same mount), load that query's
 // saved filter (or reset). Skips the first render — the lazy initializers above
 // already restored it, which is what makes back-navigation keep the filter.
 const prevQ = useRef(q);
 useEffect(() => {
 if (q === prevQ.current) return;
 prevQ.current = q;
 const saved = readSearchFilter(q);
 setSelectedStore(saved.selectedStore);
 setSort(saved.sort);
 }, [q]);

 // Save on every change so it's there when you come back.
 useEffect(() => {
 if (typeof window === "undefined" || !q.trim()) return;
 try {
 sessionStorage.setItem(searchFilterKey(q), JSON.stringify({ selectedStore, sort }));
 } catch {}
 }, [q, selectedStore, sort]);

 // Filtering and sorting go to the server, so they apply to EVERY match rather than to
 // whichever page is currently loaded. Changing either restarts at page one.
 const buildUrl = (offset: number) => {
 const params = new URLSearchParams({ q: q.trim(), limit: String(PAGE_SIZE), offset: String(offset) });
 if (selectedStore) params.set("store", selectedStore);
 if (sort !== "relevance") params.set("sort", sort);
 if (offset === 0) params.set("log", "1");
 return `/api/search?${params}`;
 };

 // Responses do not arrive in the order they were sent. Without this guard a slow
 // reply for an older query (or an older page) lands last and overwrites the results
 // that are actually on screen — which is how a search with hundreds of matches ends
 // up reporting none.
 const reqSeq = useRef(0);

 useEffect(() => {
 if (!q.trim()) {
 reqSeq.current += 1;
 queueMicrotask(() => {
 setProducts([]);
 setDesigners([]);
 setCategories([]);
 setMatchedStores([]);
 setStoreFacets([]);
 setTotal(0);
 setSuggestion(null);
 setHasMore(false);
 setLoading(false);
 });
 return;
 }

 const seq = ++reqSeq.current;
 queueMicrotask(() => setLoading(true));
 fetch(buildUrl(0))
 .then((res) => res.json())
 .then((data) => {
 if (seq !== reqSeq.current) return;
 setProducts(data.products || []);
 setDesigners(data.designers || []);
 setCategories(data.categories || []);
 setMatchedStores(data.stores || []);
 // A facet list only comes back unfiltered; keep the previous one while a store
 // is selected so the chips don't collapse to the one you picked.
 if (!selectedStore) setStoreFacets(data.storeFacets || []);
 setTotal(data.total ?? (data.products || []).length);
 setSuggestion(data.suggestion ?? null);
 setHasMore(Boolean(data.hasMore));
 })
 .catch(() => {
 if (seq !== reqSeq.current) return;
 setProducts([]);
 setDesigners([]);
 setCategories([]);
 setMatchedStores([]);
 setTotal(0);
 setSuggestion(null);
 setHasMore(false);
 })
 .finally(() => { if (seq === reqSeq.current) setLoading(false); });
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [q, selectedStore, sort]);

 const loadMore = () => {
 if (loadingMore || !hasMore) return;
 const seq = reqSeq.current;
 setLoadingMore(true);
 fetch(buildUrl(products.length))
 .then((res) => res.json())
 .then((data) => {
 if (seq !== reqSeq.current) return;
 setProducts((prev) => [...prev, ...(data.products || [])]);
 setHasMore(Boolean(data.hasMore));
 })
 .catch(() => {})
 .finally(() => { if (seq === reqSeq.current) setLoadingMore(false); });
 };

 // Filter chips come from the API, counted over every match — so they are complete on
 // page one and their counts don't grow as you load more.
 const productStores = storeFacets;
 // Filtering and sorting already happened in SQL.
 const displayProducts = products;

 const hasQuickLinks = designers.length > 0 || categories.length > 0 || matchedStores.length > 0;

 useEffect(() => {
 if (loading || !q.trim()) {
 return;
 }

 trackSearchResults({
 searchTerm: q.trim(),
 resultsCount: products.length,
 displayedCount: displayProducts.length,
 storeCount: matchedStores.length,
 designerCount: designers.length,
 categoryCount: categories.length,
 selectedStore,
 sort,
 });
 }, [
 categories.length,
 designers.length,
 displayProducts.length,
 loading,
 matchedStores.length,
 products.length,
 q,
 selectedStore,
 sort,
 ]);

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <section className="">
 <div className="max-w-7xl mx-auto px-6 pt-12 pb-5">
 <h1 className="text-2xl sm:text-3xl font-serif mb-1">
 {q ? `Results for "${q}"` : "Search"}
 </h1>
 {!loading && suggestion && (
 <p className="text-sm text-[#5D0F17]/70 mt-2">
 Did you mean{" "}
 <Link
 href={`/search?q=${encodeURIComponent(suggestion.term)}`}
 className="italic underline underline-offset-2 hover:text-[#5D0F17]"
 >
 {suggestion.term}
 </Link>
 ? <span className="text-[#5D0F17]/40">({suggestion.count.toLocaleString()} items)</span>
 </p>
 )}
 </div>
 </section>

 <section className="pb-16">
 <div className="max-w-7xl mx-auto px-6">
 {loading && (
 <p className="text-sm text-[#5D0F17]/40">Searching...</p>
 )}

 {/* Quick links: Stores, Categories, Designers */}
 {!loading && hasQuickLinks && (
 <div className="flex flex-wrap gap-x-10 gap-y-6 mb-8">
 {matchedStores.length > 0 && (
 <div>
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-3">Stores</p>
 <div className="flex flex-wrap gap-2">
 {matchedStores.map((s) => (
 <TrackedStoreLink
 key={s.slug}
 href={`/stores/${s.slug}`}
 storeSlug={s.slug}
 storeName={s.name}
 surface="search_results"
 className="inline-block border border-[#5D0F17]/20 px-4 py-2 text-sm hover:bg-[#5D0F17] hover:text-[#FFFDF8] hover:border-[#5D0F17] transition-colors"
 >
 {s.name}
 </TrackedStoreLink>
 ))}
 </div>
 </div>
 )}
 {categories.length > 0 && (
 <div>
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-3">Categories</p>
 <div className="flex flex-wrap gap-2">
 {categories.map((c) => (
 <Link
 key={c.slug}
 href={`/categories/${c.slug}`}
 className="inline-block border border-[#5D0F17]/20 px-4 py-2 text-sm hover:bg-[#5D0F17] hover:text-[#FFFDF8] hover:border-[#5D0F17] transition-colors"
 >
 {c.label}
 </Link>
 ))}
 </div>
 </div>
 )}
 {designers.length > 0 && (
 <div>
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-3">Designers</p>
 <div className="flex flex-wrap gap-2">
 {designers.map((d) => (
 <Link
 key={d.slug}
 href={`/brands/${d.slug}`}
 className="inline-block border border-[#5D0F17]/20 px-4 py-2 text-sm hover:bg-[#5D0F17] hover:text-[#FFFDF8] hover:border-[#5D0F17] transition-colors"
 >
 {d.label}
 </Link>
 ))}
 </div>
 </div>
 )}
 </div>
 )}

 {/* No results */}
 {!loading && products.length === 0 && q && (
 <div className="text-center py-16">
 <p className="text-[#5D0F17]/50 mb-2">No items found for &ldquo;{q}&rdquo;</p>
 <p className="text-sm text-[#5D0F17]/40 mb-8">Try a designer name, item type, or browse a category below.</p>
 <div className="flex flex-wrap justify-center gap-3 mb-8">
 {["Clothing", "Bags", "Shoes", "Accessories"].map((cat) => (
 <Link
 key={cat}
 href={`/categories/${cat.toLowerCase()}`}
 className="border border-[#5D0F17]/20 px-5 py-2.5 text-sm hover:bg-[#5D0F17] hover:text-[#FFFDF8] hover:border-[#5D0F17] transition-colors"
 >
 {cat}
 </Link>
 ))}
 </div>
 <Link
 href="/stores"
 className="inline-block text-sm text-[#5D0F17]/50 underline hover:text-[#5D0F17] transition-colors"
 >
 Browse all stores
 </Link>
 </div>
 )}

 {/* Toolbar — the same shape as a category page: refine, count, Filter, Sort.
     The store list used to sit here as a chip for EVERY store that had a hit, which for
     a query like "bags" is 53 of them: two full screens of chips before a single product. */}
 {!loading && products.length > 0 && (
 <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full mb-8">
 {/* Refine — runs a new search rather than filtering what's loaded */}
 <form
 onSubmit={(e) => { e.preventDefault(); const t = refine.trim(); if (t) router.push(`/search?q=${encodeURIComponent(t)}`); }}
 className="relative w-full sm:max-w-xs"
 >
 <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5D0F17]/40" />
 <input
 type="text"
 value={refine}
 onChange={(e) => setRefine(e.target.value)}
 placeholder="Search products..."
 className="w-full pl-11 pr-9 py-2.5 rounded-full border border-[#5D0F17]/15 bg-[#5D0F17]/[0.03] text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:border-[#5D0F17]/40 focus:bg-[#FFFDF8] focus:outline-none transition"
 />
 {refine && (
 <button type="button" onClick={() => setRefine("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5D0F17]/40 hover:text-[#5D0F17]">
 <X size={14} />
 </button>
 )}
 </form>

 <div className="flex items-center gap-2 sm:ml-auto">
 <span className="text-sm text-[#5D0F17]/45 mr-1 whitespace-nowrap tabular-nums">
 {total.toLocaleString()} product{total !== 1 ? "s" : ""}
 </span>

 {/* Store filter — a scrolling list in a popover, not a wall */}
 {productStores.length > 1 && (
 <div className="relative">
 <button
 onClick={() => { setStoresOpen(!storesOpen); setSortOpen(false); }}
 className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm transition-all duration-200 ${
 selectedStore
 ? "border-[#5D0F17] text-[#5D0F17] font-medium"
 : "border-[#5D0F17]/15 text-[#5D0F17]/70 hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"
 }`}
 >
 <SlidersHorizontal size={14} />
 Filter{selectedStore ? " (1)" : ""}
 </button>
 {storesOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setStoresOpen(false)} />
 <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 z-50 w-72 bg-[#FFFDF8] border border-[#5D0F17]/15 rounded-2xl shadow-lg max-h-[60vh] overflow-y-auto py-1">
 <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40">Store</p>
 <button
 onClick={() => { setSelectedStore(null); setStoresOpen(false); }}
 className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#D8CABD]/20 transition flex items-center justify-between ${selectedStore === null ? "font-medium" : ""}`}
 >
 All stores
 {selectedStore === null && <span className="text-xs">✓</span>}
 </button>
 {productStores.map((st) => (
 <button
 key={st.slug}
 onClick={() => { setSelectedStore(st.slug === selectedStore ? null : st.slug); setStoresOpen(false); }}
 className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#D8CABD]/20 transition flex items-center justify-between gap-3 ${selectedStore === st.slug ? "font-medium" : ""}`}
 >
 <span className="truncate">{st.name}</span>
 <span className="text-[#5D0F17]/40 text-xs tabular-nums">{st.count}</span>
 </button>
 ))}
 </div>
 </>
 )}
 </div>
 )}

 {/* Sort */}
 <div className="relative">
 <button
 onClick={() => { setSortOpen(!sortOpen); setStoresOpen(false); }}
 className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#5D0F17]/15 text-sm text-[#5D0F17]/70 hover:border-[#5D0F17]/40 hover:text-[#5D0F17] transition"
 >
 <span className="text-[#5D0F17]/50">Sort</span>
 <span className="text-[#5D0F17] font-medium">{SORT_LABELS[sort]}</span>
 <ChevronDown size={13} className={`ml-0.5 transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`} />
 </button>
 {sortOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
 <div className="absolute top-full right-0 mt-2 z-50 bg-[#FFFDF8] border border-[#5D0F17]/15 rounded-2xl shadow-lg overflow-hidden min-w-[180px]">
 {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
 <button
 key={option}
 onClick={() => { setSort(option); setSortOpen(false); }}
 className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#D8CABD]/20 transition flex items-center justify-between ${sort === option ? "font-medium" : ""}`}
 >
 {SORT_LABELS[option]}
 {sort === option && <span className="text-[#5D0F17] text-xs">✓</span>}
 </button>
 ))}
 </div>
 </>
 )}
 </div>
 </div>
 </div>
 )}

 {/* Product grid */}
 {displayProducts.length > 0 && (
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-12">
 {displayProducts.map((p) => (
 <ProductCard
 key={p.id}
 id={`${p.storeSlug}-${p.id}`}
 dbId={p.id}
 name={p.name}
 price={p.price}
 category="Clothing"
 storeName={p.storeName}
 storeSlug={p.storeSlug}
 image={p.image ?? ""}
 images={p.images}
 from="search"
 />
 ))}
 </div>
 )}

 {hasMore && (
 <div className="flex justify-center mt-14">
 <button
 onClick={loadMore}
 disabled={loadingMore}
 className="border border-[#5D0F17]/30 px-10 py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17] hover:text-[#FFFDF8] hover:border-[#5D0F17] transition-colors disabled:opacity-50"
 >
 {loadingMore ? "Loading…" : `Load more (${(total - displayProducts.length).toLocaleString()} left)`}
 </button>
 </div>
 )}

 {/* Filtered to zero */}
 {!loading && products.length > 0 && displayProducts.length === 0 && (
 <div className="text-center py-12">
 <p className="text-[#5D0F17]/50 text-sm">No items match this filter.</p>
 <button
 onClick={() => setSelectedStore(null)}
 className="mt-3 text-sm text-[#5D0F17] underline"
 >
 Clear filter
 </button>
 </div>
 )}
 </div>
 </section>
 </main>
 );
}

function SearchResults() {
 const searchParams = useSearchParams();
 const q = searchParams.get("q") || "";

 return <SearchResultsContent key={q} q={q} />;
}

export default function SearchPage() {
 return (
 <Suspense
 fallback={
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-7xl mx-auto px-6 py-12">
 <p className="text-sm text-[#5D0F17]/40">Loading...</p>
 </div>
 </main>
 }
 >
 <SearchResults />
 </Suspense>
 );
}
