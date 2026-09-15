"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { X, ShoppingCart } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCart, CartItem } from "@/app/components/CartProvider";
import { useSignUp } from "@/app/components/SignUpProvider";
import TrackedStoreLink from "@/app/components/TrackedStoreLink";
import {
 trackBeginCheckout,
 trackViewCart,
} from "@/app/lib/firebase-analytics";

/**
 * Build a Shopify multi-cart URL from a group of items.
 * Format: https://store.com/cart/VAR1:1,VAR2:1,VAR3:1
 * Falls back to first item's external URL if any item lacks a variant ID.
 */
function buildGroupCheckoutUrl(items: CartItem[]): string {
 const variantEntries: string[] = [];
 let storeOrigin = "";

 // Combine EVERY item that has a proper Shopify cart variant, from the same store. A single item
 // without one (e.g. a piece synced without a variant id) is skipped rather than bailing the whole
 // cart to one product page, so multi-item checkout keeps as many items as it can.
 for (const item of items) {
 if (!item.checkoutUrl) continue;
 try {
 const url = new URL(item.checkoutUrl);
 const cartMatch = url.pathname.match(/^\/cart\/(\d+):(\d+)/);
 if (!cartMatch) continue;
 if (!storeOrigin) storeOrigin = url.origin;
 else if (url.origin !== storeOrigin) continue; // only same-store variants combine into one cart
 variantEntries.push(`${cartMatch[1]}:${cartMatch[2]}`);
 } catch {
 continue;
 }
 }

 // Return a clean cart URL. The /api/track route handles the /discount/ redirect
 // for attribution, so we don't need to embed the discount code here. Only fall back to a single
 // product page when NOT ONE item had a usable cart variant.
 if (!storeOrigin || variantEntries.length === 0) return items[0].externalUrl;
 return `${storeOrigin}/cart/${variantEntries.join(",")}`;
}

export default function CartPage() {
 const { items, removeItem, removeItems, clearCart, itemCount } = useCart();
 const { data: session, status } = useSession();
 const { openModal } = useSignUp();
 const [soldOutIds, setSoldOutIds] = useState<Set<number>>(new Set());

 // Remove items that were purchased (matched by a conversion event)
 useEffect(() => {
 if (status !== "authenticated" || itemCount === 0) return;
 fetch("/api/cart/purchased")
 .then((r) => r.json())
 .then(({ compositeIds }: { compositeIds: string[] }) => {
 compositeIds.forEach((id) => removeItems([id]));
 })
 .catch(() => {});
 }, [status, itemCount, removeItems]);

 // Auto-open the sign-in modal for unauthenticated users with items in cart
 const needsAuth = status !== "loading" && !session && itemCount > 0;

 useEffect(() => {
 if (needsAuth) {
 openModal("/cart", { required: true });
 }
 }, [needsAuth, openModal]);

 useEffect(() => {
 if (items.length === 0) {
 return;
 }

 trackViewCart(
 items.map((item) => ({
 itemId: item.compositeId,
 itemName: item.title,
 price: item.price,
 storeName: item.storeName,
 storeSlug: item.storeSlug,
 })),
 "cart"
 );
 }, [items]);

 // Check which cart items are still available
 useEffect(() => {
 if (items.length === 0) return;
 const ids = items
 .map((item) => {
 const match = item.compositeId.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })
 .filter((id): id is number => id != null);
 if (ids.length === 0) return;
 fetch(`/api/products/availability?ids=${ids.join(",")}`)
 .then((r) => r.json())
 .then(({ available }: { available: number[] }) => {
 const availableSet = new Set(available);
 const sold = new Set(ids.filter((id) => !availableSet.has(id)));
 setSoldOutIds(sold);
 })
 .catch(() => {});
 }, [items]);

 // Group items by store
 const storeGroups = useMemo(() => {
 const groups: Record<
 string,
 { storeName: string; storeSlug: string; items: typeof items }
 > = {};

 for (const item of items) {
 if (!groups[item.storeSlug]) {
 groups[item.storeSlug] = {
 storeName: item.storeName,
 storeSlug: item.storeSlug,
 items: [],
 };
 }
 groups[item.storeSlug].items.push(item);
 }

 return Object.values(groups);
 }, [items]);

 if (itemCount === 0) {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-4xl mx-auto px-6 py-20 text-center">
 <ShoppingCart size={48} className="mx-auto mb-6 text-[#5D0F17]/30" />
 <h1 className="text-2xl sm:text-3xl font-serif mb-4">
 Your cart is empty
 </h1>
 <p className="text-[#5D0F17]/50 mb-8">
 Browse our stores and add items to your cart.
 </p>
 <Link
 href="/stores"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-3 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Explore Stores
 </Link>
 </div>
 </main>
 );
 }

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-12 sm:py-16">
 <div className="flex items-end justify-between">
 <div>
 <h1 className="text-2xl sm:text-3xl font-serif mb-1">Your Cart</h1>
 <p className="text-sm text-[#5D0F17]/50">
 {itemCount} {itemCount === 1 ? "item" : "items"}
 </p>
 </div>
 <div className="flex items-center gap-4">
 {soldOutIds.size > 0 && (
 <button
 onClick={() => {
 items.forEach((item) => {
 const dbId = (() => {
 const match = item.compositeId.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })();
 if (dbId != null && soldOutIds.has(dbId)) removeItem(item.compositeId);
 });
 }}
 className="text-xs uppercase tracking-wide text-[#5D0F17]/40 hover:text-[#5D0F17] transition underline"
 >
 Remove Sold Out
 </button>
 )}
 <button
 onClick={clearCart}
 className="text-xs uppercase tracking-wide text-[#5D0F17]/50 hover:text-[#5D0F17] transition underline"
 >
 Clear Cart
 </button>
 </div>
 </div>
 </div>
 </section>

 <section className="py-12 sm:py-16">
 <div className="max-w-4xl mx-auto px-6 space-y-10">
 {storeGroups.map((group) => {
 const groupTotal = group.items.reduce((sum, i) => sum + i.price, 0);

 const allSoldOut = group.items.every((item) => {
 const dbId = (() => {
 const match = item.compositeId.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })();
 return dbId != null && soldOutIds.has(dbId);
 });

 return (
 <div
 key={group.storeSlug}
 className="border border-[#5D0F17]/10 overflow-hidden"
 >
 {/* Store header */}
 <div className="bg-[#D8CABD]/20 px-5 py-4 flex items-center justify-between">
 <TrackedStoreLink
 href={`/stores/${group.storeSlug}`}
 storeSlug={group.storeSlug}
 storeName={group.storeName}
 surface="cart"
 className="hover:underline transition"
 >
 <span className="font-medium text-[#5D0F17]">
 {group.storeName}
 </span>
 <span className="text-[#5D0F17]/50 text-sm ml-2">
 {group.items.length}{" "}
 {group.items.length === 1 ? "item" : "items"}
 </span>
 </TrackedStoreLink>
 <span className="text-sm font-medium text-[#5D0F17]">
 ${groupTotal.toFixed(2)}
 </span>
 </div>

 {/* Items */}
 <div className="divide-y divide-[#5D0F17]/10">
 {group.items.map((item) => {
 const dbId = (() => {
 const match = item.compositeId.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })();
 const isSoldOut = dbId != null && soldOutIds.has(dbId);

 return (
 <div
 key={item.compositeId}
 className={`flex gap-4 sm:gap-5 px-5 py-4 ${isSoldOut ? "opacity-50" : ""}`}
 >
 {/* Thumbnail */}
 <div className="flex-shrink-0 relative">
 <Link
 href={isSoldOut ? "#" : `/products/${item.compositeId}`}
 className={isSoldOut ? "pointer-events-none" : ""}
 >
 <div className="w-16 h-20 sm:w-20 sm:h-24 bg-[#D8CABD]/30 overflow-hidden">
 {item.image ? (
 <img
 src={item.image}
 alt={item.title}
 className="w-full h-full object-cover"
 />
 ) : (
 <div className="w-full h-full flex items-center justify-center text-[#5D0F17]/40 text-xs">
 No image
 </div>
 )}
 </div>
 </Link>
 </div>

 {/* Details */}
 <div className="flex-1 min-w-0 flex items-center">
 <div className="flex-1 min-w-0">
 <Link
 href={isSoldOut ? "#" : `/products/${item.compositeId}`}
 className={`font-serif text-base text-[#5D0F17] leading-snug line-clamp-2 ${isSoldOut ? "pointer-events-none" : "hover:underline"}`}
 >
 {item.title}
 </Link>
 {isSoldOut ? (
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/40 mt-0.5">
 Sold Out
 </p>
 ) : (
 <p className="text-sm text-[#5D0F17]/60 mt-0.5">
 ${item.price}
 </p>
 )}
 </div>

 {/* Remove */}
 <button
 onClick={() => removeItem(item.compositeId)}
 className="flex-shrink-0 p-2 text-[#5D0F17]/40 hover:text-[#5D0F17] transition ml-2"
 aria-label={`Remove ${item.title}`}
 >
 <X size={16} />
 </button>
 </div>
 </div>
 );
 })}
 </div>

 {/* Store checkout button */}
 <div className="px-5 py-4 bg-[#D8CABD]/20">
 {allSoldOut ? (
 <div className="block w-full bg-[#5D0F17]/20 text-[#5D0F17]/40 text-center py-3 text-sm uppercase tracking-wide cursor-not-allowed">
 All items sold out
 </div>
 ) : (
 <a
 href={(() => {
 const availableItems = group.items.filter((item) => {
 const dbId = (() => {
 const match = item.compositeId.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })();
 return dbId == null || !soldOutIds.has(dbId);
 });
 const firstItem = availableItems[0] ?? group.items[0];
 const multiCartUrl = buildGroupCheckoutUrl(availableItems);

 const params = new URLSearchParams({
 pid: firstItem.compositeId,
 pn: availableItems.length > 1
 ? `${availableItems.length} items from ${group.storeName}`
 : firstItem.title,
 s: firstItem.storeName,
 ss: firstItem.storeSlug,
 url: multiCartUrl,
 });
 if (availableItems.length > 1) {
 params.set("items", JSON.stringify(
 availableItems.map((i) => ({ id: i.compositeId, name: i.title, price: i.price }))
 ));
 }
 return `/api/track?${params.toString()}`;
 })()}
 onClick={() => {
 const availableItems = group.items.filter((item) => {
 const dbId = (() => {
 const match = item.compositeId.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })();
 return dbId == null || !soldOutIds.has(dbId);
 });

 trackBeginCheckout(
 availableItems.map((item) => ({
 itemId: item.compositeId,
 itemName: item.title,
 price: item.price,
 storeName: item.storeName,
 storeSlug: item.storeSlug,
 })),
 {
 surface: "cart",
 checkoutType:
 availableItems.length > 1 ? "multi_item_store_checkout" : "single_item_store_checkout",
 storeSlug: group.storeSlug,
 storeName: group.storeName,
 }
 );

 }}
 target="_blank"
 rel="noopener noreferrer"
 className="block w-full bg-[#5D0F17] text-[#FFFDF8] text-center py-3 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Checkout on {group.storeName} &rarr;
 </a>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </section>

 {/* Note */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-8 text-center">
 <p className="text-xs text-[#5D0F17]/40">
 Each item checks out directly on the store&apos;s website.
 Shipping and returns are handled by each store.
 </p>
 </div>
 </section>
 </main>
 );
}
