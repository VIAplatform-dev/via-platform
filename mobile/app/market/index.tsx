import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { filterRack, sortRack, rackSubtitle, rackEmptyMessage, SELLABLE, type RackItem } from "../../lib/market/rack";

// Market Mode — selling in person.
//
// PORTED FROM THE WEB, NOT REBUILT. This is app/infrastructure/admin/market/page.tsx in React
// Native primitives: the same "wine band + sheet" shape, the same numbers, and above all the SAME
// ENDPOINTS — app/lib/market/auth.ts already resolves the acting seller from the mobile JWT.
//
// It calls no market API the web app doesn't. CLAUDE.md is explicit that there must never be a
// parallel inventory or payment path: reserve via reserveItemForMarket, complete only through
// finalizeMarketSale. Every one of those lives behind these routes, so the phone stays a client.
//
// IT TAKES OVER THE SCREEN. No tab bar — it is a session (camera, cart, cash), not a destination,
// and it owns the screen until she closes it, exactly as it does on desktop.
//
// THE RACK IS THE SCREEN. It used to be two enormous buttons and three numbers: you could see how
// the day was going but not one thing you had brought, and the only way to find a piece was to
// PHOTOGRAPH it. Standing at a stall with the buyer holding the thing, "take a picture and wait"
// is not an answer, and you could not type "fendi bag" at all. Now every sellable piece is listed,
// searchable by typing, and one tap from a sale. Find by photo and Quick list are still here —
// smaller, because they are the two exceptions, not the main event.

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

/** Find by photo / Quick list. Half-width and a third of the height they were: the rack below is
 *  the screen now, and these two must not push it off it. */
function Action({
  icon, label, onPress, primary,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
        backgroundColor: primary ? colors.accent : colors.chip,
        borderRadius: 12, paddingVertical: spacing.md,
      }}
    >
      <Feather name={icon} size={16} color={primary ? colors.accentText : colors.text} />
      <Text style={{ fontSize: 14, fontWeight: "600", color: primary ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  );
}

export default function MarketHome() {
  const { storeSlug } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Her currency AND her shop's name. The name is not decoration: this screen is where she takes
  // real cash, and until it said so there was nothing anywhere in Market Mode identifying WHICH
  // store the app was signed in as — the big title is the market SESSION, which reads like an
  // account name and isn't one.
  const me = useQuery({
    queryKey: ["store", "me"],
    queryFn: () => apiGet<{ currency: string; storeName?: string; storeSlug?: string }>("/api/store/me"),
    enabled: !!storeSlug,
  });

  const q = useQuery({
    queryKey: ["market", "home"],
    queryFn: () => apiGet<Home>("/api/store/market/home"),
    enabled: !!storeSlug,
    // She is standing at a stall; the numbers move as she sells.
    refetchInterval: 30_000,
  });

  // The whole rack, once. Filtering happens on the phone: a market has bad signal, and the answer
  // should land before she finishes typing rather than after a round trip.
  const rack = useQuery({
    queryKey: ["market", "rack"],
    queryFn: () => apiGet<{ items: RackItem[] }>("/api/store/market/inventory?view=available"),
    enabled: !!storeSlug,
    staleTime: 30_000,
  });

  const close = useMutation({
    mutationFn: () => apiPost("/api/store/market/mode", { enabled: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["store", "market", "mode"] });
      router.replace("/(seller)");
    },
  });

  const currency = me.data?.currency ?? "USD";
  const c = q.data?.counts;
  const onRack = c ? Math.max(0, c.available) : null;

  const all = useMemo(() => rack.data?.items ?? [], [rack.data]);
  const shown = useMemo(() => sortRack(filterRack(all, query)), [all, query]);

  /** One tap from the rack to a cash checkout — the same single path find.tsx uses. */
  async function sell(item: RackItem) {
    if (starting) return;
    setError(null);
    setStarting(item.id);
    try {
      const r = await apiPost<{ ok: boolean; checkout: { id: string; amountCents: number } }>("/api/store/market/checkout", {
        itemId: item.id, tender: "cash", clientKey: `phone-${item.id}-${Date.now()}`,
      });
      router.push({ pathname: "/market/checkout/[id]", params: { id: r.checkout.id } });
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Couldn't start that sale.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The app sets a dark status bar globally, which is right on cream and unreadable here. A
          per-screen StatusBar overrides it while this screen is focused and restores it on the way out. */}
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {/* The band: who she is, where she is, and how the day is going. */}
        <View style={{ backgroundColor: colors.accent, paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: 44 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 11, letterSpacing: 1.6, color: "rgba(253,251,246,0.7)", fontWeight: "600" }} numberOfLines={1}>
              {me.data?.storeName ? `SELLING AS ${me.data.storeName.toUpperCase()}` : "SELLING IN PERSON"}
            </Text>
            <Pressable hitSlop={12} onPress={() => close.mutate()} disabled={close.isPending}>
              <Feather name="x" size={22} color={colors.accentText} />
            </Pressable>
          </View>

          <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.accentText, marginTop: spacing.sm }}>
            {q.data?.session.name ?? "Market"}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.xxl, marginTop: spacing.lg }}>
            <Stat value={c ? formatMoney(c.grossTodayCents, currency) : "—"} label="today" />
            <Stat value={c ? c.soldToday : "—"} label="sold" />
            <Stat value={onRack ?? "—"} label="on the rack" />
          </View>

          {c && (c.cashCents > 0 || c.cardCents > 0) ? (
            <Text style={{ fontSize: 12.5, color: "rgba(253,251,246,0.75)", marginTop: spacing.md }}>
              In the tin: {formatMoney(c.cashCents, currency)} cash · {formatMoney(c.cardCents, currency)} card
            </Text>
          ) : null}
        </View>

        {/* The sheet rising over it: search first, then the two exceptions. */}
        <View
          style={{
            marginTop: -26, marginHorizontal: spacing.lg,
            backgroundColor: colors.bgCard, borderRadius: 18,
            borderWidth: 1, borderColor: colors.border, padding: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.chip, borderRadius: 10, paddingHorizontal: spacing.md, height: 44 }}>
            <Feather name="search" size={16} color={colors.textDim} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Fendi bag, size 38, silk scarf…"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={{ flex: 1, fontSize: 15, color: colors.text }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Action icon="camera" label="Find by photo" onPress={() => router.push("/market/find")} />
            <Action icon="plus" label="Quick list" primary onPress={() => router.push("/market/quick")} />
          </View>

          {q.isError ? (
            <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm }}>Couldn&apos;t load this market.</Text>
          ) : null}
          {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm }}>{error}</Text> : null}

          {(q.data?.inProgress ?? []).map((k) => (
            <Pressable
              key={k.id}
              onPress={() => router.push({ pathname: "/market/checkout/[id]", params: { id: k.id } })}
              style={{
                flexDirection: "row", alignItems: "center", gap: spacing.md,
                backgroundColor: "rgba(93,15,23,0.08)", borderRadius: 12,
                paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 13.5, color: colors.text }}>
                <Text style={{ fontWeight: "700" }}>{formatMoney(k.amountCents, currency)}</Text> checkout in progress
              </Text>
              <Text style={{ marginLeft: "auto", fontWeight: "700", color: colors.accent }}>Resume ›</Text>
            </Pressable>
          ))}
        </View>

        {/* THE RACK. Every sellable piece, one tap from a sale. */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginHorizontal: spacing.xl }}>
          <Text style={{ flex: 1, fontSize: 10, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700" }}>
            {query.trim() ? `MATCHES (${shown.length})` : `ON THE RACK (${shown.length})`}
          </Text>
          {rack.isFetching ? <ActivityIndicator size="small" color={colors.textDim} /> : null}
        </View>

        {rack.isPending ? (
          <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: spacing.md, marginHorizontal: spacing.xl }}>Loading your pieces…</Text>
        ) : rack.isError ? (
          <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: spacing.md, marginHorizontal: spacing.xl, lineHeight: 20 }}>
            Couldn&apos;t load your inventory just now. Find by photo still works.
          </Text>
        ) : shown.length === 0 ? (
          <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: spacing.md, marginHorizontal: spacing.xl, lineHeight: 20 }}>
            {rackEmptyMessage(all.length, query)}
          </Text>
        ) : (
          <View style={{ marginTop: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {shown.map((item, i) => {
              const sellable = SELLABLE.has(item.status);
              return (
                <Pressable
                  key={item.id}
                  disabled={!sellable || starting !== null}
                  onPress={() => void sell(item)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: spacing.md,
                    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                    opacity: sellable ? 1 : 0.5,
                  }}
                >
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.chip }} />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="image" size={16} color={colors.textDim} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{item.title}</Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                      {rackSubtitle(item, formatMoney)}
                    </Text>
                  </View>
                  {starting === item.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : sellable ? (
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.accent }}>Sell ›</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={() => router.push("/market/sales")}
          style={{
            flexDirection: "row", alignItems: "center",
            marginHorizontal: spacing.lg, marginTop: spacing.lg,
            backgroundColor: colors.bgCard, borderRadius: 14,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
          }}
        >
          <Feather name="list" size={16} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 13.5, color: colors.text, marginLeft: spacing.md }}>Sales today</Text>
          <Text style={{ fontWeight: "700", color: colors.accent }}>›</Text>
        </Pressable>

        {/* Cards or cash — she needs to know before the first buyer, not at the card reader. */}
        <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700", marginTop: spacing.xl, marginHorizontal: spacing.xl }}>
          PAYMENTS
        </Text>
        <View
          style={{
            flexDirection: "row", alignItems: "center",
            marginHorizontal: spacing.lg, marginTop: spacing.sm,
            backgroundColor: colors.bgCard, borderRadius: 14,
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
            // Was "Set up cards on the desktop". Connecting Stripe is a button on Payouts now, so
            // this points at it — a market is exactly when she notices she can't take a card.
            <Pressable hitSlop={8} onPress={() => router.push("/(seller)/payouts")}>
              <Text style={{ fontSize: 12, color: colors.accent, fontWeight: "600" }}>Set up cards</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Which account this is, spelled out. Small, at the bottom, but unambiguous: a seller
            taking cash should never have to guess whose inventory she is selling. */}
        {me.data?.storeSlug ? (
          <Text style={{ fontSize: 11.5, color: colors.textDim, textAlign: "center", marginTop: spacing.xl, marginHorizontal: spacing.xl }}>
            Signed in as {me.data.storeName ?? me.data.storeSlug} · /stores/{me.data.storeSlug}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
