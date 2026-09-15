import { useState } from "react";
import { Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts, eyebrow } from "../../lib/portal-theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Field, ToggleRow, ChoiceRow, Button, Notice, Loading } from "../../components/seller/Form";
import { ZONE_LABELS, ZONE_IDS, type ZoneId, type Zones, zonesWith, shipsAbroad, DUTY_OPTIONS } from "../../lib/seller/shipping";

// Where parcels leave from, who pays for them, and where she'll send them.
//
// Two of Home's six setup steps land here. "Add the address you ship from" and "Switch shipping
// on", and neither had a phone screen, so the checklist opened the website twice before a seller
// had listed anything. Everything on this screen is the subset that answers a question a seller
// actually asks standing up: what's my address, who pays postage, do I ship abroad, can people
// collect. Per-zone tier PRICES are left at the standard rates; they're a table, and a table on a
// phone is how you mis-price Australia at 3am.
//
// SAVED ON ONE BUTTON, and the whole object goes at once. The server merges by key, so a screen
// that saved field-by-field would be fine, but "ship from" is an address, and half an address
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
  /** Working days before a parcel goes out. Null = she has not said. */
  dispatchDays?: number | null;
  /** Destinations nobody may ship to, named. From the server, so it matches what checkout does. */
  barred?: { label: string; places: string[] }[];
  /** What each zone covers, in country names. From the server, so it matches the web and checkout. */
  zoneCoverage?: Partial<Record<ZoneId, string>>;
  labelPrinter: "sheet" | "thermal";
  expeditedOffered: boolean;
};

const PRINTERS = [
  { key: "thermal" as const, label: "Label printer" },
  { key: "sheet" as const, label: "Regular printer" },
];

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
        dispatchDays: s.dispatchDays ?? null,
        labelPrinter: s.labelPrinter,
        expeditedOffered: s.expeditedOffered,
        // Flattened on purpose: the route reads pickup.street1, not pickup.address.street1, and
        // reshapes it itself. Sending the shape GET returns would save a collection point with no
        // address, which the route then refuses. Correctly, and confusingly.
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
          <Text style={{ ...eyebrow, marginTop: spacing.lg, marginBottom: spacing.xs }}>YOU SHIP FROM</Text>
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
            hint="Two letters. US, GB, FR. This also decides whether you measure in inches or cm."
          />
          <Field label="Phone" value={s.shipFrom?.phone ?? ""} onChangeText={(v) => editFrom({ phone: v })} placeholder="Required: USPS won't sell a label without it" keyboardType="phone-pad" />

          {/* WHAT SHE PRINTS ON. The carrier returns its own default unless told otherwise, and for
              USPS that is an 8.5×11 sheet with the label in the top quarter. Useless on the 4×6
              thermal printer a resale shop actually owns, and impossible to crop on a phone. */}
          <Text style={{ ...eyebrow, marginTop: spacing.xxl, marginBottom: spacing.xs }}>LABELS</Text>
          <ChoiceRow
            label="You print on"
            options={PRINTERS}
            value={s.labelPrinter ?? "sheet"}
            onChange={(v) => edit({ labelPrinter: v })}
            hint={
              (s.labelPrinter ?? "sheet") === "thermal"
                ? "Labels come out 4×6, ready to peel and stick."
                : "Labels come out full page. You'll cut them out."
            }
          />

          {/* WHAT POSTAGE COSTS IS NOT HER SETTING.
              
              A "Shipping price" choice lived here, between VYA pricing the parcel and the store
              pricing it per region. It never made sense: VYA buys every label and the buyer's
              postage goes to VYA in the application fee, so a seller setting the number was
              setting VYA's revenue on a cost she never pays. Said plainly instead.
              
              The warning is the part she can act on. The quote AND the label are both built from
              the size on the piece, so an understated parcel is re-rated after it ships. */}
          <Text style={{ fontSize: 14.5, color: colors.textMuted, marginTop: spacing.xl, lineHeight: 21 }}>
            VYA works out the postage on every order and buys the label. Your buyer sees one price
            for their address at checkout, and it never comes out of your payout.
          </Text>
          <Text style={{ fontSize: 14.5, color: colors.text, marginTop: spacing.sm, lineHeight: 21 }}>
            Measure your pieces. A parcel bigger than the size on the piece is re-rated by the
            carrier after it ships, and that correction is charged back to you.
          </Text>

          {/* A promise about HER, not the carrier. A shop that reaches the Post Office twice a week
              cannot keep a two-day promise however fast the label is, and a missed one costs more
              than the sale did. Off unless she says otherwise. */}
          <ToggleRow
            label="Offer faster shipping"
            value={s.expeditedOffered ?? false}
            onValueChange={(v) => edit({ expeditedOffered: v })}
            hint="Offer a faster delivery option at a higher price. Only if you can post same or next day."
          />

          <Text style={{ ...eyebrow, marginTop: spacing.xxl, marginBottom: spacing.xs }}>POSTAGE</Text>
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

          {/* The one thing no carrier can answer: how long the parcel sits with her first. */}
          <Field
            label="Orders go out within"
            value={s.dispatchDays != null ? String(s.dispatchDays) : ""}
            onChangeText={(v) => edit({ dispatchDays: v.replace(/[^0-9]/g, "").slice(0, 2) === "" ? null : Number(v.replace(/[^0-9]/g, "").slice(0, 2)) })}
            placeholder="2"
            keyboardType="numeric"
            suffix="working days"
            hint={s.dispatchDays ? "Shown to buyers and used in your shipping policy." : "Leave blank and we won't promise a time for you."}
          />

          <Text style={{ ...eyebrow, marginTop: spacing.xxl, marginBottom: spacing.xs }}>WHERE YOU SHIP</Text>
          {ZONE_IDS.map((z: ZoneId) => (
            <ToggleRow
              key={z}
              label={ZONE_LABELS[z]}
              // What is IN it. "Europe" and "Rest of world" are not answers to "can my customer in
              // Israel buy from me", and that is the question a seller is actually asking here.
              hint={s.zoneCoverage?.[z]}
              value={Boolean(s.zones?.[z]?.enabled)}
              onValueChange={(on) => edit({ zones: zonesWith(s.zones, z, on) })}
            />
          ))}
          {/* NAMED, like the desktop. "A few destinations are never available" answers nothing;
              the seller wants to know which, and her alternative is a customer telling her. The
              list comes from the server so the phone cannot fall behind what checkout enforces. */}
          <Text style={{ fontSize: 13.5, color: colors.textDim, marginTop: spacing.sm, lineHeight: 20 }}>
            Some places are never available, whichever regions you tick. Not your call or ours:
          </Text>
          {(s.barred ?? []).map((group) => (
            <Text key={group.label} style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 4, lineHeight: 20 }}>
              <Text style={{ color: colors.textDim }}>{group.label}: </Text>
              {group.places.join(", ")}
            </Text>
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
                  You&apos;ve asked to cover duty, but that needs your own carrier account. Buyers are
                  being charged at the door for now.
                </Notice>
              ) : null}
            </>
          ) : null}

          <Text style={{ ...eyebrow, marginTop: spacing.xxl, marginBottom: spacing.xs }}>COLLECTION</Text>
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

          <Text style={{ fontSize: 13.5, color: colors.textDim, marginTop: spacing.xl, lineHeight: 20 }}>
            VYA prices each parcel for its size and where it is going.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}
