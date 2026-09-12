"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/app/components/ProductCard";
import { categoryMap } from "@/app/lib/categoryMap";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { formatPrice } from "@/app/lib/formatPrice";

type CollectionItem = {
 id: number;
 productId: number;
 snapshot: {
 title?: string;
 price?: number;
 image?: string;
 images?: string[];
 store?: string;
 storeSlug?: string;
 } | null;
};

export default function CollectionDetailPage() {
 const params = useParams();
 const collectionId = params.id as string;

 const [items, setItems] = useState<CollectionItem[]>([]);
 const [collectionName, setCollectionName] = useState("");
 const [loading, setLoading] = useState(true);
 const [editing, setEditing] = useState(false);
 const [newName, setNewName] = useState("");

 useEffect(() => {
 // Get collection name from parent list
 fetch("/api/collections")
 .then((r) => r.json())
 .then((data) => {
 const col = (data.collections ?? []).find((c: { id: number; name: string }) => c.id === parseInt(collectionId));
 if (col) { setCollectionName(col.name); setNewName(col.name); }
 });

 fetch(`/api/collections/${collectionId}/items`)
 .then((r) => r.json())
 .then((data) => setItems(data.items ?? []))
 .catch(() => {})
 .finally(() => setLoading(false));
 }, [collectionId]);

 const removeItem = async (productId: number) => {
 await fetch(`/api/collections/${collectionId}/items/${productId}`, { method: "DELETE" });
 setItems((prev) => prev.filter((i) => i.productId !== productId));
 };

 const rename = async () => {
 if (!newName.trim()) return;
 await fetch(`/api/collections/${collectionId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name: newName.trim() }),
 });
 setCollectionName(newName.trim());
 setEditing(false);
 };

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-2xl mx-auto px-6 py-8">
 <Link href="/account" className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/40 hover:text-[#5D0F17] transition mb-6 inline-block">
 ← Account
 </Link>

 <div className="flex items-center gap-3 mb-8">
 {editing ? (
 <div className="flex gap-2 flex-1">
 <input
 autoFocus
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEditing(false); }}
 className="flex-1 text-2xl font-serif bg-transparent border-b border-[#5D0F17]/30 focus:border-[#5D0F17] outline-none"
 />
 <button onClick={rename} className="text-xs uppercase tracking-wide px-3 py-1 bg-[#5D0F17] text-[#FFFDF8]">Save</button>
 <button onClick={() => setEditing(false)} className="text-xs uppercase tracking-wide px-3 py-1 border border-[#5D0F17]/30">Cancel</button>
 </div>
 ) : (
 <>
 <h1 className="text-2xl font-serif flex-1">{collectionName || "Collection"}</h1>
 <button
 onClick={() => setEditing(true)}
 className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/40 hover:text-[#5D0F17] transition"
 >
 Rename
 </button>
 </>
 )}
 </div>

 {loading ? (
 <div className="grid grid-cols-2 gap-3">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="aspect-[3/4] bg-[#5D0F17]/10 animate-pulse rounded" />
 ))}
 </div>
 ) : items.length === 0 ? (
 <div className="text-center py-16">
 <p className="font-serif text-lg mb-2">This collection is empty</p>
 <p className="text-sm text-[#5D0F17]/50 mb-6">Save products here from any product page.</p>
 <Link href="/categories" className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-6 py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition">
 Browse Products
 </Link>
 </div>
 ) : (
 <div>
 <p className="text-sm text-[#5D0F17]/50 mb-5">{items.length} {items.length === 1 ? "item" : "items"}</p>
 <div className="grid grid-cols-2 gap-3">
 {items.map((item) => {
 const snap = item.snapshot;
 const title = snap?.title ?? "Unknown";
 const storeSlug = snap?.storeSlug ?? "unknown";
 const compositeId = `${storeSlug}-${item.productId}`;
 const categorySlug = inferCategoryFromTitle(title);
 const categoryLabel = categoryMap[categorySlug];
 const images = snap?.images ?? (snap?.image ? [snap.image] : []);

 return (
 <div key={item.id} className="relative group">
 <ProductCard
 id={compositeId}
 dbId={item.productId}
 name={title}
 price={snap?.price ? formatPrice(snap.price) : "-"}
 category={categoryLabel}
 storeName={snap?.store ?? storeSlug}
 storeSlug={storeSlug}
 image={snap?.image ?? ""}
 images={images}
 from={`/account/collections/${collectionId}`}
 />
 <button
 onClick={() => removeItem(item.productId)}
 className="absolute top-2 left-2 z-40 w-6 h-6 bg-white/80 rounded-full items-center justify-center hidden group-hover:flex transition"
 aria-label="Remove from collection"
 >
 <svg className="w-3 h-3 text-[#5D0F17]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 </main>
 );
}
