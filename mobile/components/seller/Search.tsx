import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { colors, spacing } from "../../lib/theme";
import { flattenHits, hitTarget, searchPlaceholder, type SearchGroup } from "../../lib/seller/search";

// The search box — the same "look up anything" the desktop has, on Home and Inventory.
//
// A customer at the counter says "the green Fendi" and she needs the price and whether it is
// still here in the time it takes them to finish the sentence. The route already writes the
// status into every row, so the answer is in the list, not one more tap away.

export function SearchBox({ autoFocus }: { autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  // Debounced: the route reads every order and piece the store has, so one request per keystroke
  // would be rude to the server and jittery on the phone.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const results = useQuery({
    queryKey: ["store", "search", q],
    queryFn: () => apiGet<{ groups: SearchGroup[] }>(`/api/store/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
    staleTime: 10_000,
  });
  const rows = q ? flattenHits(results.data?.groups ?? []) : [];

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.chip, borderRadius: 12, paddingHorizontal: spacing.md, height: 42 }}>
        <Feather name="search" size={16} color={colors.textDim} />
        <TextInput
          autoFocus={autoFocus}
          value={text}
          onChangeText={setText}
          placeholder={searchPlaceholder()}
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={{ flex: 1, fontSize: 15, color: colors.text }}
        />
        {results.isFetching ? <ActivityIndicator size="small" color={colors.textDim} /> : null}
      </View>

      {q ? (
        <View style={{ marginTop: spacing.sm }}>
          {results.isError ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, paddingVertical: spacing.md }}>Couldn&apos;t search just now.</Text>
          ) : rows.length === 0 && !results.isPending ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, paddingVertical: spacing.md }}>Nothing matches &ldquo;{q}&rdquo;.</Text>
          ) : (
            rows.slice(0, 12).map((r) => (
              <Pressable
                key={`${r.group}-${r.id}`}
                onPress={() => { const t = hitTarget(r.group, r.id); router.push({ pathname: t.pathname as never, params: t.params }); }}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ width: 74, fontSize: 11, letterSpacing: 0.8, color: colors.textDim, fontWeight: "700" }} numberOfLines={1}>
                  {r.group.toUpperCase()}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{r.label}</Text>
                  {/* the status rides in here already — "SKU-1042 · $420 · active" */}
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{r.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textDim} />
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
