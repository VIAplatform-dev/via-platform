import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { Link, Redirect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, fonts, spacing } from "../../lib/theme";

// Saved Searches. Each one is a set of filters plus an unread count — the number of pieces that
// have landed since it was last opened, which is the entire point of saving a search on a
// marketplace where stock is one-of-one and gone within days.

type SavedSearch = {
  id: number;
  name: string;
  filters: { sizes?: string[]; categories?: string[]; stores?: string[]; priceMin?: number | null; priceMax?: number | null; query?: string };
  unreadCount: number;
  createdAt: string;
};

function describe(f: SavedSearch["filters"]): string {
  const bits: string[] = [];
  if (f.query) bits.push(`“${f.query}”`);
  if (f.sizes?.length) bits.push(f.sizes.join(", "));
  if (f.categories?.length) bits.push(f.categories.join(", "));
  if (f.stores?.length) bits.push(`${f.stores.length} store${f.stores.length === 1 ? "" : "s"}`);
  if (f.priceMin != null || f.priceMax != null) {
    bits.push(`$${f.priceMin ?? 0}–${f.priceMax != null ? `$${f.priceMax}` : "any"}`);
  }
  return bits.join("  ·  ");
}

export default function SavedSearchesScreen() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => apiGet<{ searches: SavedSearch[] }>("/api/mobile/saved-searches"),
    enabled: Boolean(user),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/mobile/saved-searches/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saved-searches"] }); },
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;

  return (
    <FlatList
      data={q.data?.searches ?? []}
      keyExtractor={(s) => String(s.id)}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>No saved searches yet</Text>
          <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
            Save a search from Shop and we’ll keep it here, with what’s new since you last looked.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Link href={`/saved-search/${item.id}`} asChild>
            <Pressable style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ fontSize: 15, color: colors.text }}>{item.name}</Text>
                {item.unreadCount > 0 ? (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accent }}>
                    <Text style={{ fontSize: 11, color: colors.accentText }}>{item.unreadCount} new</Text>
                  </View>
                ) : null}
              </View>
              {describe(item.filters) ? (
                <Text style={{ marginTop: 2, fontSize: 12, color: colors.textDim }}>{describe(item.filters)}</Text>
              ) : null}
            </Pressable>
          </Link>
          <Pressable
            onPress={() =>
              Alert.alert("Delete saved search?", `“${item.name}” will stop notifying you.`, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => remove.mutate(item.id) },
              ])
            }
            hitSlop={12}
          >
            <Text style={{ fontSize: 12, color: colors.textDim }}>Delete</Text>
          </Pressable>
        </View>
      )}
    />
  );
}
