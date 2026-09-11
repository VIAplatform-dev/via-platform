import { Pressable, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen } from "../../components/seller/Screen";

// The settings drawer, grouped by what she came for: selling, shop, money, account.
//
// EVERY ROW OPENS SOMETHING. Nothing here is a label that goes nowhere. Market Mode is the one
// exception and it is a switch rather than a link — it is how she starts a market, not a page.
//
// WHAT USED TO BE MISSING IS NOW HERE. Shipping, returns, domain, tax and consignors were left off
// on the theory that they are set once, fiddly, and wrong on a phone. Two of those are true and one
// is not: they ARE set once and they ARE fiddly, but "wrong on a phone" turned out to mean "wrong on
// the desktop, reached from a phone" — a seller tapped Set your returns policy on Home and landed on
// vyaplatform.com in a browser sheet. Set-once is an argument for a plain screen, not for no screen.
//
// What is still NOT here: storefront editing, the full P&L, cost imports, bulk editing, seats. Those
// are genuinely table- and canvas-shaped, and a phone is the wrong instrument for them.

type Me = { storeName: string; currency: string };
type MarketMode = { enabled: boolean };
// /api/store/payments reports Stripe Connect STATUS and the payout schedule — it has no "next
// payout" amount, so the drawer row cannot show one. The Payouts screen states the schedule instead.
type Payments = { connected: boolean; payoutsEnabled: boolean };

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginBottom: spacing.sm }}>{label}</Text>
      {children}
    </View>
  );
}

function Row({
  icon, label, value, href, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: string;
  href?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress ?? (href ? () => router.push(href as never) : undefined)}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Feather name={icon} size={18} color={colors.text} />
      <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{label}</Text>
      {value ? <Text style={{ fontSize: 13, color: colors.textMuted, marginRight: spacing.sm }}>{value}</Text> : null}
      <Feather name="chevron-right" size={18} color={colors.textDim} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { storeSlug, signOut } = useAuth();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<Me>("/api/store/me"), enabled: !!storeSlug });
  const market = useQuery({
    queryKey: ["store", "market", "mode"],
    queryFn: () => apiGet<MarketMode>("/api/store/market/mode"),
    enabled: !!storeSlug,
  });
  // The two opt-in modes. Null until loaded, which reads as off — the same rule the web sidebar uses.
  const rentals = useQuery({
    queryKey: ["store", "rentals", "settings"],
    queryFn: () => apiGet<{ settings?: { enabled?: boolean } }>("/api/store/rentals/settings"),
    enabled: !!storeSlug,
  });
  const appts = useQuery({
    queryKey: ["store", "appointments", "settings"],
    queryFn: () => apiGet<{ settings?: { enabled?: boolean } }>("/api/store/appointments/settings"),
    enabled: !!storeSlug,
  });
  const payments = useQuery({
    queryKey: ["store", "payments"],
    queryFn: () => apiGet<Payments>("/api/store/payments"),
    enabled: !!storeSlug,
  });

  const toggleMarket = useMutation({
    mutationFn: (enabled: boolean) => apiPost("/api/store/market/mode", { enabled }),
    onSuccess: (_r, enabled) => {
      void qc.invalidateQueries({ queryKey: ["store", "market", "mode"] });
      // Switching it on IS starting a market — go straight there rather than leaving her
      // on a settings row wondering what the toggle did.
      if (enabled) router.push("/market");
    },
  });

  const rentalsOn = Boolean(rentals.data?.settings?.enabled);
  const apptsOn = Boolean(appts.data?.settings?.enabled);

  return (
    <SellerScreen title="Settings" back>
      <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{me.data?.storeName ?? storeSlug}</Text>

      <Group label="SELLING">
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Feather name="shopping-bag" size={18} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>Market Mode</Text>
          {/* A switch, not a link: this is how she starts a market. */}
          <Switch
            value={Boolean(market.data?.enabled)}
            onValueChange={(v) => toggleMarket.mutate(v)}
            disabled={market.isPending || toggleMarket.isPending}
            trackColor={{ true: colors.accent, false: colors.chip }}
          />
        </View>
        <Row icon="archive" label="Consignment" href="/(seller)/consignment" />
        {/* Both are modes a store opts into, exactly as the web's sidebar treats them — a shop that
            doesn't rent should not carry a Rentals row it can only find empty. */}
        {rentalsOn ? <Row icon="repeat" label="Rentals" href="/(seller)/rentals" /> : null}
        {apptsOn ? <Row icon="calendar" label="Appointments" href="/(seller)/appointments" /> : null}
        <Row icon="users" label="Consignors" href="/(seller)/consignors" />
      </Group>

      <Group label="STORE">
        <Row icon="truck" label="Shipping" href="/(seller)/shipping" />
        <Row icon="rotate-ccw" label="Returns" href="/(seller)/policy" />
        <Row icon="globe" label="Domain" href="/(seller)/domain" />
        <Row icon="percent" label="Sales tax" href="/(seller)/tax" />
      </Group>

      <Group label="SHOP">
        <Row icon="bar-chart-2" label="Analytics" href="/(seller)/analytics" />
        <Row icon="users" label="Customers" href="/(seller)/customers" />
        <Row icon="tag" label="Discounts" href="/(seller)/discounts" />
      </Group>

      <Group label="MONEY">
        <Row
          icon="credit-card"
          label="Payouts"
          value={payments.data?.payoutsEnabled ? "Active" : payments.data?.connected ? "Setup" : undefined}
          href="/(seller)/payouts"
        />
        <Row icon="file-text" label="Plan & billing" href="/(seller)/billing" />
      </Group>

      <Group label="ACCOUNT">
        {/* BOTH WAYS BETWEEN THE TWO SIDES. She is a seller and a shopper on one login, and the only
            route out of the workspace used to be a 36pt unlabelled bag icon on Home — findable if
            you already knew, which is the definition of not findable. The way back is the "My store"
            row on the marketplace's own Account tab, so the pair matches. */}
        <Row icon="shopping-bag" label="Exit to Marketplace" value="Shop" onPress={() => router.push("/(tabs)")} />
        {/* The SWITCHES, which is what she comes to Settings for. The bell on Home now opens the
            actual outstanding list instead, which is what a bell should have meant all along. */}
        <Row icon="bell" label="Notifications" href="/(seller)/notification-settings" />
        <Row icon="help-circle" label="Help" href="/(seller)/help" />
        <Row icon="log-out" label="Sign out" onPress={() => void signOut()} />
      </Group>

      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
        Storefront design, the full profit report and bulk editing are on the desktop — they need a
        canvas or a table, not a phone.
      </Text>
    </SellerScreen>
  );
}
