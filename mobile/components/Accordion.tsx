import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing } from "../lib/theme";

// The collapsible rows under a product. Uppercase letter-spaced label, a +/− at the right, a hairline
// under each. Product Details opens by default because it is the one people came for; the policies
// are there when asked for and quiet when not.

export default function Accordion({
  label, body, defaultOpen,
}: { label: string; body: string | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  if (!body) return null;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg }}
      >
        <Text style={{ fontSize: 14, letterSpacing: 1.6, textTransform: "uppercase", color: colors.text }}>{label}</Text>
        <Feather name={open ? "minus" : "plus"} size={20} color={colors.text} />
      </Pressable>
      {open ? (
        <Text style={{ paddingBottom: spacing.lg, fontSize: 15, lineHeight: 23, color: colors.text }}>{body}</Text>
      ) : null}
    </View>
  );
}
