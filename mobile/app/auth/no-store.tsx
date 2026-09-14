import { Text, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors, fonts, spacing, radius } from "../../lib/portal-theme";

// "You're signed in, but there's no shop on that address."
//
// She pressed "Sign in as a store", typed an address, and it has no shop against it. She IS signed
// in — the link worked, the session is real — so the old behaviour was to drop her in the shopper
// marketplace, silently. From where she was standing that is indistinguishable from the app being
// broken, and it is what she reported.
//
// So it is said, with the address she used, because the usual cause is the wrong one of two.

export default function NoStore() {
 const { email } = useLocalSearchParams<{ email?: string }>();
 const address = typeof email === "string" && email ? email : null;

 return (
  <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center" }}>
   <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>No shop on that address</Text>
   <Text style={{ marginTop: spacing.md, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
    You’re signed in{address ? ` as ${address}` : ""} — but there’s no shop registered to it. If you run one,
    it’s probably under a different address; try the one you used to set the shop up.
   </Text>
   <Text style={{ marginTop: spacing.md, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
    Setting a new shop up is done on a computer — go to getvya.ai on a laptop.
   </Text>

   <Pressable
    onPress={() => router.replace("/auth/store")}
    style={{ marginTop: spacing.xl, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: spacing.lg, alignItems: "center" }}
   >
    <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "500" }}>Try another address</Text>
   </Pressable>

   {/* She is signed in, so this is a real door rather than a consolation prize. */}
   <Pressable onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.lg, alignItems: "center" }}>
    <Text style={{ color: colors.textMuted, fontSize: 14, textDecorationLine: "underline" }}>Keep shopping instead</Text>
   </Pressable>
  </View>
 );
}
