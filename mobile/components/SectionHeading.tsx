import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import { colors, eyebrow, fonts, spacing } from "../lib/theme";

// Every section on Home and Shop is announced the same way: a small letter-spaced eyebrow, then the
// name in serif underneath. The eyebrow carries the category ("JUST IN", "SHOP BY", "CURATED FOR")
// and the serif line carries the noun ("New Arrivals", "Collection", "You"), so the two read as one
// sentence rather than a label and a title.

export default function SectionHeading({
  eyebrow: brow, title, seeAllHref,
}: { eyebrow: string; title: string; seeAllHref?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
      <View style={{ flex: 1 }}>
        <Text style={eyebrow}>{brow}</Text>
        <Text style={{ marginTop: 2, fontFamily: fonts.serif, fontSize: 30, color: colors.text }}>{title}</Text>
      </View>
      {seeAllHref ? (
        <Link href={seeAllHref} asChild>
          <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 6 }}>
            <Text style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: colors.text }}>See all</Text>
            <Feather name="arrow-right" size={14} color={colors.text} />
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}
