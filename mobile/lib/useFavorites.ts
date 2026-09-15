import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { useAuth } from "./auth";
import type { Product } from "./types";

// Saved pieces, shared by every grid.
//
// TWO THINGS THE API DECIDES, NOT US:
//
// `favorited` MUST be sent explicitly. The route reads `body?.favorited === true`, so a request
// carrying only a productId is read as "unfavorite". A toggle that omitted it could add nothing,
// ever, and looked like the heart was broken.
//
// `soldOut` comes back per entry, which is what splits the Obsessions and Sold Out tabs. There is a
// separate /api/public/favorites-availability endpoint, but it is a second round-trip for a fact
// this response already carries.

export type Favorite = Product & { soldOut?: boolean };

/**
 * A favourite whose product row AND snapshot are both gone renders as the API's placeholder,
 * name "Item", price "$0", no image, no store. It is a dead pointer, not a piece; showing it gives
 * a blank card that navigates nowhere.
 */
function isRenderable(p: Favorite): boolean {
  return Boolean(p.image || p.storeSlug || (p.name && p.name !== "Item"));
}

export function useFavorites() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["obsessions"],
    queryFn: async () => {
      const r = await apiGet<{ products: Favorite[] }>("/api/mobile/favorites");
      return { products: r.products.filter(isRenderable) };
    },
    enabled: Boolean(user),
  });

  const all = useMemo(() => q.data?.products ?? [], [q.data]);

  // IDENTITY MATTERS HERE, not just contents.
  //
  // `ids` was a fresh Set on every render, so the two callbacks below were fresh too, so
  // ProductCard's memo, which compares onToggleFavorite by reference, never held. One heart tap
  // re-rendered every card on screen and every image gallery inside them. Keyed on the ids
  // themselves, the Set survives renders that did not change what is saved.
  // `all` is itself memoized on q.data, and React Query's structural sharing keeps that object
  // identical across a refetch that changed nothing, so this Set survives those too.
  const ids = useMemo(() => new Set(all.map((p) => p.id)), [all]);

  // The toggle reads the CURRENT set through a ref rather than closing over it, so its own
  // identity never changes. Without this the memo above is defeated again by the very callback
  // it is trying to keep stable.
  const idsRef = useRef(ids);
  useEffect(() => { idsRef.current = ids; }, [ids]);

  const toggle = useMutation({
    mutationFn: (v: { product: Product; favorited: boolean }) =>
      apiPost("/api/mobile/favorites", { productId: v.product.id, favorited: v.favorited }),
    onMutate: async ({ product, favorited }) => {
      await qc.cancelQueries({ queryKey: ["obsessions"] });
      const prev = qc.getQueryData<{ products: Favorite[] }>(["obsessions"]);
      qc.setQueryData<{ products: Favorite[] }>(["obsessions"], (old) => {
        const list = old?.products ?? [];
        return favorited
          ? { products: list.some((x) => x.id === product.id) ? list : [product, ...list] }
          : { products: list.filter((x) => x.id !== product.id) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["obsessions"], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["obsessions"] }); },
  });

  const isFavorited = useCallback((p: Product) => ids.has(p.id), [ids]);
  const mutateRef = useRef(toggle.mutate);
  useEffect(() => { mutateRef.current = toggle.mutate; }, [toggle.mutate]);
  const toggleFavorite = useCallback(
    (p: Product) => { if (user) mutateRef.current({ product: p, favorited: !idsRef.current.has(p.id) }); },
    [user],
  );

  const favorites = useMemo(() => all.filter((p) => !p.soldOut), [all]);
  const soldOut = useMemo(() => all.filter((p) => p.soldOut), [all]);

  return {
    favorites,
    soldOut,
    isFavorited,
    toggleFavorite,
    query: q,
  };
}
