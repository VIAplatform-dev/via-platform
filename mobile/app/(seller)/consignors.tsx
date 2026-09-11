import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Field, ChoiceRow, Button, Notice, Loading } from "../../components/seller/Form";
import { PAYOUT_METHOD_LABELS, payoutMethodOptions, splitPctFromText, describeConsignor } from "../../lib/seller/consignors";

// The people who bring pieces in — added, edited and removed on the phone.
//
// This is the screen the app was missing rather than a screen it did badly: Consignment could show
// what was OWED and to whom, but a consignor could only be created on the desktop, so a seller
// standing in her shop with someone handing her a coat had nowhere to put their name.
//
// One list, and a form that opens in place under "Add someone". No modal: a modal over a list on a
// phone hides the thing you are adding to, and this list is short by nature — a shop with two
// hundred consignors is not a shop, it is a warehouse.
//
// PAYOUT METHOD IS THE ONE FIELD THAT CAN BE REFUSED. Whether a sale's cut went into VYA's balance
// (Stripe) or stayed in the till (cash, credit) was decided AT the sale, so the server rejects a
// change while a balance is outstanding. That refusal is shown in the server's own words — it names
// the fix, and rewording it here would only make it vaguer.

type Consignor = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  defaultSplitPct: number | null;
  payoutMethod: string | null;
  status: string;
  balanceCents?: number;
};
type Config = { payoutMethods?: string[]; storeDefaultSplitPct?: number | null };

const BLANK = { name: "", email: "", phone: "", split: "", method: "" };

export default function ConsignorsScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["store", "consignors"],
    queryFn: () => apiGet<{ consignors: Consignor[] }>("/api/store/consignment/consignors"),
    enabled: !!storeSlug,
  });
  const cfg = useQuery({
    queryKey: ["store", "consignment", "config"],
    queryFn: () => apiGet<Config>("/api/store/consignment/config"),
    enabled: !!storeSlug,
  });
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const currency = me.data?.currency ?? "USD";

  // null = closed, "new" = the add form, a number = editing that consignor.
  const [open, setOpen] = useState<null | "new" | number>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methods = payoutMethodOptions(cfg.data?.payoutMethods);
  const list = q.data?.consignors ?? [];

  function openNew() {
    setError(null);
    setForm({ ...BLANK, split: cfg.data?.storeDefaultSplitPct != null ? String(cfg.data.storeDefaultSplitPct) : "", method: methods[0]?.key ?? "" });
    setOpen("new");
  }

  function openEdit(c: Consignor) {
    setError(null);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      split: c.defaultSplitPct != null ? String(c.defaultSplitPct) : "",
      method: c.payoutMethod ?? "",
    });
    setOpen(c.id);
  }

  async function save() {
    setError(null);
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      defaultSplitPct: splitPctFromText(form.split),
      payoutMethod: form.method || null,
    };
    try {
      if (open === "new") await apiPost("/api/store/consignment/consignors", payload);
      else await apiPatch("/api/store/consignment/consignors", { id: open, ...payload });
      setOpen(null);
      setForm(BLANK);
      await q.refetch();
      await qc.invalidateQueries({ queryKey: ["store", "consignment"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setError(null);
    setBusy(true);
    try {
      await apiDelete(`/api/store/consignment/consignors?id=${id}`);
      setOpen(null);
      await q.refetch();
      await qc.invalidateQueries({ queryKey: ["store", "consignment"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove them.");
    } finally {
      setBusy(false);
    }
  }

  const editing = typeof open === "number" ? list.find((c) => c.id === open) ?? null : null;
  const owes = editing?.balanceCents ?? 0;

  return (
    <SellerScreen title="Consignors" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your consignors.</Empty>
      ) : q.isPending ? (
        <Loading />
      ) : (
        <>
          {list.length === 0 && open !== "new" ? (
            <Empty>Nobody yet. Add the first person who brings you pieces.</Empty>
          ) : (
            list.map((c) => (
              <View key={c.id}>
                <Pressable
                  onPress={() => (open === c.id ? setOpen(null) : openEdit(c))}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                      {describeConsignor(c)}
                    </Text>
                  </View>
                  {c.balanceCents ? (
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>{formatMoney(c.balanceCents, currency)}</Text>
                  ) : null}
                  <Text style={{ fontSize: 14, color: colors.accent, fontWeight: "600" }}>
                    {open === c.id ? "Done" : "Edit"}
                  </Text>
                </Pressable>
                {open === c.id ? <FormBody /> : null}
              </View>
            ))
          )}

          {open === "new" ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted }}>NEW CONSIGNOR</Text>
              <FormBody />
            </View>
          ) : (
            <Button label="Add someone" kind="secondary" onPress={openNew} />
          )}

          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </SellerScreen>
  );

  // Declared inside so the form reads the same state whether it is adding or editing — the two
  // differ only in which request the Save button makes.
  function FormBody() {
    return (
      <View style={{ paddingBottom: spacing.lg }}>
        <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Who brings the pieces in" autoCapitalize="words" />
        <Field label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} placeholder="Optional" keyboardType="email-address" autoCapitalize="none" hint="Used to send them their own login for what they're owed." />
        <Field label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="Optional" keyboardType="phone-pad" />
        <Field
          label="Their cut"
          value={form.split}
          onChangeText={(v) => setForm({ ...form, split: v.replace(/[^0-9]/g, "") })}
          keyboardType="numeric"
          suffix="%"
          hint="What they keep of each sale. Leave blank to use the store default."
        />
        {methods.length ? (
          <ChoiceRow
            label="Paid by"
            options={methods}
            value={form.method}
            onChange={(v) => setForm({ ...form, method: v })}
            hint={owes ? "They have money outstanding — this can't change until they're paid out." : undefined}
          />
        ) : null}

        <Button
          label={open === "new" ? "Add them" : "Save"}
          busyLabel="Saving…"
          busy={busy}
          disabled={!form.name.trim()}
          onPress={() => void save()}
        />
        {typeof open === "number" ? (
          <Pressable onPress={() => void remove(open)} disabled={busy} hitSlop={8} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              {owes ? `Remove ${editing?.name ?? "them"} — ${formatMoney(owes, currency)} still owed` : `Remove ${editing?.name ?? "them"}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}
