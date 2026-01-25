"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { stores } from "@/app/lib/stores";
import { products } from "@/app/stores/productData";

type Category = {
  slug: string;
  label: string;
};

type SearchResult =
  | { type: "store"; name: string; href: string }
  | { type: "product"; name: string; href: string; meta: string };

export default function HeaderClient({
  categories,
}: {
  categories: { slug: string; label: string }[];
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();

  // Close mobile menu on route change or resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // -----------------------------
  // SEARCH RESULTS
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
  }, [searchOpen, results, activeIndex, router]);

  useEffect(() => {
    if (!searchOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [searchOpen]);

  return (
    <>
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

          <div className="flex items-center gap-4 md:gap-10">
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-10 text-sm uppercase tracking-wide text-white/80">
              <Link href="/browse" className="hover:text-white">
                Browse
              </Link>

              <Link href="/stores" className="hover:text-white">
                Stores
              </Link>

              {/* CATEGORIES */}
              <div className="relative group">
                <Link href="/categories" className="hover:text-white">
                  Categories
                </Link>

                <div className="absolute left-0 top-full pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition">
                  <div className="bg-white text-black w-56 px-6 py-5 shadow-xl">
                    <ul className="space-y-3">
                      {categories.map((cat) => (
                        <li key={cat.slug}>
                          <Link
                            href={`/categories/${cat.slug}`}
                            className="text-sm hover:underline"
                          >
                            {cat.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <Link href="/for-stores" className="hover:text-white">
                Partner With VIA
              </Link>
            </nav>

            {/* Search Button */}
            <button
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="p-2 text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Search size={20} />
            </button>

            {/* Mobile Menu Button */}
            <button
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Menu Panel */}
          <nav className="absolute top-20 left-0 right-0 bottom-0 bg-black overflow-y-auto">
            <div className="px-6 py-8">
              {/* Main Links */}
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/browse"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block py-4 text-lg text-white border-b border-white/10"
                  >
                    Browse All
                  </Link>
                </li>
                <li>
                  <Link
                    href="/stores"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block py-4 text-lg text-white border-b border-white/10"
                  >
                    Stores
                  </Link>
                </li>
                <li>
                  <Link
                    href="/categories"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block py-4 text-lg text-white border-b border-white/10"
                  >
                    All Categories
                  </Link>
                </li>
              </ul>

              {/* Category Links */}
              <div className="mt-8">
                <p className="text-xs uppercase tracking-[0.25em] text-white/50 mb-4">
                  Shop by Category
                </p>
                <ul className="space-y-1">
                  {categories.map((cat) => (
                    <li key={cat.slug}>
                      <Link
                        href={`/categories/${cat.slug}`}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block py-3 text-white/80 hover:text-white"
                      >
                        {cat.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Partner Link */}
              <div className="mt-8 pt-8 border-t border-white/10">
                <Link
                  href="/for-stores"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-3 text-white/80 hover:text-white"
                >
                  Partner With VIA
                </Link>
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* SEARCH OVERLAY */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center md:pt-24">
          <div className="bg-white w-full h-full md:h-auto md:max-w-2xl p-6 relative">
            <button
              onClick={() => setSearchOpen(false)}
              className="absolute top-4 right-4 text-xs uppercase"
            >
              Close
            </button>

            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items or stores…"
              className="w-full border-b border-black pb-3 text-lg outline-none"
            />

            <div className="mt-6">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSearchOpen(false);
                    router.push(r.href);
                  }}
                  className={`w-full text-left px-3 py-2 rounded ${
                    i === activeIndex
                      ? "bg-black text-white"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <div className="flex justify-between">
                    <span>{r.name}</span>
                    {r.type === "product" && (
                      <span className="text-xs opacity-70">{r.meta}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
