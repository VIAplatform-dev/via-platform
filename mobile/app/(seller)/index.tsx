import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import {
  formatMoney,
  percentDelta,
  ordersToPostLabel,
  inventoryLabel,
  toPostOrders,
  toPostSubtitle,
  greeting,
} from "../../lib/seller/home";

// Home, the hub.
//
// Uber's shape: one fat action first, then big tappable tiles, then a short list of what is
// actually waiting. Takings sit under the greeting rather than inside a card — it is the question
// she opened the app to answer, not a widget.
//
// EVERY TILE RESOLVES INDEPENDENTLY. Five queries, no Promise.all: a slow consignment rollup must
// not blank the takings. Each tile shows its own resting state until its own data lands, and a
// tile whose number is zero still occupies its space — this is a fixed hub, not a feed, and a
// screen that reflows as data arrives is one she cannot learn the shape of.

/* ── response shapes, read off the routes rather than guessed ──────────── */

type Me = { storeName: string; currency: string; website: string; storeFollowers?: number };
type Overview = {
  revenueCents: number;
  prior: { revenueCents: number };
  inventory: { active: number; draft: number };
};
type OrderRow = { id: string; status: string; itemTitle: string | null };
type Consignment = { owedCents: number; activity: { payee: string; status: "payable" | "hold" }[] };
type Conversation = { id: number; buyerName: string | null; itemTitle: string | null; storeUnread: number; lastMessageAt: string };

/* ── pieces ─────────────────────────────────────────────────────────────── */

/**
 * What a tile says when it does not actually know the number yet.
 *
 * This screen exists to tell her what is waiting on her, so a failed request must never render as
 * a confident zero: "Nothing to post" when /api/store/orders 500s is how a seller misses a parcel.
 * Null means the data is genuinely loaded and the real label should be used.
 */
function unknown(q: { isPending: boolean; isError: boolean }): string | null {
  if (q.isError) return "Couldn't load";
  if (q.isPending) return " ";
  return null;
}

function Tile({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: object }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.lg, ...style }}
    >
      {children}
    </Pressable>
  );
}

function Row({ icon, title, subtitle, onPress }: { icon: React.ComponentProps<typeof Feather>["name"]; title: string; subtitle?: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon} size={17} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDim} />
    </Pressable>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

export default function SellerHome() {
  const { user, storeSlug, loading } = useAuth();
  const isFocused = useIsFocused();
  // This screen draws its own header rather than using AppHeader, so it owns its top inset —
  // without it the greeting sits under the status bar and the notch.
  const insets = useSafeAreaInsets();

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<Me>("/api/store/me"), enabled: !!storeSlug });
  const overview = useQuery({ queryKey: ["store", "overview", 1], queryFn: () => apiGet<Overview>("/api/store/analytics/overview?days=1"), enabled: !!storeSlug });
  const orders = useQuery({ queryKey: ["store", "orders"], queryFn: () => apiGet<{ orders: OrderRow[] }>("/api/store/orders"), enabled: !!storeSlug });
  const consignment = useQuery({ queryKey: ["store", "consignment"], queryFn: () => apiGet<Consignment>("/api/store/consignment/summary"), enabled: !!storeSlug });
  const inbox = useQuery({ queryKey: ["store", "inbox"], queryFn: () => apiGet<{ conversations: Conversation[] }>("/api/store/inbox"), enabled: !!storeSlug });

  // Pull-to-refresh drives all five together: she pulls to answer "has anything changed", and a
  // gesture that refreshed only some of the screen would be worse than none.
  const queries = [me, overview, orders, consignment, inbox];

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;
  // A shopper who lands here by a stale link belongs in the shopper tabs, not on an empty hub.
  // isFocused for the same reason as the shopper home: an unfocused screen that still renders a
  // <Redirect> volleys with the one it points at.
  if (!storeSlug && isFocused) return <Redirect href="/(tabs)" />;
  // DO NOT navigate on an API error. A 403 from /api/store/* means "this account is not a store
  // partner" — not "you are signed out" — and ApiError lumps 401 and 403 together as `needsAuth`.
  // Redirecting to sign-in on it produced an infinite loop: login sees a valid user and sends us
  // straight back here, which 403s again. A genuinely expired token is already cleared by the
  // launch check in lib/auth.tsx, so this screen has no navigating left to do; it just says so.
  const blocked = me.error instanceof ApiError && me.error.status === 403;

  const currency = me.data?.currency ?? "USD";
  const takings = overview.data ? formatMoney(overview.data.revenueCents, currency) : "—";
  const delta = overview.data ? percentDelta(overview.data.revenueCents, overview.data.prior.revenueCents) : null;

  const posting = toPostOrders(orders.data?.orders ?? []);
  const unread = (inbox.data?.conversations ?? []).filter((c) => c.storeUnread > 0);
  const payable = (consignment.data?.activity ?? []).filter((a) => a.status === "payable");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={queries.some((q) => q.isRefetching)}
          onRefresh={() => queries.forEach((q) => void q.refetch())}
          tintColor={colors.textDim}
        />
      }
    >
      {blocked ? (
        <View style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.text }}>
            Signed in, but this account isn&apos;t linked to a store yet.
          </Text>
        </View>
      ) : null}

      {/* greeting */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chip }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>{greeting(new Date().getHours())}</Text>
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text }} numberOfLines={1}>
            {me.data?.storeName ?? storeSlug}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/(seller)/notifications")} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
          <Feather name="bell" size={17} color={colors.text} />
        </Pressable>
      </View>

      {/* takings — the question she opened the app to answer */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.xl }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 34, color: colors.text }}>{takings}</Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>today</Text>
        {delta !== null ? (
          <Text style={{ fontSize: 14, color: delta >= 0 ? colors.positive : colors.text, fontWeight: "600" }}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </Text>
        ) : null}
      </View>

      {/* orders — widest tile, top, because it is the most time-critical thing she does */}
      <Tile onPress={() => router.push("/(seller)/orders")} style={{ marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Feather name="shopping-bag" size={18} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>
            {unknown(orders) ?? ordersToPostLabel(posting.length)}
          </Text>
          {posting.length > 0 ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{toPostSubtitle(posting)}</Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={18} color={colors.textDim} />
      </Tile>

      {/* the two square tiles */}
      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
        <Tile onPress={() => router.push("/(seller)/inventory")} style={{ flex: 1 }}>
          <Feather name="box" size={18} color={colors.text} />
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600", marginTop: spacing.xl }}>Inventory</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            {unknown(overview) ?? inventoryLabel(overview.data!.inventory)}
          </Text>
        </Tile>
        <Tile onPress={() => router.push("/(seller)/consignment")} style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="archive" size={18} color={colors.text} />
            {payable.length > 0 ? (
              <View style={{ marginLeft: "auto", minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                <Text style={{ color: colors.accentText, fontSize: 11, fontWeight: "700" }}>{payable.length}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600", marginTop: spacing.xl }}>Consignment</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            {unknown(consignment) ??
              (payable.length > 0 ? `${payable.length} payout${payable.length === 1 ? "" : "s"} due` : "Nothing due")}
          </Text>
        </Tile>
      </View>

      {/* storefront */}
      <Tile onPress={() => router.push("/(seller)/store")} style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Feather name="home" size={18} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.textMuted }}>Storefront</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.positive }} />
            <Text style={{ fontSize: 13, color: colors.textMuted }} numberOfLines={1}>
              Live{me.data?.storeFollowers ? ` · ${me.data.storeFollowers} follows` : ""}
              {me.data?.website ? ` · ${me.data.website.replace(/^https?:\/\//, "")}` : ""}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textDim} />
      </Tile>

      {/* needs you */}
      <Text style={{ fontFamily: fonts.serif, fontSize: 17, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.xs }}>
        Needs you
      </Text>
      {inbox.isError || consignment.isError ? (
        // Same rule as the tiles: an unread buyer message we failed to fetch is not "nothing".
        <Text style={{ fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md }}>
          Couldn&apos;t load what&apos;s waiting. Pull to try again.
        </Text>
      ) : unread.length === 0 && payable.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md }}>
          {inbox.isPending ? " " : "Nothing waiting on you."}
        </Text>
      ) : (
        <>
          {unread.slice(0, 3).map((c) => (
            <Row
              key={c.id}
              onPress={() => router.push({ pathname: "/(seller)/message/[id]", params: { id: String(c.id) } })}
              icon="mail"
              title={`${c.buyerName ?? "A buyer"} asked about ${c.itemTitle ?? "a piece"}`}
              subtitle={new Date(c.lastMessageAt).toLocaleDateString()}
            />
          ))}
          {payable.length > 0 ? (
            <Row icon="archive" onPress={() => router.push("/(seller)/consignment")} title={`${payable.length} consignor payout${payable.length === 1 ? "" : "s"} due`} />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
