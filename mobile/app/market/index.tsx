import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";

// Market Mode — selling in person.
//
// PORTED FROM THE WEB, NOT REBUILT. This is app/infrastructure/admin/market/page.tsx in React
// Native primitives: the same "wine band + sheet" shape, the same numbers, and above all the SAME
// ENDPOINT — /api/store/market/home returns everything this screen needs in one round trip, and
// app/lib/market/auth.ts already resolves the acting seller from the mobile JWT.
//
// It calls no market API the web app doesn't. CLAUDE.md is explicit that there must never be a
// parallel inventory or payment path: reserve via reserveItemForMarket, complete only through
// finalizeMarketSale. Every one of those lives behind these routes, so the phone stays a client.
//
// IT TAKES OVER THE SCREEN. No tab bar — it is a session (camera, cart, cash), not a destination,
// and it owns the screen until she closes it, exactly as it does on desktop. That is why this file
// sits at app/market/ rather than inside the (seller) tabs group.

type Home = {
  session: { id: string; name: string; createdAt: string };
  payments: { chargesEnabled: boolean };
  counts: {
    available: number; brought: number; broughtLeft: number; broughtValueCents: number;
    soldToday: number; grossTodayCents: number; cashCents: number; cardCents: number;
  };
  inProgress: { id: string; itemId: string; amountCents: number; createdAt: string }[];
};

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.accentText }}>{value}</Text>
      <Text style={{ fontSize: 12, color: "rgba(253,251,246,0.8)", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function BigButton({
  icon, label, onPress, secondary,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress?: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md,
        backgroundColor: secondary ? colors.chip : colors.accent,
        borderRadius: 16, paddingVertical: spacing.xl, marginTop: spacing.md,
      }}
    >
      <Feather name={icon} size={22} color={secondary ? colors.text : colors.accentText} />
      <Text style={{ fontSize: 17, fontWeight: "600", color: secondary ? colors.text : colors.accentText }}>{label}</Text>
    </Pressable>
  );
}

export default function MarketHome() {
  const { storeSlug } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["market", "home"],
    queryFn: () => apiGet<Home>("/api/store/market/home"),
    enabled: !!storeSlug,
    // She is standing at a stall; the numbers move as she sells.
    refetchInterval: 30_000,
  });

  const close = useMutation({
    mutationFn: () => apiPost("/api/store/market/mode", { enabled: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["store", "market", "mode"] });
      router.replace("/(seller)");
    },
  });

  const c = q.data?.counts;
  const onRack = c ? Math.max(0, c.available) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* The band: where she is, and how the day is going. */}
        <View style={{ backgroundColor: colors.accent, paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: 56 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 11, letterSpacing: 1.6, color: "rgba(253,251,246,0.7)", fontWeight: "600" }}>
              SELLING IN PERSON
            </Text>
            <Pressable hitSlop={12} onPress={() => close.mutate()} disabled={close.isPending}>
              <Feather name="x" size={22} color={colors.accentText} />
            </Pressable>
          </View>

          <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.accentText, marginTop: spacing.sm }}>
            {q.data?.session.name ?? "Market"}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.xxl, marginTop: spacing.lg }}>
            <Stat value={c ? formatMoney(c.grossTodayCents, "USD") : "—"} label="today" />
            <Stat value={c ? c.soldToday : "—"} label="sold" />
            <Stat value={onRack ?? "—"} label="on the rack" />
          </View>

          {c && (c.cashCents > 0 || c.cardCents > 0) ? (
            <Text style={{ fontSize: 12.5, color: "rgba(253,251,246,0.75)", marginTop: spacing.md }}>
              In the tin: {formatMoney(c.cashCents, "USD")} cash · {formatMoney(c.cardCents, "USD")} card
            </Text>
          ) : null}
        </View>

        {/* The sheet rising over it: the two things she does. */}
        <View
          style={{
            marginTop: -32, marginHorizontal: spacing.lg,
            backgroundColor: colors.bgCard, borderRadius: 22,
            borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
          }}
        >
          {q.isError ? (
            <Text style={{ fontSize: 13, color: colors.text, marginBottom: spacing.sm }}>
              Couldn&apos;t load this market.
            </Text>
          ) : null}

          <BigButton icon="camera" label="Find item" />
          <BigButton icon="plus" label="Quick list" secondary />

          {(q.data?.inProgress ?? []).map((k) => (
            <Pressable
              key={k.id}
              style={{
                flexDirection: "row", alignItems: "center", gap: spacing.md,
                backgroundColor: "rgba(93,15,23,0.08)", borderRadius: 16,
                paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.md,
              }}
            >
              <Text style={{ fontSize: 13.5, color: colors.text }}>
                <Text style={{ fontWeight: "700" }}>{formatMoney(k.amountCents, "USD")}</Text> checkout in progress
              </Text>
              <Text style={{ marginLeft: "auto", fontWeight: "700", color: colors.accent }}>Resume ›</Text>
            </Pressable>
          ))}
        </View>

        {/* Cards or cash — she needs to know before the first buyer, not at the card reader. */}
        <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700", marginTop: spacing.xl, marginHorizontal: spacing.xl }}>
          PAYMENTS
        </Text>
        <View
          style={{
            flexDirection: "row", alignItems: "center",
            marginHorizontal: spacing.lg, marginTop: spacing.sm,
            backgroundColor: colors.bgCard, borderRadius: 16,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
          }}
        >
          <Text style={{ flex: 1, fontSize: 13.5, color: colors.text }}>
            {!q.data ? "…" : q.data.payments.chargesEnabled ? "Cards and cash" : "Cash only"}
          </Text>
          {q.data && q.data.payments.chargesEnabled ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.positive }} />
              <Text style={{ fontSize: 12, color: colors.positive, fontWeight: "600" }}>Ready</Text>
            </View>
          ) : q.data ? (
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Set up cards on the desktop</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
