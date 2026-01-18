"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { products } from "../stores/productData";
import { stores } from "../stores/storeData";

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
              <Link href="/stores" className="hover:text-white transition">
                Stores
              </Link>
              <Link href="/categories" className="hover:text-white transition">
                Categories
              </Link>
              <Link href="/for-stores" className="hover:text-white transition">
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
