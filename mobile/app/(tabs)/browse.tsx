import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import AppHeader from "../../components/AppHeader";
import { imageUrl } from "../../lib/imageUrl";
import { colors, fonts, spacing } from "../../lib/theme";

// Browse — the way in when you don't have a search term: designers, and the curated collections.
//
// This is the home of /api/public/brands and /api/public/collections, which the shipped app called
// and nothing else here uses. Shop answers "I know what I want"; Browse answers "show me what's
// good", which on a vintage marketplace is the more common visit.

type Brand = { slug: string; label: string; count: number };
type Collection = { slug: string; name: string; curatedBy: string | null; description: string | null; coverImage: string | null; itemCount: number };

export default function BrowseScreen() {
  const brands = useQuery({ queryKey: ["brands"], queryFn: () => apiGet<{ brands: Brand[] }>("/api/public/brands") });
  const collections = useQuery({ queryKey: ["collections"], queryFn: () => apiGet<{ collections: Collection[] }>("/api/public/collections") });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <AppHeader title="Browse" />
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingVertical: spacing.lg, paddingBottom: spacing.xxl }}>
      <Text style={{ paddingHorizontal: spacing.lg, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.textDim }}>
        Collections
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.md }}>
        {(collections.data?.collections ?? []).map((c) => (
          <Link key={c.slug} href={`/collection/${c.slug}`} asChild>
            <Pressable style={{ width: 220 }}>
              <View style={{ width: 220, height: 150, borderRadius: 8, overflow: "hidden", backgroundColor: colors.bgCard }}>
                {c.coverImage ? <Image source={{ uri: imageUrl(c.coverImage) }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={180} /> : null}
              </View>
              <Text numberOfLines={1} style={{ marginTop: spacing.sm, fontFamily: fonts.serif, fontSize: 16, color: colors.text }}>{c.name}</Text>
              <Text style={{ marginTop: 1, fontSize: 12, color: colors.textDim }}>
                {c.curatedBy ? `Curated by ${c.curatedBy}` : `${c.itemCount} pieces`}
              </Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>

      <Text style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.lg, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.textDim }}>
        Designers
      </Text>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        {(brands.data?.brands ?? []).map((b) => (
          <Link key={b.slug} href={`/search?designer=${encodeURIComponent(b.slug)}`} asChild>
            <Pressable style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 15, color: colors.text }}>{b.label}</Text>
              <Text style={{ fontSize: 12, color: colors.textDim }}>{b.count}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
    </View>
  );
}
