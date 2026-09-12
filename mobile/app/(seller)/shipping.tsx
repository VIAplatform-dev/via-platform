import { useState } from "react";
import { Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Field, ToggleRow, ChoiceRow, Button, Notice, Loading } from "../../components/seller/Form";
import { ZONE_LABELS, ZONE_IDS, type ZoneId, type Zones, zonesWith, shipsAbroad, DUTY_OPTIONS } from "../../lib/seller/shipping";

// Where parcels leave from, who pays for them, and where she'll send them.
//
// Two of Home's six setup steps land here — "Add the address you ship from" and "Switch shipping
// on" — and neither had a phone screen, so the checklist opened the website twice before a seller
// had listed anything. Everything on this screen is the subset that answers a question a seller
// actually asks standing up: what's my address, who pays postage, do I ship abroad, can people
// collect. Per-zone tier PRICES are left at the standard rates; they're a table, and a table on a
// phone is how you mis-price Australia at 3am.
//
// SAVED ON ONE BUTTON, and the whole object goes at once. The server merges by key, so a screen
// that saved field-by-field would be fine — but "ship from" is an address, and half an address
// saved is an address that fails at the post office rather than one that is obviously incomplete.

type ShipFrom = { name?: string | null; street1?: string | null; street2?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null; phone?: string | null };
type Pickup = { enabled?: boolean; address?: { street1?: string | null; city?: string | null } | null; instructions?: string | null } | null;
type Settings = {
  currency: string;
  mode: "buyer_pays" | "store_pays" | "free_over";
  freeThresholdUsd: number | null;
  shipFrom: ShipFrom | null;
  pickup: Pickup;
  dutyMode: string;
  effectiveDutyMode: string;
  dutyDowngraded: boolean;
  carrierConnected: boolean;
  zones: Zones;
};

const MODES = [
  { key: "buyer_pays" as const, label: "Buyer pays" },
  { key: "store_pays" as const, label: "I pay" },
  { key: "free_over" as const, label: "Free over…" },
];

export default function ShippingScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["store", "shipping"],
    queryFn: () => apiGet<Settings>("/api/store/shipping"),
    enabled: !!storeSlug,
  });

  const [draft, setDraft] = useState<Settings | null>(null);
  const s = draft ?? q.data ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Kept flat and separate from `draft`: GET returns pickup nested under `address`, POST wants it
  // flat, and holding one shape the whole way through is less error-prone than converting twice.
  const [pickupDraft, setPickupDraft] = useState<{ enabled: boolean; street1: string; city: string; instructions: string } | null>(null);
  const pickup = pickupDraft ?? {
    enabled: Boolean(q.data?.pickup?.enabled),
    street1: q.data?.pickup?.address?.street1 ?? "",
    city: q.data?.pickup?.address?.city ?? "",
    instructions: q.data?.pickup?.instructions ?? "",
  };
  function editPickup(patch: Partial<typeof pickup>) {
    setSaved(false);
    setPickupDraft({ ...pickup, ...patch });
  }

  function edit(patch: Partial<Settings>) {
    if (!s) return;
    setSaved(false);
    setDraft({ ...s, ...patch });
  }
  function editFrom(patch: ShipFrom) {
    if (!s) return;
    setSaved(false);
    setDraft({ ...s, shipFrom: { ...(s.shipFrom ?? {}), ...patch } });
  }

  async function save() {
    if (!s) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await apiPost("/api/store/shipping", {
        mode: s.mode,
        freeThresholdUsd: s.freeThresholdUsd,
        shipFrom: s.shipFrom ?? {},
        dutyMode: s.dutyMode,
        zones: s.zones,
        // Flattened on purpose: the route reads pickup.street1, not pickup.address.street1, and
        // reshapes it itself. Sending the shape GET returns would save a collection point with no
        // address, which the route then refuses — correctly, and confusingly.
        pickup: pickup.enabled
          ? { enabled: true, street1: pickup.street1, city: pickup.city, instructions: pickup.instructions || null }
          : { enabled: false },
      });
      setSaved(true);
      // Home counts both shipping steps, and Review reads the ship-from country for measurements.
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SellerScreen title="Shipping" back>
      {q.isError ? (
        <Empty>Couldn&apos;t load your shipping settings.</Empty>
      ) : !s ? (
        <Loading />
      ) : (
        <>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.lg }}>YOU SHIP FROM</Text>
          <Field label="Name" value={s.shipFrom?.name ?? ""} onChangeText={(v) => editFrom({ name: v })} placeholder="Who's on the parcel" autoCapitalize="words" />
          <Field label="Street" value={s.shipFrom?.street1 ?? ""} onChangeText={(v) => editFrom({ street1: v })} autoCapitalize="words" />
          <Field label="Street 2" value={s.shipFrom?.street2 ?? ""} onChangeText={(v) => editFrom({ street2: v })} placeholder="Optional" autoCapitalize="words" />
          <Field label="City" value={s.shipFrom?.city ?? ""} onChangeText={(v) => editFrom({ city: v })} autoCapitalize="words" />
          <Field label="State / county" value={s.shipFrom?.state ?? ""} onChangeText={(v) => editFrom({ state: v })} autoCapitalize="characters" />
          <Field label="Postcode" value={s.shipFrom?.zip ?? ""} onChangeText={(v) => editFrom({ zip: v })} autoCapitalize="characters" />
          <Field
            label="Country"
            value={s.shipFrom?.country ?? ""}
            onChangeText={(v) => editFrom({ country: v.toUpperCase().slice(0, 2) })}
            autoCapitalize="characters"
            placeholder="US"
            hint="Two letters — US, GB, FR. This also decides whether you measure in inches or cm."
          />
          <Field label="Phone" value={s.shipFrom?.phone ?? ""} onChangeText={(v) => editFrom({ phone: v })} placeholder="Optional — some carriers ask" keyboardType="phone-pad" />

          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>POSTAGE</Text>
          <ChoiceRow
            label="Who pays"
            options={MODES}
            value={s.mode}
            onChange={(v) => edit({ mode: v, freeThresholdUsd: v === "free_over" ? s.freeThresholdUsd ?? 100 : null })}
          />
          {s.mode === "free_over" ? (
            <Field
              label="Free over"
              value={s.freeThresholdUsd != null ? String(s.freeThresholdUsd) : ""}
              onChangeText={(v) => edit({ freeThresholdUsd: Number(v.replace(/[^0-9.]/g, "")) || null })}
              keyboardType="decimal-pad"
              suffix={s.currency}
              hint="Orders at or above this ship free; below it, the buyer pays."
            />
          ) : null}

          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>WHERE YOU SHIP</Text>
          {ZONE_IDS.map((z: ZoneId) => (
            <ToggleRow
              key={z}
              label={ZONE_LABELS[z]}
              value={Boolean(s.zones?.[z]?.enabled)}
              onValueChange={(on) => edit({ zones: zonesWith(s.zones, z, on) })}
            />
          ))}

          {shipsAbroad(s.zones) ? (
            <>
              <ChoiceRow
                label="Customs duty abroad"
                options={DUTY_OPTIONS}
                value={s.dutyMode}
                onChange={(v) => edit({ dutyMode: v })}
                hint="Who settles duty when a parcel crosses a border. It sets the declaration, not just the bill."
              />
              {s.dutyDowngraded ? (
                <Notice>
                  You&apos;ve asked to cover duty, but that needs your own carrier account — buyers are
                  being charged at the door for now.
                </Notice>
              ) : null}
            </>
          ) : null}

          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>COLLECTION</Text>
          <ToggleRow
            label="Let buyers collect in person"
            value={pickup.enabled}
            onValueChange={(v) => editPickup({ enabled: v })}
            hint="Offered at checkout as an alternative to posting."
          />
          {pickup.enabled ? (
            <>
              <Field label="Street" value={pickup.street1} onChangeText={(v) => editPickup({ street1: v })} autoCapitalize="words" />
              <Field label="City" value={pickup.city} onChangeText={(v) => editPickup({ city: v })} autoCapitalize="words" />
              <Field
                label="What to tell them"
                value={pickup.instructions}
                onChangeText={(v) => editPickup({ instructions: v })}
                multiline
                placeholder="Ring the bell, we're open Thursday to Sunday…"
                hint="Sent with their confirmation. Optional."
              />
            </>
          ) : null}

          <Button label="Save shipping" busyLabel="Saving…" busy={saving} onPress={() => void save()} />
          {error ? <Notice>{error}</Notice> : null}
          {saved ? <Notice tone="good">Saved.</Notice> : null}

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
            Parcels are priced by size tier at the standard rates.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}
