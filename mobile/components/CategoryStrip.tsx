import { Pressable, ScrollView, Text } from "react-native";
import { Link } from "expo-router";
import { colors, spacing } from "../lib/theme";

// The row under the wordmark on Home. Plain text, evenly spread, no pills or chips — it reads as
// a masthead's nav rather than a filter bar, which is the point: these are departments, not toggles.

const CATEGORIES: { label: string; slug: string }[] = [
  { label: "Clothing", slug: "clothing" },
  { label: "Shoes", slug: "shoes" },
  { label: "Bags", slug: "bags" },
  { label: "Accessories", slug: "accessories" },
  { label: "Home", slug: "home" },
];

export default function CategoryStrip() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xl, paddingVertical: spacing.md }}
    >
      {CATEGORIES.map((c) => (
        <Link key={c.slug} href={`/category/${c.slug}`} asChild>
          <Pressable>
            <Text style={{ fontSize: 17, color: colors.text }}>{c.label}</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
