import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { ToggleRow, Button, Notice, Loading } from "../../components/seller/Form";

// Sales tax — one switch, and the truth about what it does.
//
// VYA never calculates tax. Storefront sales are direct charges on HER Stripe account, so collecting
// and filing are hers; this switch tells Stripe Tax to calculate at checkout against HER
// registrations. That distinction is the whole screen. A seller who thinks VYA is handling her sales
// tax because a toggle in VYA is green has a problem that surfaces at a filing deadline, so the
// screen says whose job it is in plain words rather than leaving the toggle to imply otherwise.
//
// It also refuses to lie about being on: without a connected Stripe account Stripe Tax calculates
// nothing, so the server rejects switching it on and this says why, with the way to fix it.

type Tax = {
  enabled: boolean;
  productTaxCode?: string | null;
  payoutsReady: boolean;
  stripeTaxActive: boolean;
  registrations: number;
};

export default function TaxScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "tax"],
    queryFn: () => apiGet<Tax>("/api/store/tax"),
    enabled: !!storeSlug,
  });
  const t = q.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(on: boolean) {
    setError(null);
    setBusy(true);
    try {
      await apiPost("/api/store/tax", { enabled: on });
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SellerScreen title="Sales tax" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your tax settings.</Empty>
      ) : !t ? (
        <Loading />
      ) : (
        <>
          <ToggleRow
            label="Calculate tax at checkout"
            value={t.enabled}
            onValueChange={(v) => void flip(v)}
            disabled={busy || (!t.payoutsReady && !t.enabled)}
            hint={
              t.enabled
                ? "Stripe works out the tax on each order against your own registrations."
                : "Buyers are charged your listed price with nothing added."
            }
          />

          {!t.payoutsReady ? (
            <>
              <Notice>
                Tax is calculated on your own Stripe account, so payments have to be connected before
                this can be switched on.
              </Notice>
              <Button label="Set up payments" kind="secondary" onPress={() => router.push("/(seller)/payouts")} />
            </>
          ) : t.enabled && !t.stripeTaxActive ? (
            <Notice>
              Stripe Tax isn&apos;t finished on your account yet, so nothing is being added at checkout.
              Finish it in Stripe from Payouts.
            </Notice>
          ) : t.enabled ? (
            <Notice tone="good">
              {t.registrations > 0
                ? `Registered in ${t.registrations} ${t.registrations === 1 ? "place" : "places"}. Tax is added where you're registered and nowhere else.`
                : "Stripe Tax is on, but you aren't registered anywhere yet — so nothing is being added. Add a registration in Stripe from Payouts."}
            </Notice>
          ) : null}

          {error ? <Notice>{error}</Notice> : null}

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
            VYA doesn&apos;t collect or file sales tax for you. Your storefront sales are charged on
            your own Stripe account, so what&apos;s collected and what&apos;s filed are yours — this
            switch only asks Stripe to work out the amount.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}
