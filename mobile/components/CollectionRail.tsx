import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { imageUrl } from "../lib/imageUrl";
import { colors, fonts, spacing } from "../lib/theme";

// The horizontally-scrolling collection cards. Text sits ON the photograph — "CURATED BY …" small
// and letter-spaced, the collection name large in serif, and a underlined DISCOVER beneath. A scrim
// is not used; the shipped cards rely on the photographs being pale, and adding one would flatten
// them. Where a cover is dark the text still reads because it is white at full weight.

export type CollectionCard = {
  slug: string;
  name: string;
  curatedBy: string | null;
  coverImage: string | null;
};

export default function CollectionRail({ collections }: { collections: CollectionCard[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      {collections.map((c) => (
        <Link key={c.slug} href={`/collection/${c.slug}`} asChild>
          <Pressable style={{ width: 300, height: 380 }}>
            <View style={{ width: 300, height: 380, backgroundColor: colors.bgCard, overflow: "hidden" }}>
              {c.coverImage ? (
                <Image source={{ uri: imageUrl(c.coverImage) }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={180} />
              ) : null}
              <View style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg }}>
                {c.curatedBy ? (
                  <Text numberOfLines={1} style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "#FFFFFF" }}>
                    Curated by {c.curatedBy}
                  </Text>
                ) : null}
                <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: fonts.serif, fontSize: 27, color: "#FFFFFF" }}>{c.name}</Text>
                <Text style={{ marginTop: spacing.sm, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "#FFFFFF", textDecorationLine: "underline" }}>
                  Discover
                </Text>
              </View>
            </View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
