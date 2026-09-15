import { useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, radius } from "../../lib/portal-theme";
import { formatMoney } from "../../lib/seller/home";
import { filterItems, itemDot, inventoryCount, reservedWord, lacks, parseMissing, missingLabel, anyReserved, RESERVED_EXPLAINER, type InventoryFilter } from "../../lib/seller/inventory";
import { coverFor, itemCountLabel, orderCollections, type Collection } from "../../lib/seller/collections";
import { daysListed, ageLabel, AGING_THRESHOLDS } from "../../lib/seller/aging";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { SearchBox } from "../../components/seller/Search";

// Inventory: a list, not a table.
//
// Photo, name, price, and a dot for state. Bulk selection and multi-column editing stay on the
// desktop, where a table earns its keep and a mouse makes it quick. The search box at the top is
// the counter question, "do we still have the green Fendi?". Answered without scrolling.

type Item = {
  id: string;
  title: string;
  priceCents: number;
  costCents?: number | null;
  currency: string;
  images: string[];
  category: string | null;
  status: string;
  soldAt?: string | null;
  createdAt?: string;
};

const CHIPS: { key: InventoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "drafts", label: "Drafts" },
  { key: "sold", label: "Sold" },
  // Not a status: the same shop, grouped the way a shopper sees it. Last, because the four before
  // it answer "where is that piece" and this one answers "what does my shop look like".
  { key: "collections", label: "Collections" },
];

function Dot({ status }: { status: string }) {
  const kind = itemDot(status);
  if (!kind) return <View style={{ width: 8 }} />;
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: kind === "live" ? colors.positive : colors.textDim,
      }}
    />
  );
}

export default function InventoryScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InventoryFilter>("all");
  // List or grid. A list answers "what is this and what does it cost"; a grid answers "which one
  // was it", and on a rail of forty vintage pieces the second question is the common one, because
  // she remembers the garment, not the title she typed for it.
  const [grid, setGrid] = useState(false);
  // Home's "Needs you" rows arrive here with ?missing=photo|price|cost|confidence: the web
  // Inventory's own keys.
  //
  // THE URL IS THE FILTER. It used to be `useState(() => parseMissing(params.missing))`, seeded
  // once, and that is why tapping "4 pieces with no cost" landed on an UNFILTERED inventory. This
  // screen is a tab (see the (seller) layout): it mounts the first time she opens Inventory and
  // then stays mounted for the rest of the session, so a useState initialiser runs once, probably
  // hours before the Home row was ever tapped, and every arrival after that was ignored.
  //
  // Reading straight from the params fixes that, and clearing has to WRITE BACK to them for the
  // same reason: leaving the URL saying `missing=price` while local state said null meant tapping
  // the same row a second time changed nothing at all.
  const params = useLocalSearchParams<{ missing?: string }>();
  const missing = parseMissing(params.missing);
  const setMissing = (next: string) => router.setParams({ missing: next });

  // ?view=list: photo, name, price, cost, state, dates, and nothing else. The whole row is 44
  // columns and 12.5 MB on the largest store on the platform, most of it descriptions this screen
  // never draws. Opening a piece fetches that piece. See app/lib/item-list-shape.ts.
  const q = useQuery({
    queryKey: ["store", "items", "list"],
    queryFn: () => apiGet<{ items: Item[] }>("/api/store/items?view=list"),
    enabled: !!storeSlug,
  });
  // Which reserved pieces a PERSON is holding. The rest are buyers mid-checkout, and the two
  // must not share a word (lib/seller/inventory.ts reservedWord).
  const holds = useQuery({
    queryKey: ["store", "holds"],
    queryFn: () => apiGet<{ holds: { itemId: string }[] }>("/api/store/holds"),
    enabled: !!storeSlug,
  });
  const held = new Set((holds.data?.holds ?? []).map((h) => h.itemId));
  // "AI price to check" is the server's list, not a rule the phone can apply itself.
  const attention = useQuery({
    queryKey: ["store", "attention"],
    queryFn: () => apiGet<{ lowConfidenceIds?: string[] }>("/api/store/attention"),
    enabled: !!storeSlug && missing === "confidence",
  });
  const week = useQuery({
    queryKey: ["store", "overview", "7"],
    queryFn: () => apiGet<{ orders: number }>("/api/store/analytics/overview?days=7"),
    enabled: !!storeSlug,
  });

  const all = q.data?.items ?? [];
  const visible = lacks(filterItems(all, filter), missing, attention.data?.lowConfidenceIds ?? []);

  // Only fetched when she is actually looking at them. `all=1` is what the piece editor and the
  // listing flow ask for, so the three share one cache entry.
  const collections = useQuery({
    queryKey: ["store", "collections"],
    queryFn: () => apiGet<{ collections: Collection[] }>("/api/store/collections?all=1"),
    enabled: !!storeSlug && filter === "collections",
  });
  const cols = orderCollections(collections.data?.collections ?? []);
  // null = not naming one. "" = the sheet is open and empty.
  const [naming, setNaming] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (title: string) => apiPost<{ collection: { id: string } }>("/api/store/collections", { title }),
    onError: () => Alert.alert("Couldn't create that collection", "Try again in a moment."),
    onSuccess: (r) => {
      setNaming(null);
      void qc.invalidateQueries({ queryKey: ["store", "collections"] });
      // Straight into it. A new collection is empty, and the next thing she wants is to give it a
      // cover or put something in it, both of which live on that screen.
      router.push({ pathname: "/(seller)/store-collection/[id]", params: { id: r.collection.id } });
    },
  });
  // "Sold this week" comes from the SERVER, not from reading the device clock during render.
  // Two reasons: reading the clock in render is impure, and the store's week is the server's
  // week: a seller in another timezone should not see a different number than her dashboard.
  const soldThisWeek = week.data?.orders ?? 0;

  return (
    <SellerScreen
      title="Inventory"
      subtitle={q.isError ? "Couldn't load your pieces" : q.isPending ? " " : inventoryCount(filterItems(all, "all").length, soldThisWeek)}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <SearchBox />

      {/* A SECOND DOOR TO LISTING A RAIL. The screen exists. Forty photos in, grouped into pieces,
          priced or drafted in one pass, and until now the only way in was an unlabelled icon
          inside the camera, which is not a place anyone looks for a bulk import. Inventory is where
          she stands when she is thinking about a rail rather than a piece.

          Its own row, above the filters rather than beside them: the words are the point, and the
          chips wrap onto a second line if this sits in with them. */}
      <Pressable
        onPress={() => router.push("/(seller)/new/bulk")}
        accessibilityLabel="List multiple items"
        style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border }}
      >
        <Feather name="layers" size={15} color={colors.text} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }} numberOfLines={1}>List multiple items</Text>
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Chips options={CHIPS} value={filter} onChange={setFilter} />
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => setGrid(!grid)}
          accessibilityLabel={grid ? "Show as a list" : "Show as a grid"}
          style={{ padding: spacing.sm }}
        >
          <Feather name={grid ? "list" : "grid"} size={20} color={colors.text} />
        </Pressable>
      </View>
      {/* WHY A PIECE SAYS "RESERVED". Shown only when one actually is, so it answers a question that
          is on the screen rather than sitting there as a permanent notice. */}
      {filter !== "collections" && anyReserved(visible) ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.md, marginBottom: spacing.sm }}>
          <Feather name="info" size={14} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13.5, color: colors.textMuted, lineHeight: 17 }}>{RESERVED_EXPLAINER}</Text>
        </View>
      ) : null}

      {missing ? (
        <Pressable onPress={() => setMissing("")} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: colors.chipActive, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.chipActiveText }}>{missingLabel(missing)}</Text>
          <Text style={{ fontSize: 13, color: colors.chipActiveText, opacity: 0.7 }}>×</Text>
        </Pressable>
      ) : null}

      {filter === "collections" ? (
        collections.isError ? (
          <Empty>Couldn&apos;t load your collections.</Empty>
        ) : cols.length === 0 && !collections.isPending ? (
          <Empty>No collections yet. Open a piece, or list a new one, and add it to one.</Empty>
        ) : (
          // Two across and wide rather than square: a collection cover is a banner on the
          // storefront, and a square crop here would show her something she is not choosing.
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {/* MAKING one, not just looking at what exists. Collections could be created from the
                listing flow and the piece editor (type a name into the picker) and nowhere else,
                so the screen that LISTS them was the one place she couldn't start one. Same tile
                shape as the rest so the grid doesn't break around it. */}
            <Pressable
              onPress={() => setNaming("")}
              style={{ width: `${(100 - 2) / 2}%` }}
            >
              <View style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Feather name="plus" size={20} color={colors.textMuted} />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>New collection</Text>
              </View>
            </Pressable>
            {naming !== null ? (
              <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
                <TextInput
                  autoFocus
                  value={naming}
                  onChangeText={setNaming}
                  placeholder="Collection name"
                  placeholderTextColor={colors.textDim}
                  onSubmitEditing={() => { const t = naming.trim(); if (t) create.mutate(t); }}
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15, color: colors.text, backgroundColor: colors.bgCard }}
                />
                <Pressable
                  disabled={!naming.trim() || create.isPending}
                  onPress={() => create.mutate(naming.trim())}
                  style={{ borderRadius: radius, backgroundColor: naming.trim() ? colors.accent : colors.chip, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: naming.trim() ? colors.accentText : colors.textDim }}>
                    {create.isPending ? "…" : "Create"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setNaming(null)} hitSlop={8}>
                  <Feather name="x" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {cols.map((c) => {
              const cover = coverFor(c);
              return (
                <Link key={c.id} href={{ pathname: "/(seller)/store-collection/[id]", params: { id: c.id } }} asChild>
                  <Pressable style={{ width: `${(100 - 2) / 2}%` }}>
                    <View style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius, backgroundColor: colors.chip, overflow: "hidden" }}>
                      {cover ? <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} /> : null}
                    </View>
                    <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600", marginTop: spacing.sm }} numberOfLines={1}>{c.title}</Text>
                    <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 1 }}>{itemCountLabel(c.itemCount)}</Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        )
      ) : q.isError ? (
        <Empty>Couldn&apos;t load your inventory. Pull to try again.</Empty>
      ) : visible.length === 0 && !q.isPending ? (
        <Empty>{missing ? `Nothing with ${missingLabel(missing).toLowerCase()}.` : filter === "all" ? "Nothing listed yet. Tap + for one piece, or List multiple items for a whole rail." : `Nothing ${filter === "drafts" ? "in drafts" : filter}.`}</Empty>
      ) : grid ? (
        // Photos only, three across. No price, no title: the point of this view is the picture, and
        // a caption under every tile turns it back into the list it is meant to be an alternative to.
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
          {visible.map((it) => (
            <Link key={it.id} href={{ pathname: "/(seller)/piece/[id]", params: { id: it.id } }} asChild>
              <Pressable style={{ width: `${(100 - 4) / 3}%`, aspectRatio: 1 }}>
                {it.images?.[0] ? (
                  <Image source={{ uri: it.images[0] }} style={{ width: "100%", height: "100%", borderRadius: radius, backgroundColor: colors.chip }} />
                ) : (
                  <View style={{ width: "100%", height: "100%", borderRadius: radius, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 12.5, color: colors.textDim, textAlign: "center", paddingHorizontal: 6 }} numberOfLines={2}>{it.title}</Text>
                  </View>
                )}
                {/* The state dot still shows. A grid you cannot tell sold from live in is a grid
                    she has to leave to answer the question she opened it with. */}
                <View style={{ position: "absolute", top: 6, right: 6 }}>
                  <Dot status={it.status} />
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
      ) : (
        visible.map((it) => {
          // Age only on a live piece: a sold one is finished, a draft has not started.
          const days = it.status === "active" ? daysListed(it.createdAt ?? null) : null;
          const age = ageLabel(days);
          return (
            <Link key={it.id} href={{ pathname: "/(seller)/piece/[id]", params: { id: it.id } }} asChild>
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                {it.images?.[0] ? (
                  <Image source={{ uri: it.images[0] }} style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.chip }} />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.chip }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                    {it.title}
                  </Text>
                  <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {formatMoney(it.priceCents, it.currency)}
                    {it.category ? ` · ${it.category}` : ""}
                    {reservedWord(it.status, held.has(it.id)) ? ` · ${reservedWord(it.status, held.has(it.id))}` : ""}
                  </Text>
                </View>
                {age ? (
                  <Text style={{ fontSize: 12, fontVariant: ["tabular-nums"], color: (days ?? 0) >= AGING_THRESHOLDS.stale ? colors.accent : colors.textDim }}>
                    {age}
                  </Text>
                ) : null}
                <Dot status={it.status} />
              </Pressable>
            </Link>
          );
        })
      )}
    </SellerScreen>
  );
}
