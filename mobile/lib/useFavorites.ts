import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { useAuth } from "./auth";
import type { Product } from "./types";

// Saved pieces, shared by every grid.
//
// TWO THINGS THE API DECIDES, NOT US:
//
// `favorited` MUST be sent explicitly. The route reads `body?.favorited === true`, so a request
// carrying only a productId is read as "unfavorite" — a toggle that omitted it could add nothing,
// ever, and looked like the heart was broken.
//
// `soldOut` comes back per entry, which is what splits the Obsessions and Sold Out tabs. There is a
// separate /api/public/favorites-availability endpoint, but it is a second round-trip for a fact
// this response already carries.

export type Favorite = Product & { soldOut?: boolean };

/**
 * A favourite whose product row AND snapshot are both gone renders as the API's placeholder —
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

  const all = q.data?.products ?? [];
  const ids = new Set(all.map((p) => p.id));

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
  const toggleFavorite = useCallback(
    (p: Product) => { if (user) toggle.mutate({ product: p, favorited: !ids.has(p.id) }); },
    [toggle, user, ids],
  );

  return {
    favorites: all.filter((p) => !p.soldOut),
    soldOut: all.filter((p) => p.soldOut),
    isFavorited,
    toggleFavorite,
    query: q,
  };
}
