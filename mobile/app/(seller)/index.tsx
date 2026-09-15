import { Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { apiGet, ApiError, API_BASE_URL } from "../../lib/api";
import { rentalDay, rentalsTileLine, todayDay, type Booking } from "../../lib/seller/rentals";
import { daySchedule, appointmentsTileLine, type Appointment } from "../../lib/seller/appointments";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts, radius, pill } from "../../lib/portal-theme";
import { agingTile, type AgingBuckets } from "../../lib/seller/aging";
import { holdLapseRow, type HoldRow } from "../../lib/seller/holds";
import { setupSummary, phoneRouteFor, type SetupStep } from "../../lib/seller/setup";
import { needsYouRows, type AttentionRow } from "../../lib/seller/attention";
import { netProfitLine, type MarginSection } from "../../lib/seller/profit";
import { SearchBox } from "../../components/seller/Search";
import {
  formatMoney,
  percentDelta,
  inventoryLabel,
  toPostSubtitle,
  greeting,
} from "../../lib/seller/home";
import { parcelsToPost, parcelsToPostLabel, type Parcel } from "../../lib/seller/parcels";

// Home, the hub.
//
// Uber's shape: one fat action first, then big tappable tiles, then a short list of what is
// actually waiting. Takings sit under the greeting rather than inside a card. It is the question
// she opened the app to answer, not a widget.
//
// EVERY TILE RESOLVES INDEPENDENTLY. Five queries, no Promise.all: a slow consignment rollup must
// not blank the takings. Each tile shows its own resting state until its own data lands, and a
// tile whose number is zero still occupies its space. This is a fixed hub, not a feed, and a
// screen that reflows as data arrives is one she cannot learn the shape of.

/* ── response shapes, read off the routes rather than guessed ──────────── */

type Me = { storeName: string; currency: string; website: string; storeFollowers?: number; logo?: string | null; logoBg?: string | null };
/** Everything /api/store/home returns. One payload, already shaped for what this screen draws. */
type HomeData = {
  takings: { revenueCents: number; priorRevenueCents: number };
  inventory: { live: number; drafts: number; aging: AgingBuckets };
  parcels: Parcel<OrderRow>[];
  inbox: { unread: Conversation[] };
  consignment: { payable: { payee: string; item: string; netCents: number; status: string }[] };
  holds: { today: HoldRow[] };
  attention: AttentionRow[];
  market: { enabled: boolean };
  rentals: { enabled: boolean; bookings: Booking[] };
  appointments: { enabled: boolean; day: string; appointments: Appointment[] };
};
type OrderRow = { id: string; status: string; itemTitle: string | null; paymentIntent?: string | null; buyerEmail?: string | null; paidAt?: string | null; deliveryMethod?: "ship" | "pickup" };
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
      style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.lg, ...style }}
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
  // This screen draws its own header rather than using AppHeader, so it owns its top inset,
  // without it the greeting sits under the status bar and the notch.
  const insets = useSafeAreaInsets();

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<Me>("/api/store/me"), enabled: !!storeSlug });
  const home = useQuery({ queryKey: ["store", "home"], queryFn: () => apiGet<HomeData>("/api/store/home"), enabled: !!storeSlug });
  const setup = useQuery({ queryKey: ["store", "onboarding-status"], queryFn: () => apiGet<{ setup: SetupStep[]; setupComplete: boolean }>("/api/store/onboarding-status"), enabled: !!storeSlug });
  const profit = useQuery({ queryKey: ["store", "suite", "margin", "30d"], queryFn: () => apiGet<{ margin?: MarginSection }>("/api/store/analytics/suite?sections=margin&period=30d"), enabled: !!storeSlug });

  const d = home.data;
  const rentalsOn = Boolean(d?.rentals.enabled);
  const apptsOn = Boolean(d?.appointments.enabled);
  const today = d?.appointments.day ?? todayDay();

  // Pull-to-refresh drives all of them together: she pulls to answer "has anything changed", and a
  // gesture that refreshed only some of the screen would be worse than none.
  const queries = [me, home, setup, profit];

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;
  // A shopper who lands here by a stale link belongs in the shopper tabs, not on an empty hub.
  // isFocused for the same reason as the shopper home: an unfocused screen that still renders a
  // <Redirect> volleys with the one it points at.
  if (!storeSlug && isFocused) return <Redirect href="/(tabs)" />;
  // DO NOT navigate on an API error. A 403 from /api/store/* means "this account is not a store
  // partner", not "you are signed out", and ApiError lumps 401 and 403 together as `needsAuth`.
  // Redirecting to sign-in on it produced an infinite loop: login sees a valid user and sends us
  // straight back here, which 403s again. A genuinely expired token is already cleared by the
  // launch check in lib/auth.tsx, so this screen has no navigating left to do; it just says so.
  const blocked = me.error instanceof ApiError && me.error.status === 403;

  const currency = me.data?.currency ?? "USD";
  const takings = d ? formatMoney(d.takings.revenueCents, currency) : "-";
  const delta = d ? percentDelta(d.takings.revenueCents, d.takings.priorRevenueCents) : null;
  const netProfit = netProfitLine(profit.data?.margin, currency);

  // All of these arrive ready. Parcels are already grouped, unread threads already filtered, the
  // aging buckets already counted. The server did it beside the data instead of the phone doing it
  // after downloading everything.
  const postingParcels = parcelsToPost(d?.parcels ?? []);
  // The individual pieces inside those bags, for the "Coat, boots and 2 more" line.
  const posting = postingParcels.flatMap((p) => p.orders ?? []);
  const unread = d?.inbox.unread ?? [];
  const payable = d?.consignment.payable ?? [];
  const lapsing = d?.holds.today ?? [];
  const aging = d ? agingTile(d.inventory.aging) : null;
  // The server's rows, minus the ones this screen already draws with more detail (holds by name,
  // the payouts line). Every row the app knows about has an in-app screen; the browser fallback is
  // reached only by a row a NEWER server invented that this build has never heard of, where a dead
  // tap would be worse than an unfamiliar one. attention.ts is the list.
  const extra = needsYouRows(d?.attention ?? [], { holdsShown: lapsing.length > 0, payoutsShown: payable.length > 0 });
  const openRow = (r: (typeof extra)[number]) => {
    if (r.route) router.push({ pathname: r.route.pathname as never, params: r.route.params });
    else void WebBrowser.openBrowserAsync(`${API_BASE_URL}${r.href}`);
  };

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
        <View style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.md, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.text }}>
            Signed in, but this account isn&apos;t linked to a store yet.
          </Text>
        </View>
      ) : null}

      {/* greeting */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        {/* HER SHOP'S MARK, not a grey disc.
            /api/store/me has returned `logo` all along: it is the one she uploads for her
            storefront, and this drew an empty circle regardless. A seller opening her own
            workspace should see her own shop. `logoBg` is the colour the storefront sets behind
            it, because a mark drawn for a dark header disappears on paper.
            Falls back to her initial rather than to nothing: an empty circle beside her name reads
            as a picture that failed to load. */}
        <View style={{ width: 40, height: 40, borderRadius: pill, backgroundColor: me.data?.logoBg || colors.accentSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {me.data?.logo ? (
            <Image source={{ uri: me.data.logo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          ) : (
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>
              {(me.data?.storeName ?? storeSlug ?? "?").trim().charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>{greeting(new Date().getHours())}</Text>
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text }} numberOfLines={1}>
            {me.data?.storeName ?? storeSlug}
          </Text>
        </View>
        {/* NO SHOPPING BAG HERE.
            It used to sit beside the bell and open the marketplace. Two problems: the tab bar
            already has a shopping-bag glyph, and there it means her own Store, so one icon meant
            two different shops on one screen. And leaving the workspace entirely is not a thing to
            put one thumb-slip from the bell. The deliberate route out is Settings, "Exit to
            Marketplace", which says where it goes in words. */}
        <Pressable onPress={() => router.push("/(seller)/notifications")} style={{ width: 36, height: 36, borderRadius: pill, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
          <Feather name="bell" size={17} color={colors.textMuted} />
        </Pressable>
        {/* Ask VYA. The one filled control in this header, because it DOES something rather than
            going somewhere, and because a seller who has only met the assistant on her laptop has
            to be able to find it without being told. */}
        <Pressable
          onPress={() => router.push("/(seller)/assistant?from=Home")}
          accessibilityLabel="Ask VYA"
          style={{ width: 36, height: 36, borderRadius: pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
        >
          <Feather name="zap" size={16} color={colors.accentText} />
        </Pressable>
      </View>

      {/* takings. The question she opened the app to answer */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.xl }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 34, color: colors.text }}>{takings}</Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>today</Text>
        {delta !== null ? (
          <Text style={{ fontSize: 14, color: delta >= 0 ? colors.positive : colors.text, fontWeight: "600" }}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </Text>
        ) : null}
      </View>
      {/* net profit, 30 days. The same number the web Home prints; absent when no sold piece has a cost */}
      {netProfit !== null ? (
        <Pressable onPress={() => router.push("/(seller)/analytics")} style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Net profit · 30d</Text>
          <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{netProfit}</Text>
        </Pressable>
      ) : null}

      {/* set up your store, until every required step is done; the domain is optional and says so */}
      {setup.data && Array.isArray(setup.data.setup) && setup.data.setup.length > 0 && !setup.data.setupComplete ? (() => {
        const steps = setup.data.setup;
        const sum = setupSummary(steps);
        // All six known steps now have a screen (lib/seller/setup.ts). This fallback fires only for
        // a step a newer server added that this build cannot route, never for anything shipped.
        const open = (s: SetupStep) => {
          const route = phoneRouteFor(s);
          if (route) router.push(route);
          else void WebBrowser.openBrowserAsync(`${API_BASE_URL}${s.href}`);
        };
        return (
          <View style={{ marginTop: spacing.lg, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }}>Set up your store</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{sum.done} of {sum.total} done</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>Finish these and your first sale has nowhere to go wrong.</Text>
            <View style={{ marginTop: spacing.sm }}>
              {steps.map((s) => {
                const isNext = sum.next?.id === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => open(s)}
                    accessibilityRole="button"
                    accessibilityState={{ checked: s.done }}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm }}
                  >
                    <Feather name={s.done ? "check-circle" : "circle"} size={18} color={s.done || isNext ? colors.positive : colors.textDim} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 14, color: s.done ? colors.textDim : colors.text, fontWeight: isNext ? "600" : "400", textDecorationLine: s.done ? "line-through" : "none" }}
                        numberOfLines={1}
                      >
                        {s.label}
                      </Text>
                      {s.hint && !s.done ? <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>{s.hint}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textDim} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })() : null}

      {/* orders. Widest tile, top, because it is the most time-critical thing she does */}
      <View style={{ marginTop: spacing.lg }}><SearchBox /></View>

      <Tile onPress={() => router.push("/(seller)/orders")} style={{ marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Feather name="shopping-bag" size={18} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>
            {unknown(home) ?? parcelsToPostLabel(postingParcels.length)}
          </Text>
          {posting.length > 0 ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{toPostSubtitle(posting.map((o) => ({ itemTitle: o.itemTitle ?? null })))}</Text>
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
            {unknown(home) ?? inventoryLabel({ active: d!.inventory.live, draft: d!.inventory.drafts })}
          </Text>
          {aging ? (
            <Text style={{ fontSize: 12.5, color: colors.accent, marginTop: 4 }} numberOfLines={1}>{aging}</Text>
          ) : null}
        </Tile>
        <Tile onPress={() => router.push("/(seller)/consignment")} style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="archive" size={18} color={colors.text} />
            {payable.length > 0 ? (
              <View style={{ marginLeft: "auto", minWidth: 20, height: 20, borderRadius: pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                <Text style={{ color: colors.accentText, fontSize: 11, fontWeight: "700" }}>{payable.length}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600", marginTop: spacing.xl }}>Consignment</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            {unknown(home) ??
              (payable.length > 0 ? `${payable.length} payout${payable.length === 1 ? "" : "s"} due` : "Nothing due")}
          </Text>
        </Tile>
      </View>

      {/* Today's diary and today's rentals, only for the stores that run them. Both answer the
          standing-up question on the tile itself, so opening the screen is a choice not a chore. */}
      {apptsOn ? (
        <Tile onPress={() => router.push("/(seller)/appointments")} style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Feather name="calendar" size={18} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>Appointments</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
              {home.isPending ? "…" : appointmentsTileLine(daySchedule(d?.appointments.appointments ?? [], today))}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textDim} />
        </Tile>
      ) : null}

      {rentalsOn ? (() => {
        const day = rentalDay(d?.rentals.bookings ?? [], today);
        return (
          <Tile onPress={() => router.push("/(seller)/rentals")} style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Feather name="repeat" size={18} color={day.overdue.length ? colors.accent : colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>Rentals</Text>
              <Text style={{ fontSize: 13, color: day.overdue.length ? colors.accent : colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                {home.isPending ? "…" : rentalsTileLine(day)}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textDim} />
          </Tile>
        );
      })() : null}

      {/* market mode: the whole screen when she's at a stall, so it gets a row of its own */}
      <Tile onPress={() => router.push("/market")} style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Feather name="shopping-bag" size={18} color={d?.market.enabled ? colors.positive : colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>Market Mode</Text>
          <Text style={{ fontSize: 13, color: d?.market.enabled ? colors.positive : colors.textMuted, marginTop: 2 }} numberOfLines={1}>
            {d?.market.enabled ? "Running, take the till with you" : "Sell in person, off the phone"}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textDim} />
      </Tile>

      {/* storefront: the address is HER VYA SHOP, never me.website.
          
          `me.website` is the seller's own external site (the Shopify or Squarespace shop VYA syncs
          from), and printing it here told her that was her VYA address. lib/seller/storefront.ts
          has the rule; this line and the Store tab are the two places that used to get it wrong. */}
      <Tile onPress={() => router.push("/(seller)/store")} style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Feather name="home" size={18} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.textMuted }}>Storefront</Text>
          {/* No "Live" dot here. This tile cannot know: a storefront answers when it is switched on
              OR when a capture of her old site exists, and the tile that claimed Live unconditionally
              is part of how a 404 went unnoticed. The Store tab checks the address and says. */}
          {/* NO ADDRESS HERE, AND THAT IS THE POINT.
              
              Printing the real one cost two extra requests. /api/store/domain and
              /api/store/storefront, on every single open of the busiest screen in the app, to
              render a line of text on a tile nobody opens Home to read. The Store tab needs both
              anyway and fetches them there. What Home owes this tile is that the shop exists and
              how many people follow it. */}
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 3 }} numberOfLines={1}>
            {me.data?.storeFollowers ? `${me.data.storeFollowers} ${me.data.storeFollowers === 1 ? "follower" : "followers"}` : "Your shop, as buyers see it"}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textDim} />
      </Tile>

      {/* needs you */}
      <Text style={{ fontFamily: fonts.medium, fontSize: 17, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.xs }}>
        Needs you
      </Text>
      {home.isError ? (
        // Same rule as the tiles: an unread buyer message we failed to fetch is not "nothing".
        <Text style={{ fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md }}>
          Couldn&apos;t load what&apos;s waiting. Pull to try again.
        </Text>
      ) : unread.length === 0 && payable.length === 0 && lapsing.length === 0 && extra.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md }}>
          {home.isPending ? " " : "Nothing waiting on you."}
        </Text>
      ) : (
        <>
          {extra.map((r) => (
            <Row key={r.key} icon={r.icon as React.ComponentProps<typeof Feather>["name"]} title={r.title} onPress={() => openRow(r)} />
          ))}
          {lapsing.map((h) => (
            <Row
              key={h.itemId}
              icon="clock"
              onPress={() => router.push({ pathname: "/(seller)/piece/[id]", params: { id: h.itemId } })}
              title={holdLapseRow(h) ?? ""}
              subtitle="Call them, or release it"
            />
          ))}
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
