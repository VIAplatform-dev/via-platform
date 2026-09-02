import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartLine, Product } from "./types";

// The bag.
//
// IT LIVES ON THE DEVICE, and that is not a shortcut. VYA does not sell anything itself — each
// store is its own merchant with its own checkout. There is no server-side cart to sync to, because
// there is no single basket to pay for: a bag holding pieces from three stores becomes three
// checkouts. The app's job is to hold the list until the person is ready, then walk them through
// paying each store in turn.
//
// That is what the shipped app told people, in as many words:
//   "Each store is a separate seller, so you'll pay store-by-store — we'll walk you through them."
//
// Persisted so closing the app doesn't empty the bag — the single most annoying thing a shopping
// app can do.

const KEY = "vya.cart.v1";

type CartState = {
  lines: CartLine[];
  /** Bag contents grouped by store, which is the order they get paid in. */
  byStore: { storeSlug: string; storeName: string; lines: CartLine[] }[];
  count: number;
  has: (productId: number) => boolean;
  add: (p: Product) => { added: boolean };
  remove: (productId: number) => void;
  clearStore: (storeSlug: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setLines(JSON.parse(raw) as CartLine[]);
      } catch {
        /* allow-swallow: a corrupt bag is not worth an error screen — start empty and move on. */
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Only write after the first read has happened, or the initial empty state would overwrite a
  // saved bag before it was ever loaded.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(KEY, JSON.stringify(lines)).catch(() => {});
  }, [lines, hydrated]);

  const has = useCallback((productId: number) => lines.some((l) => l.productId === productId), [lines]);

  const add = useCallback((p: Product) => {
    // Every piece is one-of-one vintage — there are no quantities, and adding twice is a mistake
    // rather than an order for two. The screen says "This piece is already in your bag."
    let added = false;
    setLines((prev) => {
      if (prev.some((l) => l.productId === p.id)) return prev;
      added = true;
      return [
        ...prev,
        {
          productId: p.id, name: p.name, price: p.price, image: p.image,
          storeSlug: p.storeSlug, storeName: p.storeName, size: p.size ?? null,
        },
      ];
    });
    return { added };
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clearStore = useCallback((storeSlug: string) => {
    setLines((prev) => prev.filter((l) => l.storeSlug !== storeSlug));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const byStore = useMemo(() => {
    const groups = new Map<string, { storeSlug: string; storeName: string; lines: CartLine[] }>();
    for (const l of lines) {
      const g = groups.get(l.storeSlug) ?? { storeSlug: l.storeSlug, storeName: l.storeName, lines: [] };
      g.lines.push(l);
      groups.set(l.storeSlug, g);
    }
    return [...groups.values()];
  }, [lines]);

  const value = useMemo<CartState>(
    () => ({ lines, byStore, count: lines.length, has, add, remove, clearStore, clear }),
    [lines, byStore, has, add, remove, clearStore, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
