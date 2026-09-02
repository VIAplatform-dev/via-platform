import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Link, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFavorites } from "../../lib/useFavorites";
import AppHeader from "../../components/AppHeader";
import SubTabs from "../../components/SubTabs";
import ProductGrid from "../../components/ProductGrid";
import { colors, fonts, spacing } from "../../lib/theme";

// Saved things, in three views behind one tab.
//
//   Obsessions — still buyable
//   Sold Out   — saved and gone. Kept deliberately: on one-of-one vintage, what you missed is how
//                you learn what to watch for, and deleting it silently would look like a bug.
//   Searches   — standing searches, which are obsessions for pieces that don't exist yet.
//
// The split comes from the `soldOut` flag on each entry in /api/mobile/favorites — that response
// already carries it, so no second request is needed.

const TABS = ["Obsessions", "Sold Out", "Searches"] as const;
type Tab = (typeof TABS)[number];

type SavedSearch = { id: number; name: string; unreadCount: number };

export default function ObsessionsScreen() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("Obsessions");
  const { favorites, soldOut, isFavorited, toggleFavorite, query } = useFavorites();


  const searches = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => apiGet<{ searches: SavedSearch[] }>("/api/mobile/saved-searches"),
    enabled: Boolean(user) && tab === "Searches",
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Obsessions" />
      <SubTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Searches" ? (
        <FlatList
          data={searches.data?.searches ?? []}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>No saved searches yet</Text>
              <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
                Save a search and we’ll keep it here, with what’s new since you last looked.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={`/saved-search/${item.id}`} asChild>
              <Pressable style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 16, color: colors.text }}>{item.name}</Text>
                {item.unreadCount > 0 ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accent }}>
                    <Text style={{ fontSize: 11, color: colors.accentText }}>{item.unreadCount} new</Text>
                  </View>
                ) : null}
              </Pressable>
            </Link>
          )}
        />
      ) : (
        <ProductGrid
          products={tab === "Obsessions" ? favorites : soldOut}
          loading={query.isLoading}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          favorited={isFavorited}
          onToggleFavorite={toggleFavorite}
          empty={
            tab === "Obsessions"
              ? { title: "No obsessions yet.", body: "Tap the heart on any piece to keep it here." }
              : { title: "Nothing sold out", body: "Saved pieces that sell will move here." }
          }
        />
      )}
    </View>
  );
}
