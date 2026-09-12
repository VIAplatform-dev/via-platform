import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { colors, spacing } from "../../lib/theme";
import { flattenHits, hitTarget, isPiece, searchPlaceholder, type SearchGroup } from "../../lib/seller/search";
import { imageUrl } from "../../lib/imageUrl";

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
                {/* THE PIECE, NOT THE WORD "INVENTORY". A column of identical grey category labels
                    is something you have to read; a column of photographs is something you
                    recognise. Anything that isn't a piece — an order, a customer — keeps its label,
                    because there is no picture of a customer and a blank square would be worse. */}
                {isPiece(r.group) ? (
                  r.image ? (
                    <Image source={{ uri: imageUrl(r.image) }} style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: colors.chip }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: colors.chip }} />
                  )
                ) : (
                  <Text style={{ width: 44, fontSize: 10, letterSpacing: 0.8, color: colors.textDim, fontWeight: "700" }} numberOfLines={2}>
                    {r.group.toUpperCase()}
                  </Text>
                )}
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
