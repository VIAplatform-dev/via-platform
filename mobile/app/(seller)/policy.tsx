import { useState } from "react";
import { Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Field, ToggleRow, ChoiceRow, Button, Notice, Loading } from "../../components/seller/Form";

// Her returns policy — the "Set your returns policy" step on Home, which used to open the website.
//
// Two things make this more than a form. The window she sets here decides how long VYA holds her
// money (a refund has to come out of a Stripe balance, not her bank), so saving it reports the new
// payout delay back rather than letting her discover it on the Payouts screen. And turning refunds
// OFF is a real decision with a real consequence for a buyer, so it says what it means in words
// instead of leaving "Final sale" to be inferred from a switch.
//
// Saved on one button, not per field. Every other settings screen in the app saves as you go, but a
// policy is a sentence — half-saving it would publish "returns accepted" with a blank window to a
// storefront a buyer is reading.

type Policy = {
  refundsEnabled: boolean;
  returnWindowDays: number;
  restockingFeePct: number;
  returnShippingPaidBy: "buyer" | "store";
  policyText: string | null;
};

type SaveResult = { policy: Policy; payoutDelayDays: number | null; payoutNotice: string | null };

export default function PolicyScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["store", "policy"],
    queryFn: () => apiGet<{ policy: Policy }>("/api/store/policy"),
    enabled: !!storeSlug,
  });

  // Local edits win once she has touched anything; until then whatever the server said.
  const [draft, setDraft] = useState<Policy | null>(null);
  const p = draft ?? q.data?.policy ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function edit(patch: Partial<Policy>) {
    if (!p) return;
    setSaved(null);
    setDraft({ ...p, ...patch });
  }

  async function save() {
    if (!p) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      const r = await apiPost<SaveResult>("/api/store/policy", {
        refundsEnabled: p.refundsEnabled,
        returnWindowDays: p.returnWindowDays,
        restockingFeePct: p.restockingFeePct,
        returnShippingPaidBy: p.returnShippingPaidBy,
        policyText: p.policyText ?? "",
      });
      setDraft(r.policy);
      // The payout hold moves with the window — say so here rather than letting her find out later.
      setSaved(
        r.payoutNotice
          ? r.payoutNotice
          : r.payoutDelayDays != null
            ? `Saved. You're now paid out ${r.payoutDelayDays} days after an order settles.`
            : "Saved.",
      );
      // Payouts reads the same window, and Home counts this step as done.
      await qc.invalidateQueries({ queryKey: ["store", "payments"] });
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SellerScreen title="Returns" back>
      {q.isError ? (
        <Empty>Couldn&apos;t load your returns policy.</Empty>
      ) : !p ? (
        <Loading />
      ) : (
        <>
          <ToggleRow
            label="Accept returns"
            value={p.refundsEnabled}
            onValueChange={(v) => edit({ refundsEnabled: v })}
            hint={
              p.refundsEnabled
                ? "Buyers can ask to send a piece back within the window below."
                : "Everything is final sale. Buyers are told before they pay, and you're paid out as fast as Stripe allows."
            }
          />

          {p.refundsEnabled ? (
            <>
              <Field
                label="Return window"
                value={String(p.returnWindowDays ?? 0)}
                onChangeText={(v) => edit({ returnWindowDays: Number(v.replace(/[^0-9]/g, "")) || 0 })}
                keyboardType="numeric"
                suffix="days"
                hint="Counted from the day it arrives. Your payouts wait this long too."
              />

              <Field
                label="Restocking fee"
                value={String(p.restockingFeePct ?? 0)}
                onChangeText={(v) => edit({ restockingFeePct: Number(v.replace(/[^0-9]/g, "")) || 0 })}
                keyboardType="numeric"
                suffix="%"
                hint="Kept from the refund. Leave at 0 to refund in full."
              />

              <ChoiceRow
                label="Return postage"
                options={[
                  { key: "buyer", label: "Buyer pays" },
                  { key: "store", label: "I pay" },
                ]}
                value={p.returnShippingPaidBy}
                onChange={(v) => edit({ returnShippingPaidBy: v })}
              />
            </>
          ) : null}

          <Field
            label="In your words"
            value={p.policyText ?? ""}
            onChangeText={(v) => edit({ policyText: v })}
            multiline
            placeholder="Anything a buyer should know before they order…"
            hint="Shown on your storefront under the policy. Optional."
          />

          <Button label="Save policy" busyLabel="Saving…" busy={saving} onPress={() => void save()} />

          {error ? <Notice>{error}</Notice> : null}
          {saved ? <Notice tone="good">{saved}</Notice> : null}

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
            This is what buyers see on your storefront and in the confirmation email.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}
