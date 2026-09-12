import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Button, Notice, Loading } from "../../components/seller/Form";
import { useConnect, STRIPE_UNAVAILABLE } from "../../lib/seller/connect";
import { stripeNative } from "../../lib/seller/stripe-native";

// "When do I get paid" — answered in the first line, and actionable without leaving VYA.
//
// This screen used to end every sentence with "on the desktop", then briefly opened Stripe in a
// browser sheet. Both are gone. Stripe's onboarding and its payout management now render as NATIVE
// components inside this screen, themed burgundy (lib/seller/connect.tsx explains how, and names the
// one sign-in step Stripe will not let anybody replace).
//
// ConnectPayouts is what removed "bank details are changed on the desktop": it is Stripe's own
// payouts surface — balance, schedule, the account money lands in — drawn inside our navigation. We
// could not have rebuilt it, and we no longer have to send her anywhere to see it.
//
// THE PAYOUT DELAY IS STILL NOT EDITABLE HERE, and that is deliberate. It follows her return window
// (syncPayoutSchedule runs whenever the policy is saved) so a refund is always drawn from money
// still with Stripe rather than out of her bank. A second place to set it would be a way to break
// that, so the row points at the policy instead.

type Payments = {
  configured: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  payoutDelayDays: number;
  returnWindowDays: number;
  payoutNotice: string | null;
};

export default function PayoutsScreen() {
  const { storeSlug } = useAuth();
  const connect = useConnect();
  const q = useQuery({
    queryKey: ["store", "payments"],
    queryFn: () => apiGet<Payments>("/api/store/payments"),
    enabled: !!storeSlug,
  });
  const p = q.data;

  const ConnectAccountOnboarding = stripeNative?.ConnectAccountOnboarding;
  const ConnectPayouts = stripeNative?.ConnectPayouts;

  // Stripe's onboarding is a full-screen modal it presents itself; this only says whether to mount it.
  const [onboarding, setOnboarding] = useState(false);
  // Its payouts surface is an inline view, so it is opt-in rather than always on screen — she comes
  // here far more often to read the status line than to change a bank account.
  const [managing, setManaging] = useState(false);

  return (
    <SellerScreen title="Payouts" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your payout settings.</Empty>
      ) : !p ? (
        <Loading />
      ) : (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>PAYOUTS</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.text, marginTop: spacing.sm }}>
              {p.payoutsEnabled ? "Active" : p.connected ? "Finishing setup" : "Not connected"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 }}>
              {p.payoutsEnabled
                ? `Paid out ${p.payoutDelayDays} days after an order settles.`
                : p.connected
                  ? "Stripe still needs a few details before it can pay you."
                  : "Set up payments to start taking cards. It takes a few minutes and you'll need your bank details."}
            </Text>
          </View>

          {!p.configured ? (
            <Notice>Payments aren&apos;t switched on for this store yet — that one really is ours to fix. Get in touch from Help.</Notice>
          ) : connect.unavailable ? (
            // Expo Go. The status above still reads true — it comes from our own API, not from Stripe's
            // SDK — so she can see whether payouts are live even here; she just can't change them.
            <Notice>{STRIPE_UNAVAILABLE}</Notice>
          ) : connect.error ? (
            <Notice>{connect.error}</Notice>
          ) : connect.loading && !connect.instance ? (
            <Loading />
          ) : !connect.instance ? (
            <Notice>Couldn&apos;t reach Stripe just now. Pull down to try again.</Notice>
          ) : (
            <>
              {!p.payoutsEnabled ? (
                <Button
                  label={p.connected ? "Finish setting up payments" : "Set up payments"}
                  onPress={() => setOnboarding(true)}
                />
              ) : (
                <Button
                  label={managing ? "Done" : "Bank account and schedule"}
                  kind="secondary"
                  onPress={() => setManaging(!managing)}
                />
              )}

              {/* Stripe presents this itself, full screen, over the app. Read off the module rather
                  than imported: a static import is hoisted, and in Expo Go it would throw before any
                  of this rendered (see lib/seller/stripe-native.ts). */}
              {onboarding && ConnectAccountOnboarding ? (
                <ConnectAccountOnboarding
                  title="Set up payments"
                  onExit={() => {
                    setOnboarding(false);
                    // She may have finished, or backed out halfway. The status line is a better
                    // report of where she got to than anything this screen could guess.
                    void q.refetch();
                  }}
                />
              ) : null}

              {managing && ConnectPayouts ? (
                <View style={{ height: 460, marginTop: spacing.lg }}>
                  <ConnectPayouts style={{ flex: 1 }} />
                </View>
              ) : null}
            </>
          )}

          {p.payoutNotice ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 19 }}>{p.payoutNotice}</Text>
          ) : null}

          <View style={{ marginTop: spacing.xl }}>
            <Row label="Taking payments" value={p.chargesEnabled ? "Yes" : "No"} />
            <Row label="Payout delay" value={`${p.payoutDelayDays} days`} />
            {/* Tappable, because the honest answer to "why is it this many days" is her returns
                policy — and the way to change it is to change that. */}
            <Pressable onPress={() => router.push("/(seller)/policy")}>
              <Row label="Return window" value={`${p.returnWindowDays} days`} chevron />
            </Pressable>
          </View>

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.lg, lineHeight: 18 }}>
            Payouts wait out your return window, so a refund comes out of money still with Stripe
            rather than out of your bank. Change the window in your returns policy and this follows it.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}

function Row({ label, value, chevron }: { label: string; value: string; chevron?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{label}</Text>
      <Text style={{ fontSize: 15, color: colors.textMuted }}>{value}</Text>
      {chevron ? <Text style={{ fontSize: 15, color: colors.accent, marginLeft: spacing.sm, fontWeight: "600" }}>›</Text> : null}
    </View>
  );
}
