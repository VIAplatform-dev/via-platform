import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Field, Button, Notice, Loading } from "../../components/seller/Form";
import {
  searchTermFrom, priceLine, describeMissing, REGISTRANT_FIELDS, EMPTY_REGISTRANT,
  type DomainOption, type Registrant,
} from "../../lib/seller/domains";

// Her own domain — the "Connect your own domain" step on Home, which used to open the website.
//
// THE HARD PART OF THIS SCREEN IS NOT THE FORM, IT IS THE WAIT. Connecting is one call; what follows
// is DNS, which happens at her registrar, on somebody else's schedule, and can take an hour. A screen
// that says "connected" and stops is the one that generates the support message, so the records she
// has to add are listed here with tap-to-copy — a phone is a bad place to retype `cname.vercel-dns.com`
// by hand — and "Check again" asks the server rather than making her guess whether it worked yet.
//
// SHE CAN ALSO BUY ONE HERE, which is the part that has no DNS problem at all: VYA registers it
// through Vercel and points it at her storefront in the same call, so there is nothing to copy into
// a registrar and nothing to wait for. That is why buying is offered first and connecting second —
// the easy path should be the visible one.
//
// The registrant contact is ICANN's requirement, not ours, and it is nine boxes. They are prefilled
// from her ship-from address, which she has already typed on the Shipping screen, so for most
// sellers this is a review rather than a form. What is still missing is named BEFORE the button
// works — a registrar refuses the whole purchase over one blank box, and finding that out after a
// card charge is the worst version of this flow.
//
// Records are only shown when they are hers to add. When VYA runs the nameservers the server sends
// no records back and there is nothing for her to do, so listing an empty zone would read as "your
// DNS is broken" at the exact moment everything is fine.
//
// The values are `selectable`, which is long-press-to-copy on both platforms and costs nothing. A
// Copy button would read better, but every clipboard API here is a native module — a new dependency
// and a rebuild for one button, on a screen used once per store. Not worth it.

type DnsRecord = { type: string; name: string; value: string };
type Status = { domain: string; verified: boolean; misconfigured: boolean; records: DnsRecord[] };
type DomainState = { configured: boolean; domain: string | null; status: Status | null };

export default function DomainScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["store", "domain"],
    queryFn: () => apiGet<DomainState>("/api/store/domain"),
    enabled: !!storeSlug,
  });

  // Prefilled from the address she has already given for parcels — most of the registrant contact
  // is the same information, and retyping it on a phone is how this flow gets abandoned.
  const shipping = useQuery({
    queryKey: ["store", "shipping"],
    queryFn: () => apiGet<{ shipFrom?: Partial<Record<string, string>> | null }>("/api/store/shipping"),
    enabled: !!storeSlug,
  });
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency?: string }>("/api/store/me"), enabled: !!storeSlug });

  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "verify" | "remove" | "search" | "buy">(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<DomainOption[] | null>(null);
  const [picked, setPicked] = useState<DomainOption | null>(null);
  const [contact, setContact] = useState<Registrant | null>(null);
  const [bought, setBought] = useState<string | null>(null);

  const currency = me.data?.currency ?? "USD";

  function startBuying(o: DomainOption) {
    const f = shipping.data?.shipFrom ?? {};
    const name = String(f.name ?? "").trim().split(/\s+/);
    setError(null);
    setPicked(o);
    setContact({
      ...EMPTY_REGISTRANT,
      firstName: name[0] ?? "",
      lastName: name.slice(1).join(" "),
      phone: String(f.phone ?? ""),
      address1: String(f.street1 ?? ""),
      city: String(f.city ?? ""),
      state: String(f.state ?? ""),
      zip: String(f.zip ?? ""),
      country: String(f.country ?? "US"),
    });
  }

  async function search() {
    const name = searchTermFrom(typed);
    if (!name) return;
    setError(null);
    setOptions(null);
    setPicked(null);
    setBusy("search");
    try {
      const r = await apiPost<{ options: DomainOption[] }>("/api/store/domain", { action: "suggest", name });
      setOptions(r.options ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't search for that.");
    } finally {
      setBusy(null);
    }
  }

  async function buy() {
    if (!picked || !contact) return;
    setError(null);
    setBusy("buy");
    try {
      await apiPost("/api/store/domain", { action: "buy", domain: picked.domain, contact });
      setBought(picked.domain);
      setPicked(null);
      setContact(null);
      setOptions(null);
      setTyped("");
      await q.refetch();
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
      await qc.invalidateQueries({ queryKey: ["store", "me"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  const d = q.data;
  const live = Boolean(d?.status?.verified && !d?.status?.misconfigured);

  async function run(what: "connect" | "verify" | "remove") {
    setError(null);
    setBusy(what);
    try {
      if (what === "connect") await apiPost("/api/store/domain", { domain: typed.trim() });
      else if (what === "verify") await apiPost("/api/store/domain", { action: "verify" });
      else await apiDelete("/api/store/domain");
      setTyped("");
      await q.refetch();
      // Home's setup list counts a connected domain, and the Store tab points at it.
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
      await qc.invalidateQueries({ queryKey: ["store", "me"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SellerScreen title="Domain" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your domain settings.</Empty>
      ) : !d ? (
        <Loading />
      ) : !d.configured ? (
        <Notice>Custom domains aren&apos;t switched on for this store yet — that one is ours to fix. Get in touch from Help.</Notice>
      ) : !d.domain ? (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>YOUR ADDRESS TODAY</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text, marginTop: spacing.sm }}>
              {storeSlug}.vyasites.com
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 }}>
              This works now and keeps working. A domain of your own is optional.
            </Text>
          </View>

          {picked && contact ? (
            <>
              <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>
                REGISTERING {picked.domain.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 19 }}>
                {priceLine(picked, currency)}, charged to the card on your VYA account. Whoever owns a
                domain has to be named publicly — that&apos;s the registrar&apos;s rule, not ours.
              </Text>
              {REGISTRANT_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={contact[f.key]}
                  onChangeText={(v) => setContact({ ...contact, [f.key]: f.key === "country" ? v.toUpperCase().slice(0, 2) : v })}
                  hint={f.hint}
                  keyboardType={f.key === "email" ? "email-address" : f.key === "phone" ? "phone-pad" : "default"}
                  autoCapitalize={f.key === "email" ? "none" : f.key === "country" || f.key === "state" ? "characters" : "words"}
                />
              ))}
              {describeMissing(contact) ? <Notice>{describeMissing(contact)}</Notice> : null}
              <Button
                label={`Buy ${picked.domain} — ${priceLine(picked, currency)}`}
                busyLabel="Registering…"
                busy={busy === "buy"}
                disabled={Boolean(describeMissing(contact))}
                onPress={() => void buy()}
              />
              <Pressable onPress={() => { setPicked(null); setContact(null); }} hitSlop={8} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Pick a different one</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Field
                label="Find a domain"
                value={typed}
                onChangeText={setTyped}
                placeholder="yourbrand"
                autoCapitalize="none"
                hint="We'll register it and point it at your storefront — nothing to set up afterwards."
              />
              <Button
                label="See what's free"
                busyLabel="Looking…"
                busy={busy === "search"}
                disabled={!searchTermFrom(typed)}
                onPress={() => void search()}
              />

              {options?.length === 0 ? <Notice>Nothing free under that name. Try another.</Notice> : null}
              {options?.length ? (
                <View style={{ marginTop: spacing.lg }}>
                  {options.map((o) => (
                    <Pressable
                      key={o.domain}
                      disabled={!o.available}
                      onPress={() => startBuying(o)}
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: o.available ? 1 : 0.45 }}
                    >
                      <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{o.domain}</Text>
                      <Text style={{ fontSize: 13, color: o.available ? colors.text : colors.textMuted }}>{priceLine(o, currency)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xxl }}>ALREADY HAVE ONE?</Text>
              <Field
                label="Connect a domain you own"
                value={typed}
                onChangeText={setTyped}
                placeholder="yourbrand.com"
                keyboardType="url"
                autoCapitalize="none"
              />
              <Button
                label="Connect it"
                busyLabel="Connecting…"
                busy={busy === "connect"}
                kind="secondary"
                disabled={!typed.trim()}
                onPress={() => void run("connect")}
              />
            </>
          )}
        </>
      ) : (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>
              {live ? "LIVE" : "WAITING ON DNS"}
            </Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: live ? colors.positive : colors.text, marginTop: spacing.sm }}>
              {d.domain}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 }}>
              {live
                ? "Shoppers reach your storefront here."
                : "Add the records below at whoever you bought the domain from. It can take up to an hour to take effect."}
            </Text>
          </View>

          {!live && d.status?.records?.length ? (
            <View style={{ marginTop: spacing.xl }}>
              <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginBottom: spacing.sm }}>
                RECORDS TO ADD
              </Text>
              {d.status.records.map((r, i) => (
                <View
                  key={`${r.type}-${r.name}-${i}`}
                  style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={{ fontFamily: "Menlo", fontSize: 12, color: colors.textMuted, width: 56 }}>{r.type}</Text>
                    <Text style={{ fontFamily: "Menlo", fontSize: 12, color: colors.textMuted }}>{r.name}</Text>
                  </View>
                  <Text selectable style={{ fontFamily: "Menlo", fontSize: 13, color: colors.text, marginTop: 4 }}>
                    {r.value}
                  </Text>
                </View>
              ))}
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
                Press and hold a value to copy it.
              </Text>
            </View>
          ) : null}

          {!live ? (
            <Button label="Check again" busyLabel="Checking…" busy={busy === "verify"} onPress={() => void run("verify")} />
          ) : null}

          <Button
            label="Disconnect this domain"
            busyLabel="Disconnecting…"
            busy={busy === "remove"}
            kind="secondary"
            onPress={() => void run("remove")}
          />
          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 18 }}>
            Your storefront stays up at {storeSlug}.vyasites.com either way — disconnecting only stops
            it answering on {d.domain}.
          </Text>
        </>
      )}

      {bought ? <Notice tone="good">{bought} is yours, and your storefront is already on it.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </SellerScreen>
  );
}
