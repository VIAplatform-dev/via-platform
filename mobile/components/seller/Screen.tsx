import { ScrollView, Text, View, RefreshControl, Pressable } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts } from "../../lib/theme";

// The frame every seller screen sits in.
//
// It exists because these screens draw their own headers rather than using the shopper app's
// AppHeader, and the top inset is the thing that is silently wrong when each screen owns it —
// content slides under the status bar and the notch, which is easy to miss on a simulator and
// impossible to miss on a phone.

export function SellerScreen({
  title,
  subtitle,
  back,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  subtitle?: string;
  /** A back chevron and a centred title — the shape used by everything reached from the drawer. */
  back?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.xxl,
      }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.textDim} /> : undefined
      }
    >
      {back ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(seller)"))} hitSlop={12}>
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 16, color: colors.text, fontWeight: "600", marginRight: 24 }}>
            {title}
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.text }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </>
      )}
      {children}
    </ScrollView>
  );
}

/** The filter row. Selected is near-black on cream, as the mockups draw it — not burgundy, which
 *  would compete with the ink everything else is written in. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: 999,
              backgroundColor: on ? colors.chipActive : colors.chip,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One resting state, used wherever a list can legitimately be empty. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 14, color: colors.textMuted, paddingVertical: spacing.xl, textAlign: "center" }}>
      {children}
    </Text>
  );
}
