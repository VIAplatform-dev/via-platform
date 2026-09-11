import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { filterItems, itemDot, inventoryCount, reservedWord, lacks, parseMissing, missingLabel, type InventoryFilter } from "../../lib/seller/inventory";
import { daysListed, ageLabel, AGING_THRESHOLDS } from "../../lib/seller/aging";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { SearchBox } from "../../components/seller/Search";

// Inventory — a list, not a table.
//
// Photo, name, price, and a dot for state. Bulk selection and multi-column editing stay on the
// desktop, where a table earns its keep and a mouse makes it quick. The search box at the top is
// the counter question — "do we still have the green Fendi?" — answered without scrolling.

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
  const [filter, setFilter] = useState<InventoryFilter>("all");
  // List or grid. A list answers "what is this and what does it cost"; a grid answers "which one
  // was it" — and on a rail of forty vintage pieces the second question is the common one, because
  // she remembers the garment, not the title she typed for it.
  const [grid, setGrid] = useState(false);
  // Home's "Needs you" rows arrive here with ?missing=photo|price|cost|confidence — the web
  // Inventory's own keys. Seeded once from the URL; the chip clears it like any other filter.
  const params = useLocalSearchParams<{ missing?: string }>();
  const [missing, setMissing] = useState(() => parseMissing(params.missing));

  const q = useQuery({
    queryKey: ["store", "items"],
    queryFn: () => apiGet<{ items: Item[] }>("/api/store/items"),
    enabled: !!storeSlug,
  });
  // Which reserved pieces a PERSON is holding — the rest are buyers mid-checkout, and the two
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
  // "Sold this week" comes from the SERVER, not from reading the device clock during render.
  // Two reasons: reading the clock in render is impure, and the store's week is the server's
  // week — a seller in another timezone should not see a different number than her dashboard.
  const soldThisWeek = week.data?.orders ?? 0;

  return (
    <SellerScreen
      title="Inventory"
      subtitle={q.isError ? "Couldn't load your pieces" : q.isPending ? " " : inventoryCount(filterItems(all, "all").length, soldThisWeek)}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <SearchBox />
      <View style={{ height: spacing.md }} />
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
      {missing ? (
        <Pressable onPress={() => setMissing(null)} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: colors.chipActive, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.chipActiveText }}>{missingLabel(missing)}</Text>
          <Text style={{ fontSize: 13, color: colors.chipActiveText, opacity: 0.7 }}>×</Text>
        </Pressable>
      ) : null}

      {q.isError ? (
        <Empty>Couldn&apos;t load your inventory. Pull to try again.</Empty>
      ) : visible.length === 0 && !q.isPending ? (
        <Empty>{missing ? `Nothing with ${missingLabel(missing).toLowerCase()}.` : filter === "all" ? "Nothing listed yet. Tap + to add a piece." : `Nothing ${filter === "drafts" ? "in drafts" : filter}.`}</Empty>
      ) : grid ? (
        // Photos only, three across. No price, no title: the point of this view is the picture, and
        // a caption under every tile turns it back into the list it is meant to be an alternative to.
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
          {visible.map((it) => (
            <Link key={it.id} href={{ pathname: "/(seller)/piece/[id]", params: { id: it.id } }} asChild>
              <Pressable style={{ width: `${(100 - 4) / 3}%`, aspectRatio: 1 }}>
                {it.images?.[0] ? (
                  <Image source={{ uri: it.images[0] }} style={{ width: "100%", height: "100%", borderRadius: 8, backgroundColor: colors.chip }} />
                ) : (
                  <View style={{ width: "100%", height: "100%", borderRadius: 8, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, color: colors.textDim, textAlign: "center", paddingHorizontal: 6 }} numberOfLines={2}>{it.title}</Text>
                  </View>
                )}
                {/* The state dot still shows — a grid you cannot tell sold from live in is a grid
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
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
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
