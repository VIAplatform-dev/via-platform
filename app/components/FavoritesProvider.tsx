"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

type FavoritesContextType = {
 productIds: Set<number>;
 storeSlugs: Set<string>;
 isProductFavorited: (productId: number) => boolean;
 isStoreFavorited: (storeSlug: string) => boolean;
 toggleProduct: (productId: number) => Promise<void>;
 toggleStore: (storeSlug: string) => Promise<void>;
 loaded: boolean;
};

const FavoritesContext = createContext<FavoritesContextType>({
 productIds: new Set(),
 storeSlugs: new Set(),
 isProductFavorited: () => false,
 isStoreFavorited: () => false,
 toggleProduct: async () => {},
 toggleStore: async () => {},
 loaded: false,
});

export function useFavorites() {
 return useContext(FavoritesContext);
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
 const { data: session } = useSession();
 const [productIds, setProductIds] = useState<Set<number>>(new Set());
 const [storeSlugs, setStoreSlugs] = useState<Set<string>>(new Set());
 const [loaded, setLoaded] = useState(false);

 const fetchFavorites = useCallback(async () => {
 if (!session?.user) return;
 try {
 const [prodRes, storeRes] = await Promise.all([
 fetch("/api/favorites/product"),
 fetch("/api/favorites/store"),
 ]);
 if (prodRes.ok) {
 const data = await prodRes.json();
 setProductIds(new Set(data.productIds));
 }
 if (storeRes.ok) {
 const data = await storeRes.json();
 setStoreSlugs(new Set(data.storeSlugs));
 }
 } catch {
 // Silently fail: favorites just won't show
 } finally {
 setLoaded(true);
 }
 }, [session?.user]);

 // Fetch on sign-in
 useEffect(() => {
 if (!session?.user) {
 setProductIds(new Set());
 setStoreSlugs(new Set());
 setLoaded(false);
 return;
 }
 fetchFavorites();
 }, [session?.user, fetchFavorites]);

 // Re-sync when the tab regains focus. Keeps state fresh across tabs/sessions
 useEffect(() => {
 const handleFocus = () => { if (session?.user) fetchFavorites(); };
 document.addEventListener("visibilitychange", handleFocus);
 return () => document.removeEventListener("visibilitychange", handleFocus);
 }, [session?.user, fetchFavorites]);

 const isProductFavorited = useCallback(
 (productId: number) => productIds.has(productId),
 [productIds]
 );

 const isStoreFavorited = useCallback(
 (storeSlug: string) => storeSlugs.has(storeSlug),
 [storeSlugs]
 );

 const toggleProduct = useCallback(
 async (productId: number) => {
 // Optimistic update
 setProductIds((prev) => {
 const next = new Set(prev);
 if (next.has(productId)) {
 next.delete(productId);
 } else {
 next.add(productId);
 }
 return next;
 });

 try {
 const res = await fetch("/api/favorites/product", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ productId }),
 });

 if (!res.ok) {
 // Revert on failure
 setProductIds((prev) => {
 const next = new Set(prev);
 if (next.has(productId)) {
 next.delete(productId);
 } else {
 next.add(productId);
 }
 return next;
 });
 }
 } catch {
 // Revert on error
 setProductIds((prev) => {
 const next = new Set(prev);
 if (next.has(productId)) {
 next.delete(productId);
 } else {
 next.add(productId);
 }
 return next;
 });
 }
 },
 []
 );

 const toggleStore = useCallback(
 async (storeSlug: string) => {
 // Optimistic update
 setStoreSlugs((prev) => {
 const next = new Set(prev);
 if (next.has(storeSlug)) {
 next.delete(storeSlug);
 } else {
 next.add(storeSlug);
 }
 return next;
 });

 try {
 const res = await fetch("/api/favorites/store", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug }),
 });

 if (!res.ok) {
 setStoreSlugs((prev) => {
 const next = new Set(prev);
 if (next.has(storeSlug)) {
 next.delete(storeSlug);
 } else {
 next.add(storeSlug);
 }
 return next;
 });
 }
 } catch {
 setStoreSlugs((prev) => {
 const next = new Set(prev);
 if (next.has(storeSlug)) {
 next.delete(storeSlug);
 } else {
 next.add(storeSlug);
 }
 return next;
 });
 }
 },
 []
 );

 return (
 <FavoritesContext.Provider
 value={{ productIds, storeSlugs, isProductFavorited, isStoreFavorited, toggleProduct, toggleStore, loaded }}
 >
 {children}
 </FavoritesContext.Provider>
 );
}
