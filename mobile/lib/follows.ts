import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

// Following a store.
//
// This one is keyed on the DEVICE, not the account — /api/mobile/follows takes a `deviceId`, and it
// exists to drive push notifications ("Ange Archive just listed something"), which are a property of
// a phone rather than a login. That is also why it needs a stable id of our own making.
//
// The API SETS THE WHOLE LIST rather than toggling one store, so following means posting the
// existing set plus one. Posting just the new slug would silently unfollow everything else.

const DEVICE_KEY = "vya.deviceId";

async function deviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function useFollows() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["follows"],
    queryFn: async () => {
      const id = await deviceId();
      return apiGet<{ stores: string[] }>(`/api/mobile/follows?deviceId=${encodeURIComponent(id)}`);
    },
  });

  const stores = q.data?.stores ?? [];

  const set = useMutation({
    mutationFn: async (next: string[]) => {
      const id = await deviceId();
      return apiPost("/api/mobile/follows", { deviceId: id, stores: next });
    },
    onMutate: async (next: string[]) => {
      await qc.cancelQueries({ queryKey: ["follows"] });
      const prev = qc.getQueryData<{ stores: string[] }>(["follows"]);
      qc.setQueryData<{ stores: string[] }>(["follows"], { stores: next });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["follows"], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["follows"] }); },
  });

  const isFollowing = useCallback((slug: string) => stores.includes(slug), [stores]);
  const toggleFollow = useCallback(
    (slug: string) => {
      const next = stores.includes(slug) ? stores.filter((s) => s !== slug) : [...stores, slug];
      set.mutate(next);
    },
    [stores, set],
  );

  return { stores, isFollowing, toggleFollow };
}
