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
// What is deliberately NOT here: shipping zones and duties, sales tax and registrations, policies,
// domains, storefront editing, the full P&L, cost imports, bulk editing, people and seats. Those
// are set once, fiddly, and wrong on a phone. A seller who opens this and finds six things she
// recognises is better served than one who finds twenty-two and scrolls past all of them.

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
        <Row icon="bell" label="Notifications" href="/(seller)/notifications" />
        <Row icon="help-circle" label="Help" href="/(seller)/help" />
        <Row icon="log-out" label="Sign out" onPress={() => void signOut()} />
      </Group>

      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
        Shipping, tax, policies, domains and people are on the desktop.
      </Text>
    </SellerScreen>
  );
}
