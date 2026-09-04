import { Linking, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen } from "../../components/seller/Screen";

// Four questions sellers actually ask, then a way to reach a person, with the hours stated.

const COMMON = [
  "Why hasn't my payout arrived?",
  "Shipping abroad and customs",
  "Getting a piece on Depop",
  "Handling a return",
];

export default function HelpScreen() {
  return (
    <SellerScreen title="Help" back>
      <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600", marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Common
      </Text>
      {COMMON.map((q) => (
        <Pressable key={q} style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{q}</Text>
          <Feather name="chevron-right" size={18} color={colors.textDim} />
        </Pressable>
      ))}

      <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>Still stuck?</Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>We answer within a few hours, 9–6 UK.</Text>
        <Pressable
          onPress={() => void Linking.openURL("mailto:hana@vyaplatform.com?subject=Help%20with%20my%20store")}
          style={{ backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg }}
        >
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>Message us</Text>
        </Pressable>
      </View>
    </SellerScreen>
  );
}
