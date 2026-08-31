"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { stores } from "@/app/lib/stores";
import { COLLECTIONS } from "@/app/lib/collections-config";

type Collection = (typeof COLLECTIONS)[number];

// Not a public collection — curating this list sets exactly which pieces go in
// the weekly New Arrivals email (leave it empty for automatic selection).
const EMAIL_PICKS_COLLECTION = {
 slug: "new-arrivals-email",
 name: "📧 New Arrivals Email",
 curatedBy: "",
 href: null,
 description: "Pick the pieces for the weekly New Arrivals email. Leave empty for automatic selection.",
} as unknown as Collection;

type Product = {
 id: number;
 storeSlug: string;
 storeName: string;
 title: string;
 price: number;
 image: string | null;
};

type Pick = {
 pickId: number;
 position: number;
 product: Product & { images: string | null; size: string | null; externalUrl: string | null };
};

export default function CollectionsAdminPage() {
 const router = useRouter();
 const [activeCollection, setActiveCollection] = useState<Collection>(COLLECTIONS[0]);
 const [picks, setPicks] = useState<Pick[]>([]);
 const [products, setProducts] = useState<Product[]>([]);
 const [storeFilter, setStoreFilter] = useState("");
 const [query, setQuery] = useState("");
 const [loadingPicks, setLoadingPicks] = useState(true);
 const [loadingProducts, setLoadingProducts] = useState(false);
 const [toggling, setToggling] = useState<number | null>(null);
 const [activeSlugs, setActiveSlugs] = useState<Set<string> | null>(null);
 const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 // Weekly New Arrivals subject line — stored server-side so it can change every week
 // without a deploy.
 const [subject, setSubject] = useState("");
 const [subjectSaved, setSubjectSaved] = useState("");
 const [subjectSaving, setSubjectSaving] = useState(false);
 const [subjectError, setSubjectError] = useState<string | null>(null);

 // User likes import
 const [likesEmail, setLikesEmail] = useState("");
 const [likesProducts, setLikesProducts] = useState<Product[]>([]);
 const [likesLoading, setLikesLoading] = useState(false);
 const [likesError, setLikesError] = useState<string | null>(null);
 const [bulkAdding, setBulkAdding] = useState(false);

 // User collection import
 const [colEmail, setColEmail] = useState("");
 const [userCollections, setUserCollections] = useState<{ id: number; name: string; itemCount: number }[] | null>(null);
 const [colLoading, setColLoading] = useState(false);
 const [colError, setColError] = useState<string | null>(null);
 const [importingId, setImportingId] = useState<number | null>(null);
 const [importResult, setImportResult] = useState<string | null>(null);

 useEffect(() => {
 fetch("/api/admin/editors-picks?active=true")
 .then((r) => r.json())
 .then((d) => setActiveSlugs(new Set(d.slugs ?? [])))
 .catch(() => setActiveSlugs(new Set()));
 }, []);

 useEffect(() => {
 fetch("/api/admin/email-subject")
 .then((r) => (r.ok ? r.json() : null))
 .then((d) => {
 if (!d?.subject) return;
 setSubject(d.subject);
 setSubjectSaved(d.subject);
 })
 .catch(() => {});
 }, []);

 const saveSubject = useCallback(async () => {
 const value = subject.trim();
 if (!value || value === subjectSaved) return;
 setSubjectSaving(true);
 setSubjectError(null);
 try {
 const res = await fetch("/api/admin/email-subject", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ subject: value }),
 });
 const data = await res.json().catch(() => null);
 if (!res.ok) throw new Error(data?.error || "Could not save");
 setSubjectSaved(data.subject);
 setSubject(data.subject);
 } catch (e) {
 setSubjectError(e instanceof Error ? e.message : "Could not save");
 } finally {
 setSubjectSaving(false);
 }
 }, [subject, subjectSaved]);

 const loadPicks = useCallback(async (collectionSlug: string) => {
 setLoadingPicks(true);
 try {
 const res = await fetch(`/api/admin/editors-picks?collection=${collectionSlug}`);
 if (res.status === 401) {
 router.replace("/admin/login?redirect=/admin/collections");
 return;
 }
 const data = await res.json();
 setPicks(data.picks ?? []);
 } finally {
 setLoadingPicks(false);
 }
 }, [router]);

 useEffect(() => {
 loadPicks(activeCollection.slug);
 setQuery("");
 setStoreFilter("");
 }, [activeCollection, loadPicks]);

 useEffect(() => {
 if (searchTimer.current) clearTimeout(searchTimer.current);

 const doLoad = async () => {
 setLoadingProducts(true);
 try {
 const params = new URLSearchParams();
 if (query.trim()) params.set("q", query.trim());
 if (storeFilter) params.set("store", storeFilter);
 const res = await fetch(`/api/admin/editors-picks/search?${params}`);
 if (res.ok) {
 const data = await res.json();
 setProducts(data.products ?? []);
 }
 } finally {
 setLoadingProducts(false);
 }
 };

 if (query.trim()) {
 searchTimer.current = setTimeout(doLoad, 250);
 } else {
 doLoad();
 }

 return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
 }, [query, storeFilter]);

 const pickedIds = new Set(picks.map((p) => p.product.id));

 const handleToggle = async (product: Product) => {
 if (toggling === product.id) return;
 setToggling(product.id);
 try {
 if (pickedIds.has(product.id)) {
 const res = await fetch("/api/admin/editors-picks", {
 method: "DELETE",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ productId: product.id, collectionSlug: activeCollection.slug }),
 });
 if (!res.ok) {
 const d = await res.json();
 alert(d.error ?? "Failed to remove");
 return;
 }
 } else {
 const res = await fetch("/api/admin/editors-picks", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ productId: product.id, collectionSlug: activeCollection.slug }),
 });
 if (!res.ok) {
 const d = await res.json();
 alert(d.error ?? "Failed to add");
 return;
 }
 }
 await loadPicks(activeCollection.slug);
 } finally {
 setToggling(null);
 }
 };

 const handleLikesLoad = async () => {
 if (!likesEmail.trim()) return;
 setLikesLoading(true);
 setLikesError(null);
 setLikesProducts([]);
 try {
 const res = await fetch(`/api/admin/user-favorites?email=${encodeURIComponent(likesEmail.trim())}`);
 if (res.status === 404) { setLikesError("No user found with that email."); return; }
 if (!res.ok) { setLikesError("Failed to load favorites."); return; }
 const data = await res.json();
 setLikesProducts(data.products ?? []);
 if ((data.products ?? []).length === 0) setLikesError("This user has no saved items.");
 } catch {
 setLikesError("Failed to load favorites.");
 } finally {
 setLikesLoading(false);
 }
 };

 const handleBulkAdd = async () => {
 if (likesProducts.length === 0 || bulkAdding) return;
 const toAdd = likesProducts.filter((p) => !pickedIds.has(p.id));
 if (toAdd.length === 0) { alert("All items are already in this collection."); return; }
 setBulkAdding(true);
 try {
 for (const product of toAdd) {
 await fetch("/api/admin/editors-picks", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ productId: product.id, collectionSlug: activeCollection.slug }),
 });
 }
 await loadPicks(activeCollection.slug);
 } finally {
 setBulkAdding(false);
 }
 };

 const handleLoadUserCollections = async () => {
 if (!colEmail.trim()) return;
 setColLoading(true);
 setColError(null);
 setUserCollections(null);
 setImportResult(null);
 try {
 const res = await fetch(`/api/admin/import-user-collection?email=${encodeURIComponent(colEmail.trim())}`);
 if (res.status === 404) { setColError("No user found with that email."); return; }
 if (!res.ok) { setColError("Failed to load collections."); return; }
 const data = await res.json();
 setUserCollections(data.collections ?? []);
 if ((data.collections ?? []).length === 0) setColError("This user has no collections.");
 } catch {
 setColError("Failed to load collections.");
 } finally {
 setColLoading(false);
 }
 };

 const handleImportCollection = async (sourceCollectionId: number) => {
 if (importingId !== null) return;
 setImportingId(sourceCollectionId);
 setImportResult(null);
 try {
 const res = await fetch("/api/admin/import-user-collection", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email: colEmail.trim(), targetSlug: activeCollection.slug, sourceCollectionId }),
 });
 const data = await res.json();
 if (!res.ok) { setImportResult(data.error ?? "Import failed."); return; }
 setImportResult(`Added ${data.added} of ${data.found} item${data.found !== 1 ? "s" : ""} to ${activeCollection.name}${data.missing ? ` (${data.missing} no longer in catalog)` : ""}.`);
 await loadPicks(activeCollection.slug);
 } catch {
 setImportResult("Import failed.");
 } finally {
 setImportingId(null);
 }
 };

 return (
 <main style={{ minHeight: "100vh", background: "#f8f9fa" }}>

 {/* Page title */}
 <section style={{ background: "#fff", borderBottom: "1px solid #e4e4e7" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 0" }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
 <div>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", marginBottom: 4 }}>
 Collections
 </h1>
 <p style={{ fontSize: 14, color: "#71717a" }}>
 {activeCollection.slug === EMAIL_PICKS_COLLECTION.slug
 ? "Pick the pieces for the weekly New Arrivals email. Leave empty for automatic selection."
 : "Curate picks for each collection shown on the homepage."}
 </p>
 </div>
 <span style={{ fontSize: 14, color: "#09090b", fontWeight: 600 }}>
 {loadingPicks ? "…" : picks.length} selected
 </span>
 </div>

 {activeCollection.slug === EMAIL_PICKS_COLLECTION.slug && (
 <div style={{ marginBottom: 24, padding: 16, background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8 }}>
 <label htmlFor="na-subject" style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: 8 }}>
 Subject line
 </label>
 <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
 <input
 id="na-subject"
 value={subject}
 onChange={(e) => setSubject(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter") saveSubject(); }}
 maxLength={120}
 placeholder="Just in"
 style={{ flex: "1 1 320px", padding: "9px 12px", fontSize: 14, border: "1px solid #d4d4d8", borderRadius: 6, color: "#09090b" }}
 />
 <button
 onClick={saveSubject}
 disabled={subjectSaving || !subject.trim() || subject.trim() === subjectSaved}
 style={{
 padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", color: "#fff",
 background: subjectSaving || !subject.trim() || subject.trim() === subjectSaved ? "#a1a1aa" : "#09090b",
 cursor: subjectSaving || !subject.trim() || subject.trim() === subjectSaved ? "default" : "pointer",
 }}
 >
 {subjectSaving ? "Saving…" : subject.trim() === subjectSaved ? "Saved" : "Save"}
 </button>
 </div>
 <p style={{ fontSize: 12, color: "#71717a", marginTop: 8 }}>
 {subjectError
 ? subjectError
 : "Used by the next send. The email shows the first 8 picks, two across."}
 </p>
 </div>
 )}

 {/* Collection tabs — show EVERY collection so empty ones can be curated. A dot marks the
   ones that already have items (from activeSlugs). */}
 <div style={{ display: "flex", gap: 0, borderTop: "1px solid #e4e4e7", overflowX: "auto" }}>
 {[EMAIL_PICKS_COLLECTION, ...COLLECTIONS].map((col) => (
 <button
 key={col.slug}
 onClick={() => setActiveCollection(col)}
 style={{
 padding: "12px 20px",
 fontSize: 12,
 textTransform: "uppercase",
 letterSpacing: "0.1em",
 background: "none",
 border: "none",
 borderBottom: activeCollection.slug === col.slug ? "2px solid #09090b" : "2px solid transparent",
 color: activeCollection.slug === col.slug ? "#09090b" : "#71717a",
 cursor: "pointer",
 whiteSpace: "nowrap",
 transition: "all 0.15s",
 }}
 >
 {col.name}
 {activeSlugs?.has(col.slug) && <span style={{ marginLeft: 5, color: "#16a34a" }} title="Has items">•</span>}
 {col.curatedBy && (
 <span style={{ fontSize: 9, marginLeft: 6, color: "#a1a1aa", textTransform: "none", letterSpacing: 0 }}>
 by {col.curatedBy}
 </span>
 )}
 </button>
 ))}
 </div>
 </div>
 </section>

 {/* Content */}
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>

 {/* Selected strip */}
 {!loadingPicks && picks.length > 0 && (
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 24 }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 12 }}>
 Current Selections — {activeCollection.name} · click any item to remove
 </p>
 <div className="flex flex-wrap gap-2">
 {picks.map((pick) => {
 const isRemoving = toggling === pick.product.id;
 return (
 <div
 key={pick.pickId}
 className="relative group cursor-pointer"
 onClick={() => handleToggle(pick.product)}
 title={`Remove: ${pick.product.title}`}
 >
 <div className={`w-16 h-20 bg-[#f4f4f5] overflow-hidden transition-opacity ${isRemoving ? "opacity-40" : ""}`}>
 {pick.product.image
 ? <img src={pick.product.image} alt="" className="w-full h-full object-cover" />
 : <div className="w-full h-full" />
 }
 </div>
 {/* Always-visible × button */}
 <button
 className="absolute top-1 right-1 w-5 h-5 bg-[#18181b] text-white text-[11px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
 onClick={(e) => { e.stopPropagation(); handleToggle(pick.product); }}
 tabIndex={-1}
 >
 ×
 </button>
 {/* Position badge */}
 <div className="absolute top-1 left-1 w-4 h-4 bg-[#18181b] flex items-center justify-center group-hover:opacity-0 transition-opacity">
 <span className="text-white text-[9px] leading-none">{pick.position + 1}</span>
 </div>
 {/* Hover overlay */}
 <div className="absolute inset-0 bg-[#09090b]/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
 <span className="text-white text-[10px] uppercase tracking-wide">Remove</span>
 </div>
 {isRemoving && (
 <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
 <div className="w-3 h-3 border-2 border-[#18181b] border-t-transparent rounded-full animate-spin" />
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* From User Collection — import a user's own saved collection into this VYA collection */}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 24 }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 4 }}>
 From User Collection
 </p>
 <p style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>
 Pull the products from a user&apos;s personal collection into <strong>{activeCollection.name}</strong>.
 </p>
 <div className="flex gap-3 mb-3">
 <input
 type="email"
 value={colEmail}
 onChange={(e) => { setColEmail(e.target.value); setUserCollections(null); setColError(null); setImportResult(null); }}
 onKeyDown={(e) => e.key === "Enter" && handleLoadUserCollections()}
 placeholder="user@example.com"
 className="flex-1 px-4 py-2.5 text-sm outline-none"
 style={{ border: "1px solid #e4e4e7", borderRadius: 6, background: "#fff", color: "#09090b" }}
 />
 <button
 onClick={handleLoadUserCollections}
 disabled={colLoading || !colEmail.trim()}
 className="px-5 py-2.5 text-sm uppercase tracking-wider transition-colors"
 style={{ background: "#18181b", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 500, opacity: colLoading || !colEmail.trim() ? 0.5 : 1, border: "none", cursor: "pointer" }}
 >
 {colLoading ? "Loading…" : "Load collections"}
 </button>
 </div>
 {colError && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{colError}</p>}
 {importResult && <p style={{ fontSize: 12, color: "#15803d", marginBottom: 8 }}>{importResult}</p>}
 {userCollections && userCollections.length > 0 && (
 <div className="flex flex-wrap gap-2">
 {userCollections.map((c) => (
 <button
 key={c.id}
 onClick={() => handleImportCollection(c.id)}
 disabled={importingId !== null}
 className="px-4 py-2 text-sm transition-colors"
 style={{ border: "1px solid #e4e4e7", borderRadius: 6, background: importingId === c.id ? "#18181b" : "#fff", color: importingId === c.id ? "#fff" : "#09090b", cursor: importingId !== null ? "default" : "pointer", opacity: importingId !== null && importingId !== c.id ? 0.5 : 1 }}
 >
 {importingId === c.id ? "Importing…" : (
 <>
  {c.name} <span style={{ color: importingId === c.id ? "#d4d4d8" : "#a1a1aa", fontSize: 12 }}>· {c.itemCount} item{c.itemCount !== 1 ? "s" : ""} · import →</span>
 </>
 )}
 </button>
 ))}
 </div>
 )}
 </div>

 {/* From User Likes */}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 24 }}>
 <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 12 }}>
 From User Likes
 </p>
 <div className="flex gap-3 mb-3">
 <input
 type="email"
 value={likesEmail}
 onChange={(e) => { setLikesEmail(e.target.value); setLikesProducts([]); setLikesError(null); }}
 onKeyDown={(e) => e.key === "Enter" && handleLikesLoad()}
 placeholder="user@example.com"
 className="flex-1 px-4 py-2.5 text-sm outline-none"
 style={{ border: "1px solid #e4e4e7", borderRadius: 6, background: "#fff", color: "#09090b" }}
 />
 <button
 onClick={handleLikesLoad}
 disabled={likesLoading || !likesEmail.trim()}
 className="px-5 py-2.5 text-sm uppercase tracking-wider transition-colors"
 style={{ background: "#18181b", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 500, opacity: likesLoading || !likesEmail.trim() ? 0.5 : 1, border: "none", cursor: "pointer" }}
 >
 {likesLoading ? "Loading…" : "Load"}
 </button>
 </div>
 {likesError && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{likesError}</p>}
 {likesProducts.length > 0 && (
 <>
 <div className="flex items-center justify-between mb-3">
 <p style={{ fontSize: 12, color: "#71717a" }}>
 {likesProducts.length} saved item{likesProducts.length !== 1 ? "s" : ""} · {likesProducts.filter(p => !pickedIds.has(p.id)).length} not yet in collection
 </p>
 <button
 onClick={handleBulkAdd}
 disabled={bulkAdding || likesProducts.every(p => pickedIds.has(p.id))}
 className="px-4 py-1.5 text-xs uppercase tracking-wider transition-colors"
 style={{ background: "#18181b", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 500, opacity: bulkAdding || likesProducts.every(p => pickedIds.has(p.id)) ? 0.5 : 1, border: "none", cursor: "pointer" }}
 >
 {bulkAdding ? "Adding…" : `Add All (${likesProducts.filter(p => !pickedIds.has(p.id)).length})`}
 </button>
 </div>
 <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
 {likesProducts.map((product) => {
 const isPicked = pickedIds.has(product.id);
 const isToggling = toggling === product.id;
 return (
 <button
 key={product.id}
 onClick={() => handleToggle(product)}
 disabled={isToggling}
 className="relative text-left group transition cursor-pointer"
 >
 <div className={`relative w-full aspect-[3/4] overflow-hidden ${isPicked ? "ring-2 ring-[#18181b]" : ""}`}>
 {product.image
 ? <img src={product.image} alt="" className="w-full h-full object-cover" />
 : <div className="w-full h-full bg-[#f4f4f5]" />
 }
 {isPicked && (
 <div className="absolute inset-0 bg-[#09090b]/10 group-hover:bg-[#09090b]/30 transition-colors flex items-center justify-center">
 <div className="w-5 h-5 bg-[#18181b] flex items-center justify-center opacity-80 group-hover:hidden">
 <span className="text-white text-xs">✓</span>
 </div>
 <span className="hidden group-hover:inline text-white text-[9px] uppercase tracking-wide bg-[#18181b] px-1.5 py-0.5">Remove</span>
 </div>
 )}
 {!isPicked && (
 <div className="absolute inset-0 bg-[#09090b]/0 group-hover:bg-[#09090b]/20 transition-colors flex items-center justify-center">
 <span className="opacity-0 group-hover:opacity-100 text-white text-[9px] uppercase tracking-wide bg-[#18181b] px-1.5 py-0.5 transition-opacity">+ Add</span>
 </div>
 )}
 {isToggling && (
 <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
 <div className="w-3 h-3 border-2 border-[#18181b] border-t-transparent rounded-full animate-spin" />
 </div>
 )}
 </div>
 <p className="text-[9px] leading-snug text-[#09090b] mt-1 line-clamp-1">{product.title}</p>
 </button>
 );
 })}
 </div>
 </>
 )}
 </div>

 {/* Filters */}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 24 }}>
 <div className="flex gap-3">
 <select
 value={storeFilter}
 onChange={(e) => { setStoreFilter(e.target.value); setQuery(""); }}
 className="px-4 py-2.5 text-sm outline-none"
 style={{ border: "1px solid #e4e4e7", borderRadius: 6, background: "#fff", color: "#09090b" }}
 >
 <option value="">All Stores</option>
 {stores.map((s) => (
 <option key={s.slug} value={s.slug}>{s.name}</option>
 ))}
 </select>
 <input
 type="text"
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 placeholder="Filter by name…"
 className="flex-1 px-4 py-2.5 text-sm outline-none"
 style={{ border: "1px solid #e4e4e7", borderRadius: 6, background: "#fff", color: "#09090b" }}
 />
 </div>
 </div>

 {/* Product grid */}
 {loadingProducts ? (
 <p style={{ fontSize: 13, color: "#a1a1aa" }}>Loading products…</p>
 ) : products.length === 0 ? (
 <p style={{ fontSize: 13, color: "#a1a1aa" }}>No products found.</p>
 ) : (
 <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
 {products.map((product) => {
 const isPicked = pickedIds.has(product.id);
 const isToggling = toggling === product.id;

 return (
 <button
 key={product.id}
 onClick={() => handleToggle(product)}
 disabled={isToggling}
 className="relative text-left group transition cursor-pointer"
 >
 <div className={`relative w-full aspect-[3/4] overflow-hidden ${isPicked ? "ring-2 ring-[#18181b]" : ""}`}>
 {product.image
 ? <img src={product.image} alt="" className="w-full h-full object-cover" />
 : <div className="w-full h-full bg-[#f4f4f5]" />
 }

 {!isPicked && (
 <div className="absolute inset-0 bg-[#09090b]/0 group-hover:bg-[#09090b]/20 transition-colors flex items-center justify-center">
 <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] uppercase tracking-wide transition-opacity bg-[#18181b] px-2 py-1">
 + Pick
 </span>
 </div>
 )}

 {isPicked && (
 <div className="absolute inset-0 bg-[#09090b]/10 group-hover:bg-[#09090b]/30 transition-colors flex items-center justify-center">
 <div className="w-7 h-7 bg-[#18181b] flex items-center justify-center opacity-80 group-hover:hidden">
 <span className="text-white text-sm">✓</span>
 </div>
 <span className="hidden group-hover:inline text-white text-[10px] uppercase tracking-wide bg-[#18181b] px-2 py-1">
 Remove
 </span>
 </div>
 )}

 {isToggling && (
 <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
 <div className="w-4 h-4 border-2 border-[#18181b] border-t-transparent rounded-full animate-spin" />
 </div>
 )}
 </div>

 <div className="pt-1.5">
 <p className="text-[10px] leading-snug text-[#09090b] line-clamp-2">{product.title}</p>
 <p className="text-[9px] text-[#71717a] mt-0.5">${Math.round(product.price)}</p>
 </div>
 </button>
 );
 })}
 </div>
 )}
 </div>
 </main>
 );
}
