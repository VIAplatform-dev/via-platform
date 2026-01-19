"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { products } from "../stores/productData";
import { stores } from "../stores/storeData";

const categories = [
  { slug: "clothes", label: "Clothing" },
  { slug: "bags", label: "Bags" },
  { slug: "shoes", label: "Shoes" },
  { slug: "accessories", label: "Accessories" },
];

type SearchResult =
  | { type: "store"; name: string; href: string }
  | { type: "product"; name: string; href: string; meta: string };

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();

  // -----------------------------
  // SEARCH LOGIC
  // -----------------------------
  const results: SearchResult[] = useMemo(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase();

    const storeResults = stores
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((s) => ({
        type: "store" as const,
        name: s.name,
        href: `/stores/${s.slug}`,
      }));

    const productResults = products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({
        type: "product" as const,
        name: p.name,
        href: `/stores/${p.storeSlug}`,
        meta: p.category,
      }));

    return [...storeResults, ...productResults];
  }, [query]);

  // -----------------------------
  // KEYBOARD NAV
  // -----------------------------
  useEffect(() => {
    if (!searchOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }

      if (e.key === "Enter" && results[activeIndex]) {
        setSearchOpen(false);
        router.push(results[activeIndex].href);
      }      
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, results, activeIndex]);

  // Reset state when closing
  useEffect(() => {
    if (!searchOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [searchOpen]);

  return (
    <>
      {/* HEADER */}
      <header className="fixed top-0 z-50 w-full bg-black">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">

          {/* LOGO */}
          <Link href="/" className="flex items-center">
            <Image
              src="/via-logo-white.png"
              alt="VIA"
              width={72}
              height={28}
              priority
            />
          </Link>

          {/* NAV + SEARCH */}
          <div className="flex items-center gap-10">
          <nav className="hidden md:flex items-center gap-10 text-sm uppercase tracking-wide text-white/80">

{/* STORES DROPDOWN */}
<div className="relative group">
  <Link
    href="/stores"
    className="hover:text-white transition"
  >
    Stores
  </Link>

  <div className="absolute left-0 top-full pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition">
  <div className="bg-white text-black w-72 px-6 py-5 shadow-xl pointer-events-auto">
      <ul className="space-y-3">
        {stores.map((store) => (
          <li key={store.slug}>
            <Link
  href={`/stores/${store.slug}`}
  className="grid grid-cols-[1fr_auto] gap-6 items-baseline text-sm hover:underline underline-offset-4"
>

              <span>{store.name}</span>
              <span className="text-xs text-neutral-400">
                {store.location}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/stores"
        className="block mt-5 text-xs uppercase tracking-wide text-neutral-500 hover:text-black"
      >
        View all stores
      </Link>
    </div>
  </div>
</div>

{/* CATEGORIES DROPDOWN */}
<div className="relative group">
  <Link
    href="/categories"
    className="hover:text-white transition"
  >
    Categories
  </Link>

  <div className="absolute left-0 top-full pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition">
    <div className="bg-white text-black w-56 px-6 py-5 shadow-xl">
      <ul className="space-y-3">
        {categories.map((cat) => (
          <li key={cat.slug}>
            <Link
              href={`/categories/${cat.slug}`}
              className="text-sm hover:underline underline-offset-4"
            >
              {cat.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  </div>
</div>

{/* STATIC LINK */}
<Link
  href="/for-stores"
  className="hover:text-white transition"
>
  Partner With VIA
</Link>
</nav>

            <button
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="p-2 text-white hover:opacity-70 transition"
            >
              <Search size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* SEARCH OVERLAY (DESKTOP + MOBILE) */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center md:pt-24">
          <div className="bg-white w-full h-full md:h-auto md:max-w-2xl md:mx-6 p-6 relative shadow-lg">

            {/* CLOSE */}
            <button
              onClick={() => setSearchOpen(false)}
              className="absolute top-4 right-4 text-xs uppercase tracking-wide"
            >
              Close
            </button>

            {/* INPUT */}
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items, stores, categories…"
              className="w-full border-b border-black pb-3 text-lg outline-none"
            />

            {/* RESULTS */}
            <div className="mt-6 space-y-1">
              {results.length === 0 && query && (
                <p className="text-sm text-gray-500">
                  No results found.
                </p>
              )}

              {results.map((r, i) => (
                <button
                key={`${r.type}-${i}`}
                onClick={() => {
                  setSearchOpen(false);
                  router.push(r.href);
                }}
                className={`w-full text-left block px-3 py-2 rounded ${
                  i === activeIndex
                    ? "bg-black text-white"
                    : "hover:bg-gray-100"
                }`}
              >              
                  <div className="flex justify-between items-center">
                    <span>{r.name}</span>
                    {r.type === "product" && (
                      <span className="text-xs opacity-70">
                        {r.meta}
                      </span>
                    )}
                  </div>

                  <p className="text-xs opacity-70 uppercase mt-1">
                    {r.type === "store" ? "Store" : "Product"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
