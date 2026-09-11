import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Button, Notice, ChoiceRow, Loading } from "../../components/seller/Form";
import { stripeNative, stripeAvailable, STRIPE_UNAVAILABLE } from "../../lib/seller/stripe-native";
import {
  planLabel, billingLine, tierPriceLine, invoiceLine, invoiceStatusNote,
  type CurrentPlan, type Tier, type Invoice,
} from "../../lib/seller/billing";

// Plan & billing, with no web page anywhere in it.
//
// This was the last screen that left the app. The web starts a subscription through Stripe Checkout
// and manages it through the Stripe billing portal — both hosted web pages, both fine in a browser
// and wrong in an app. Neither has a Connect-style embedded component, so the answer was not a
// different widget but a different shape: the SUBSCRIPTION is created on our server incomplete, the
// CARD is taken in Stripe's native payment sheet, and everything the portal used to do (cancel,
// resume, change plan, change card, read invoices) is now four API calls and a list.
//
// WHAT THE SHEET IS. PaymentSheet is a native iOS/Android view, not a WebView — Stripe's own card
// form, over VYA, in VYA's colours. It is the same component a shopper meets in any Stripe-powered
// app. The only browser left in the flow is 3-D Secure, which a BANK presents when it wants a
// customer verified, and which no integration on any platform can skip.
//
// Cancelling is deliberately at the END of the period. She has paid for the month; taking it away
// the moment she taps would be taking something she bought.

type Billing = {
  configured: boolean;
  trialDays: number;
  publishableKey: string | null;
  current: CurrentPlan & { cancelAtPeriodEnd?: boolean };
  tiers?: Tier[];
};

export default function BillingScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "billing"],
    queryFn: () => apiGet<Billing>("/api/store/billing"),
    enabled: !!storeSlug,
  });

  // StripeProvider has to wrap whatever calls useStripe, and its key comes from the server — so the
  // screen body is a child rather than this component, and renders once the key is known.
  if (q.isError) {
    return (
      <SellerScreen title="Plan & billing" back>
        <Empty>Couldn&apos;t load your plan.</Empty>
      </SellerScreen>
    );
  }
  if (!q.data) {
    return (
      <SellerScreen title="Plan & billing" back>
        <Loading />
      </SellerScreen>
    );
  }
  // Everything except taking a card still works without Stripe — the plan, the status, the invoices
  // are all our own API — so the screen renders rather than refusing. `sheet: null` is what every
  // card-taking control reads to disable itself, whether the reason is a missing publishable key or
  // a binary with no Stripe in it (Expo Go).
  if (!q.data.publishableKey || !stripeAvailable) {
    return (
      <BillingBody
        data={q.data}
        refetch={() => void q.refetch()}
        refreshing={q.isRefetching}
        sheet={null}
        unavailableNote={stripeAvailable ? "Card payments aren't configured on the server, so a plan can't be started from here yet." : STRIPE_UNAVAILABLE}
      />
    );
  }
  const StripeProvider = stripeNative!.StripeProvider;
  return (
    <StripeProvider publishableKey={q.data.publishableKey} urlScheme="vya">
      <BillingWithSheet data={q.data} refetch={() => void q.refetch()} refreshing={q.isRefetching} />
    </StripeProvider>
  );
}

type SheetParams = {
  customerId: string;
  customerSessionClientSecret: string;
  setupIntentClientSecret?: string | null;
  paymentIntentClientSecret?: string | null;
};
type SheetResult = { ok: boolean; cancelled: boolean; message?: string };

/**
 * The only component that touches Stripe's hooks.
 *
 * Split out so BillingBody never calls useStripe: in Expo Go the module does not exist, and a hook
 * that only sometimes runs is a hook-order bug waiting for the one render where it matters.
 */
function BillingWithSheet({ data, refetch, refreshing }: { data: Billing; refetch: () => void; refreshing: boolean }) {
  const { initPaymentSheet, presentPaymentSheet } = stripeNative!.useStripe();

  async function sheet(params: SheetParams): Promise<SheetResult> {
    // Stripe's own card form, in VYA's palette. `colors` here takes hex only — the theme's muted
    // tones are rgba alpha ramps, so the ones that would be passed through are the solid ones.
    const common = {
      merchantDisplayName: "VYA",
      customerId: params.customerId,
      customerSessionClientSecret: params.customerSessionClientSecret,
      // 3-D Secure hands the app back through its own scheme when a bank challenges the card.
      returnURL: "vya://billing",
      appearance: {
        colors: {
          primary: colors.accent,
          background: colors.bg,
          componentBackground: colors.bgCard,
          primaryText: colors.text,
          componentText: colors.text,
        },
      },
    };
    const init = await initPaymentSheet(
      params.setupIntentClientSecret
        ? { ...common, setupIntentClientSecret: params.setupIntentClientSecret }
        : { ...common, paymentIntentClientSecret: params.paymentIntentClientSecret as string },
    );
    if (init.error) return { ok: false, cancelled: false, message: init.error.message };
    const res = await presentPaymentSheet();
    if (res.error) {
      // Backing out is not a failure and must not be reported as one.
      const cancelled = res.error.code === "Canceled";
      return { ok: false, cancelled, message: cancelled ? undefined : res.error.message };
    }
    return { ok: true, cancelled: false };
  }

  return <BillingBody data={data} refetch={refetch} refreshing={refreshing} sheet={sheet} />;
}

function BillingBody({
  data, refetch, refreshing, sheet, unavailableNote,
}: {
  data: Billing;
  refetch: () => void;
  refreshing: boolean;
  /** null when this binary or this server cannot take a card. */
  sheet: ((p: SheetParams) => Promise<SheetResult>) | null;
  unavailableNote?: string;
}) {
  const payDisabled = sheet === null;
  const qc = useQueryClient();
  const { storeSlug } = useAuth();

  const c = data.current;
  const subscribed = Boolean(c.status && c.status !== "canceled");
  const [interval, setInterval] = useState<"month" | "year">(c.interval === "year" ? "year" : "month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showInvoices, setShowInvoices] = useState(false);

  const invoices = useQuery({
    queryKey: ["store", "billing", "invoices"],
    queryFn: () => apiGet<{ invoices: Invoice[] }>("/api/store/billing/invoices"),
    enabled: !!storeSlug && showInvoices,
  });

  async function subscribe(tier: string) {
    setError(null);
    setNote(null);
    setBusy(tier);
    try {
      const r = await apiPost<{
        customerId: string; customerSessionClientSecret: string;
        setupIntentClientSecret: string | null; paymentIntentClientSecret: string | null; trialDays: number;
      }>("/api/store/billing/subscribe", { tier, interval });
      const out = await sheet!(r);
      if (!out.ok) {
        if (!out.cancelled) setError(out.message ?? "That card didn't go through.");
      } else {
        setNote(r.trialDays > 0 ? `You're on ${tier}. Free for ${r.trialDays} days — we'll bill you after that.` : `You're on ${tier}.`);
      }
      // Refetch either way: the subscription exists server-side the moment we asked for it, and the
      // status line is a truer report of where she got to than anything this screen could infer.
      refetch();
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start that plan.");
    } finally {
      setBusy(null);
    }
  }

  async function changeCard() {
    setError(null);
    setNote(null);
    setBusy("card");
    try {
      const r = await apiPost<{
        customerId: string; customerSessionClientSecret: string; setupIntentClientSecret: string;
      }>("/api/store/billing/manage", { action: "card" });
      const out = await sheet!(r);
      if (!out.ok) {
        if (!out.cancelled) setError(out.message ?? "That card didn't save.");
        return;
      }
      // Saving a card is not the same as billing to it — tell the server to make it the default.
      const id = r.setupIntentClientSecret.split("_secret_")[0];
      await apiPost("/api/store/billing/manage", { action: "card-saved", setupIntentId: id });
      setNote("New card saved. Future invoices go to it.");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that card.");
    } finally {
      setBusy(null);
    }
  }

  async function act(action: string, extra: Record<string, unknown> = {}, said?: string) {
    setError(null);
    setNote(null);
    setBusy(action);
    try {
      await apiPost("/api/store/billing/manage", { action, ...extra });
      if (said) setNote(said);
      refetch();
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const tiers = (data.tiers ?? []).filter((t) => t.priced);

  return (
    <SellerScreen title="Plan & billing" back onRefresh={refetch} refreshing={refreshing}>
      <View style={{ borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, padding: spacing.xl }}>
        <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.accent }}>YOUR PLAN</Text>
        <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.accent, marginTop: spacing.sm }}>
          {planLabel(c)}
        </Text>
        {billingLine(c) ? (
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm }}>{billingLine(c)}</Text>
        ) : (
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm }}>
            No subscription yet — {data.trialDays} days free when you start one.
          </Text>
        )}
        {c.cancelAtPeriodEnd ? (
          <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm, lineHeight: 19 }}>
            Cancelling at the end of this period. You keep everything until then.
          </Text>
        ) : null}
      </View>

      {c.status ? (
        <View style={{ flexDirection: "row", paddingVertical: spacing.md, marginTop: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>Status</Text>
          <Text style={{ fontSize: 15, color: colors.textMuted, textTransform: "capitalize" }}>{c.status}</Text>
        </View>
      ) : null}

      {!data.configured ? (
        <Notice>Billing isn&apos;t switched on yet — that one is ours to fix. Get in touch from Help.</Notice>
      ) : payDisabled ? (
        // Says WHICH reason — a server with no Stripe key and an app with no Stripe module look
        // identical from here, and only one of them is something she can wait out.
        <Notice>{unavailableNote}</Notice>
      ) : null}

      {/* ── Choosing a plan: only when there isn't one ─────────────────────────────────── */}
      {!subscribed && data.configured && !payDisabled && tiers.length ? (
        <>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>CHOOSE A PLAN</Text>
          <ChoiceRow
            label="Billed"
            options={[{ key: "month" as const, label: "Monthly" }, { key: "year" as const, label: "Yearly" }]}
            value={interval}
            onChange={setInterval}
          />
          {tiers.map((t) => (
            <Pressable
              key={t.id}
              disabled={busy !== null}
              onPress={() => void subscribe(t.id)}
              style={{ marginTop: spacing.lg, backgroundColor: colors.chip, borderRadius: 12, padding: spacing.lg, opacity: busy && busy !== t.id ? 0.5 : 1 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>{t.name}</Text>
                <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>
                  {busy === t.id ? "Opening…" : tierPriceLine(t, interval)}
                </Text>
              </View>
              {t.tagline ? <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{t.tagline}</Text> : null}
              {/* Only what this tier ADDS — three near-identical lists is three nobody finishes. */}
              {(t.newFeatures ?? []).slice(0, 4).map((f) => (
                <Text key={f} style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>· {f}</Text>
              ))}
            </Pressable>
          ))}
          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.lg, lineHeight: 18 }}>
            {data.trialDays} days free first. Cancel any time.
          </Text>
        </>
      ) : null}

      {/* ── Managing the one she has ───────────────────────────────────────────────────── */}
      {subscribed ? (
        <>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>MANAGE</Text>

          {!payDisabled ? (
            <Button label="Change the card on file" busyLabel="Opening…" busy={busy === "card"} kind="secondary" onPress={() => void changeCard()} />
          ) : null}

          {tiers.filter((t) => t.id !== c.tier).map((t) => (
            <Button
              key={t.id}
              label={`Switch to ${t.name} — ${tierPriceLine(t, interval)}`}
              busyLabel="Switching…"
              busy={busy === "change-plan"}
              kind="secondary"
              onPress={() => void act("change-plan", { tier: t.id, interval }, `You're on ${t.name} now. The difference is prorated.`)}
            />
          ))}

          {c.cancelAtPeriodEnd ? (
            <Button label="Keep my plan" busyLabel="…" busy={busy === "resume"} onPress={() => void act("resume", {}, "Kept. Nothing changes.")} />
          ) : (
            <Pressable
              onPress={() => void act("cancel", {}, "Cancelled. You keep everything until the end of the period you've paid for.")}
              disabled={busy !== null}
              hitSlop={8}
              style={{ paddingVertical: spacing.lg, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, color: colors.textMuted }}>
                {busy === "cancel" ? "…" : "Cancel my plan"}
              </Text>
            </Pressable>
          )}

          <Button
            label={showInvoices ? "Hide invoices" : "Invoices"}
            kind="secondary"
            onPress={() => setShowInvoices(!showInvoices)}
          />
          {showInvoices ? (
            invoices.isPending ? (
              <Loading />
            ) : (invoices.data?.invoices ?? []).length === 0 ? (
              <Empty>Nothing billed yet.</Empty>
            ) : (
              (invoices.data?.invoices ?? []).map((i) => (
                <View key={i.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.text }}>{invoiceLine(i)}</Text>
                    {invoiceStatusNote(i) ? (
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{invoiceStatusNote(i)}</Text>
                    ) : null}
                  </View>
                  {i.pdfUrl ? (
                    <Pressable hitSlop={8} onPress={() => void Linking.openURL(i.pdfUrl!)}>
                      <Text style={{ fontSize: 13, color: colors.accent, fontWeight: "600" }}>PDF</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )
          ) : null}
        </>
      ) : null}

      {error ? <Notice>{error}</Notice> : null}
      {note ? <Notice tone="good">{note}</Notice> : null}
    </SellerScreen>
  );
}
