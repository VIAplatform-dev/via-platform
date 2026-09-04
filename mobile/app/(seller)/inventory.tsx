import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { filterItems, itemDot, inventoryCount, type InventoryFilter } from "../../lib/seller/inventory";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";

// Inventory — a list, not a table.
//
// Photo, name, price, and a dot for state. Bulk selection and multi-column editing stay on the
// desktop, where a table earns its keep and a mouse makes it quick.

type Item = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  images: string[];
  category: string | null;
  status: string;
  soldAt?: string | null;
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

  const q = useQuery({
    queryKey: ["store", "items"],
    queryFn: () => apiGet<{ items: Item[] }>("/api/store/items"),
    enabled: !!storeSlug,
  });
  const week = useQuery({
    queryKey: ["store", "overview", "7"],
    queryFn: () => apiGet<{ orders: number }>("/api/store/analytics/overview?days=7"),
    enabled: !!storeSlug,
  });

  const all = q.data?.items ?? [];
  const visible = filterItems(all, filter);
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
      <Chips options={CHIPS} value={filter} onChange={setFilter} />

      {q.isError ? (
        <Empty>Couldn&apos;t load your inventory. Pull to try again.</Empty>
      ) : visible.length === 0 && !q.isPending ? (
        <Empty>{filter === "all" ? "Nothing listed yet. Tap + to add a piece." : `Nothing ${filter === "drafts" ? "in drafts" : filter}.`}</Empty>
      ) : (
        visible.map((it) => (
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
                </Text>
              </View>
              <Dot status={it.status} />
            </Pressable>
          </Link>
        ))
      )}
    </SellerScreen>
  );
}
