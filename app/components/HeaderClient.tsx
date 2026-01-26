"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Menu, X, ChevronDown } from "lucide-react";
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
  const [storesDropdownOpen, setStoresDropdownOpen] = useState(false);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);
  const [mobileStoresExpanded, setMobileStoresExpanded] = useState(false);
  const [mobileCategoriesExpanded, setMobileCategoriesExpanded] = useState(false);
  const router = useRouter();

  const storesDropdownRef = useRef<HTMLDivElement>(null);
  const categoriesDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (storesDropdownRef.current && !storesDropdownRef.current.contains(e.target as Node)) {
        setStoresDropdownOpen(false);
      }
      if (categoriesDropdownRef.current && !categoriesDropdownRef.current.contains(e.target as Node)) {
        setCategoriesDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
              {/* STORES DROPDOWN */}
              <div className="relative" ref={storesDropdownRef}>
                <button
                  onClick={() => {
                    setStoresDropdownOpen(!storesDropdownOpen);
                    setCategoriesDropdownOpen(false);
                  }}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  Stores
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${storesDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <div
                  className={`absolute left-1/2 -translate-x-1/2 top-full pt-4 transition-all duration-200 ease-out ${
                    storesDropdownOpen
                      ? 'opacity-100 visible translate-y-0'
                      : 'opacity-0 invisible -translate-y-2'
                  }`}
                >
                  <div className="bg-white text-black min-w-[220px] shadow-xl">
                    <div className="py-2">
                      {stores.map((store) => (
                        <Link
                          key={store.slug}
                          href={`/stores/${store.slug}`}
                          onClick={() => setStoresDropdownOpen(false)}
                          className="block px-6 py-3 text-sm normal-case tracking-normal hover:bg-neutral-50 transition-colors"
                        >
                          <span className="font-medium">{store.name}</span>
                          <span className="block text-xs text-neutral-500 mt-0.5">{store.location}</span>
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-neutral-100">
                      <Link
                        href="/stores"
                        onClick={() => setStoresDropdownOpen(false)}
                        className="block px-6 py-3 text-xs uppercase tracking-wide text-neutral-500 hover:text-black hover:bg-neutral-50 transition-colors"
                      >
                        View All Stores
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* CATEGORIES DROPDOWN */}
              <div className="relative" ref={categoriesDropdownRef}>
                <button
                  onClick={() => {
                    setCategoriesDropdownOpen(!categoriesDropdownOpen);
                    setStoresDropdownOpen(false);
                  }}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  Shop All
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${categoriesDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <div
                  className={`absolute left-1/2 -translate-x-1/2 top-full pt-4 transition-all duration-200 ease-out ${
                    categoriesDropdownOpen
                      ? 'opacity-100 visible translate-y-0'
                      : 'opacity-0 invisible -translate-y-2'
                  }`}
                >
                  <div className="bg-white text-black min-w-[200px] shadow-xl">
                    <div className="py-2">
                      {categories.map((cat) => (
                        <Link
                          key={cat.slug}
                          href={`/categories/${cat.slug}`}
                          onClick={() => setCategoriesDropdownOpen(false)}
                          className="block px-6 py-3 text-sm normal-case tracking-normal hover:bg-neutral-50 transition-colors"
                        >
                          {cat.label}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-neutral-100">
                      <Link
                        href="/categories"
                        onClick={() => setCategoriesDropdownOpen(false)}
                        className="block px-6 py-3 text-xs uppercase tracking-wide text-neutral-500 hover:text-black hover:bg-neutral-50 transition-colors"
                      >
                        All Categories
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <Link href="/for-stores" className="hover:text-white transition-colors normal-case">
                Partner with VIA
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
                {/* Mobile Stores Accordion */}
                <li className="border-b border-white/10">
                  <button
                    onClick={() => setMobileStoresExpanded(!mobileStoresExpanded)}
                    className="w-full flex items-center justify-between py-4 text-lg text-white"
                  >
                    Stores
                    <ChevronDown
                      size={20}
                      className={`transition-transform duration-200 ${mobileStoresExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ease-out ${
                      mobileStoresExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="pb-4 pl-4 space-y-1">
                      {stores.map((store) => (
                        <Link
                          key={store.slug}
                          href={`/stores/${store.slug}`}
                          onClick={() => setMobileMenuOpen(false)}
                          className="block py-2 text-white/70 hover:text-white transition-colors"
                        >
                          {store.name}
                        </Link>
                      ))}
                      <Link
                        href="/stores"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block py-2 text-xs uppercase tracking-wide text-white/50 hover:text-white transition-colors"
                      >
                        View All Stores
                      </Link>
                    </div>
                  </div>
                </li>

                {/* Mobile Categories Accordion */}
                <li className="border-b border-white/10">
                  <button
                    onClick={() => setMobileCategoriesExpanded(!mobileCategoriesExpanded)}
                    className="w-full flex items-center justify-between py-4 text-lg text-white"
                  >
                    Shop All
                    <ChevronDown
                      size={20}
                      className={`transition-transform duration-200 ${mobileCategoriesExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ease-out ${
                      mobileCategoriesExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="pb-4 pl-4 space-y-1">
                      {categories.map((cat) => (
                        <Link
                          key={cat.slug}
                          href={`/categories/${cat.slug}`}
                          onClick={() => setMobileMenuOpen(false)}
                          className="block py-2 text-white/70 hover:text-white transition-colors"
                        >
                          {cat.label}
                        </Link>
                      ))}
                      <Link
                        href="/categories"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block py-2 text-xs uppercase tracking-wide text-white/50 hover:text-white transition-colors"
                      >
                        All Categories
                      </Link>
                    </div>
                  </div>
                </li>
              </ul>

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
              placeholder="Search items or stores..."
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
