import { useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiDelete } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { colors, spacing, fonts, radius, radiusSm, pill } from "../../../lib/portal-theme";
import { SellerScreen, Empty } from "../../../components/seller/Screen";
import { coverCandidates, coverFor, itemCountLabel, type CollectionItem } from "../../../lib/seller/collections";
import { formatMoney } from "../../../lib/seller/home";
import { pickPhotos } from "../../../lib/seller/pick-photos";
import { uploadPhoto } from "../../../lib/seller/intake";

// One collection: what is in it, what it is called, and what it looks like on the storefront.
//
// NAMED "store-collection", NOT "collection". (seller) is a route GROUP and adds no path segment,
// so a file at (seller)/collection/[id] and the SHOPPER's app/collection/[slug] both resolve to
// /collection/:x. Expo-router picks one, and it picked this one: tapping a collection in the
// marketplace opened the seller's editor. Same reason the seller drawer is "menu" and not
// "settings".
//
// THE COVER IS THE POINT OF THIS SCREEN. A collection tile on her shop is mostly a photograph, and
// until now the only way to change it was a laptop. The photo comes from one of two places, and
// the cheap one is offered first: any piece already in the collection, which costs no upload and
// no thought, or a shot from her camera roll for the editorial cover that is not a product photo.

type Detail = { collection: { id: string; title: string; slug: string }; items: CollectionItem[] };

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["store", "collection", id],
    queryFn: () => apiGet<Detail>(`/api/store/collections/${id}`),
    enabled: !!storeSlug && !!id,
  });
  // The list carries imageUrl; the detail route does not return it, so the cover comes from here.
  const list = useQuery({
    queryKey: ["store", "collections"],
    queryFn: () => apiGet<{ collections: { id: string; title: string; imageUrl: string | null }[] }>("/api/store/collections?all=1"),
    enabled: !!storeSlug,
  });

  const items = q.data?.items ?? [];
  const mine = list.data?.collections?.find((c) => c.id === id);
  const cover = coverFor({ imageUrl: mine?.imageUrl ?? null }, items);
  const candidates = coverCandidates(items);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["store", "collection", id] });
    void qc.invalidateQueries({ queryKey: ["store", "collections"] });
  };

  const patch = useMutation({
    mutationFn: (body: { title?: string; imageUrl?: string | null }) => apiPatch(`/api/store/collections/${id}`, body),
    onSuccess: () => { setRenaming(null); setChoosing(false); refresh(); },
  });

  /** A cover that is not one of the pieces. Uploaded the same way a listing photo is. */
  async function coverFromLibrary() {
    const picked = await pickPhotos(1);
    if (!picked.length) return;
    setBusy(true);
    try {
      patch.mutate({ imageUrl: await uploadPhoto(picked[0]) });
    } catch {
      Alert.alert("Couldn't upload that photo", "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const remove = () => {
    Alert.alert(
      "Delete this collection?",
      // Worth being precise: sellers hesitate here, and the honest answer is reassuring.
      `The ${items.length} ${items.length === 1 ? "piece" : "pieces"} in it stay in your inventory. Only the grouping goes.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await apiDelete(`/api/store/collections/${id}`).catch(() => null);
            refresh();
            router.back();
          },
        },
      ],
    );
  };

  const title = q.data?.collection.title ?? mine?.title ?? "Collection";

  return (
    <SellerScreen title={title} back onRefresh={() => { void q.refetch(); void list.refetch(); }} refreshing={q.isRefetching}>
      {/* The cover, at the size it is actually seen: a wide tile, not a thumbnail. */}
      <Pressable
        onPress={() => setChoosing(!choosing)}
        style={{ height: 150, borderRadius: radius, backgroundColor: colors.chip, overflow: "hidden", justifyContent: "flex-end" }}
      >
        {cover ? <Image source={{ uri: cover }} style={{ position: "absolute", width: "100%", height: "100%" }} /> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(28,25,23,0.5)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <Feather name="image" size={13} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>
            {cover ? "Change cover photo" : "Set a cover photo"}
          </Text>
        </View>
      </Pressable>

      {choosing ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            {candidates.length ? "Tap a piece to use its photo, or:" : "Nothing in here has a photo yet."}
          </Text>
          {candidates.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
              {candidates.map((i) => (
                <Pressable key={i.id} onPress={() => patch.mutate({ imageUrl: i.image })} disabled={patch.isPending}>
                  <Image source={{ uri: i.image! }} style={{ width: 64, height: 64, borderRadius: radiusSm, backgroundColor: colors.chip }} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <Pressable onPress={() => void coverFromLibrary()} disabled={busy || patch.isPending} style={{ flex: 1, alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, borderRadius: pill, paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500" }}>{busy ? "Uploading…" : "Choose a photo"}</Text>
            </Pressable>
            {mine?.imageUrl ? (
              <Pressable onPress={() => patch.mutate({ imageUrl: null })} disabled={patch.isPending} style={{ flex: 1, alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, borderRadius: pill, paddingVertical: spacing.md }}>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Name */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md }}>
        {renaming !== null ? (
          <TextInput
            autoFocus
            value={renaming}
            onChangeText={setRenaming}
            onBlur={() => { const t = renaming.trim(); if (t && t !== title) patch.mutate({ title: t }); else setRenaming(null); }}
            style={{ flex: 1, fontFamily: fonts.serif, fontSize: 22, color: colors.text }}
          />
        ) : (
          <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 22, color: colors.text }}>{title}</Text>
        )}
        <Pressable hitSlop={10} onPress={() => setRenaming(renaming === null ? title : null)}>
          <Text style={{ fontSize: 13, color: colors.accentInk, fontWeight: "500" }}>{renaming === null ? "Rename" : "Done"}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: spacing.sm }}>{itemCountLabel(items.length)}</Text>

      {/* The pieces */}
      {q.isError ? (
        <Empty>Couldn&apos;t load this collection.</Empty>
      ) : items.length === 0 && !q.isPending ? (
        <Empty>Nothing in here yet. Open a piece and add it to this collection.</Empty>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          {items.map((i) => (
            <Link key={i.id} href={{ pathname: "/(seller)/piece/[id]", params: { id: i.id } }} asChild>
              <Pressable style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }}>
                <Image source={{ uri: i.image ?? undefined }} style={{ width: 48, height: 48, borderRadius: radiusSm, backgroundColor: colors.chip }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "500" }} numberOfLines={1}>{i.title ?? "Untitled piece"}</Text>
                  <Text style={{ fontSize: 13, color: colors.textDim, marginTop: 2 }}>
                    {i.priceCents ? formatMoney(i.priceCents, i.currency ?? "USD") : "No price"}
                    {i.status !== "active" ? ` · ${i.status}` : ""}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textDim} />
              </Pressable>
            </Link>
          ))}
        </View>
      )}

      <Pressable onPress={remove} style={{ marginTop: spacing.xl, paddingVertical: spacing.md }}>
        <Text style={{ fontSize: 13.5, color: colors.textMuted, textAlign: "center" }}>Delete collection</Text>
      </Pressable>
    </SellerScreen>
  );
}
