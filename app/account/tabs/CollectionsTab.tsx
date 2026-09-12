"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Collection = { id: number; name: string; coverImage: string | null; itemCount: number };

export default function CollectionsTab({ userId: _userId }: { userId: string }) {
 const [collections, setCollections] = useState<Collection[]>([]);
 const [loading, setLoading] = useState(true);
 const [creating, setCreating] = useState(false);
 const [newName, setNewName] = useState("");
 const [showInput, setShowInput] = useState(false);

 useEffect(() => {
 fetch("/api/collections")
 .then((r) => r.json())
 .then((data) => setCollections(data.collections ?? []))
 .catch(() => {})
 .finally(() => setLoading(false));
 }, []);

 const createCollection = async () => {
 const name = newName.trim();
 if (!name) return;
 setCreating(true);
 const res = await fetch("/api/collections", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name }),
 });
 const data = await res.json();
 if (data.collection) {
 setCollections((prev) => [{ ...data.collection, itemCount: 0 }, ...prev]);
 }
 setNewName("");
 setShowInput(false);
 setCreating(false);
 };

 const deleteCollection = async (id: number) => {
 if (!confirm("Delete this collection?")) return;
 await fetch(`/api/collections/${id}`, { method: "DELETE" });
 setCollections((prev) => prev.filter((c) => c.id !== id));
 };

 if (loading) {
 return (
 <div className="grid grid-cols-2 gap-3">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="aspect-square bg-[#5D0F17]/10 animate-pulse rounded" />
 ))}
 </div>
 );
 }

 return (
 <div>
 <div className="flex items-center justify-between mb-5">
 <p className="text-sm text-[#5D0F17]/50">{collections.length} {collections.length === 1 ? "board" : "boards"}</p>
 <button
 onClick={() => setShowInput((v) => !v)}
 className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 + New
 </button>
 </div>

 {showInput && (
 <div className="flex gap-2 mb-5">
 <input
 autoFocus
 type="text"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter") createCollection(); if (e.key === "Escape") setShowInput(false); }}
 placeholder="Collection name…"
 className="flex-1 text-sm bg-transparent border-b border-[#5D0F17]/30 focus:border-[#5D0F17] outline-none py-1.5 text-[#5D0F17] placeholder:text-[#5D0F17]/30"
 />
 <button
 onClick={createCollection}
 disabled={creating || !newName.trim()}
 className="text-xs uppercase tracking-[0.15em] px-3 py-1 bg-[#5D0F17] text-[#FFFDF8] disabled:opacity-40 transition"
 >
 {creating ? "..." : "Create"}
 </button>
 </div>
 )}

 {collections.length === 0 ? (
 <div className="text-center py-12">
 <div className="w-12 h-12 mx-auto mb-4 border border-[#5D0F17]/20 flex items-center justify-center">
 <svg className="w-5 h-5 text-[#5D0F17]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
 d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
 </svg>
 </div>
 <p className="font-serif text-lg mb-1">No collections yet</p>
 <p className="text-sm text-[#5D0F17]/50 mb-6">
 Create boards to organize your saves, for every occasion.
 </p>
 <button
 onClick={() => setShowInput(true)}
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-6 py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition"
 >
 Create Collection
 </button>
 </div>
 ) : (
 <div className="grid grid-cols-2 gap-3">
 {collections.map((col) => (
 <Link key={col.id} href={`/account/collections/${col.id}`} className="group relative block">
 {/* Cover */}
 <div className="aspect-square bg-[#D8CABD]/30 overflow-hidden mb-2">
 {col.coverImage ? (
 <img src={col.coverImage} alt={col.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <svg className="w-8 h-8 text-[#5D0F17]/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
 d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
 </svg>
 </div>
 )}
 </div>
 <p className="text-sm font-medium text-[#5D0F17] truncate">{col.name}</p>
 <p className="text-[10px] text-[#5D0F17]/40 uppercase tracking-wide">{col.itemCount} {col.itemCount === 1 ? "item" : "items"}</p>

 {/* Delete button */}
 <button
 onClick={(e) => { e.preventDefault(); deleteCollection(col.id); }}
 className="absolute top-2 right-2 w-6 h-6 bg-white/80 rounded-full items-center justify-center hidden group-hover:flex transition"
 aria-label="Delete collection"
 >
 <svg className="w-3 h-3 text-[#5D0F17]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </Link>
 ))}
 </div>
 )}
 </div>
 );
}
