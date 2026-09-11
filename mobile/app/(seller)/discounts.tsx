import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Field, ChoiceRow, Button, Notice, Loading } from "../../components/seller/Form";
import { normalizeCode, describeDiscount, discountValueFromText, type DiscountKind } from "../../lib/seller/discounts";

// Codes in mono so they are readable at a glance, usage counts, live/ended — and now writable.
//
// This screen could show a seller every code she had and let her change none of them, which is the
// most annoying shape a screen can take: enough information to decide, no way to act on the
// decision. Creating a code is four fields and it is the thing she wants to do standing in a shop
// on a Saturday, not at a desk on a Tuesday.
//
// The switch on each row is the one control that acts immediately — turning a code off is the
// emergency ("that's been posted somewhere it shouldn't be"), and making her open an editor and
// press Save for that is making her slower at the one moment speed matters. Everything else is
// behind Edit.

type Discount = {
  id: number;
  code: string;
  label: string | null;
  kind: string;
  value: number | null;
  active: boolean;
  used?: number;
};

const BLANK = { code: "", label: "", kind: "percent" as DiscountKind, value: "" };

export default function DiscountsScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "discounts"],
    queryFn: () => apiGet<{ discounts: Discount[] }>("/api/store/discounts"),
    enabled: !!storeSlug,
  });

  const [open, setOpen] = useState<null | "new" | number>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = q.data?.discounts ?? [];

  function openNew() {
    setError(null);
    setForm(BLANK);
    setOpen("new");
  }
  function openEdit(d: Discount) {
    setError(null);
    setForm({
      code: d.code,
      label: d.label ?? "",
      kind: d.kind === "fixed" ? "fixed" : "percent",
      value: d.value != null ? String(d.value) : "",
    });
    setOpen(d.id);
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const payload = {
      code: normalizeCode(form.code),
      label: form.label.trim() || null,
      kind: form.kind,
      value: discountValueFromText(form.value, form.kind),
    };
    await act(async () => {
      if (open === "new") await apiPost("/api/store/discounts", payload);
      else await apiPatch("/api/store/discounts", { id: open, ...payload });
      setOpen(null);
      setForm(BLANK);
    });
  }

  return (
    <SellerScreen title="Discounts" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your discounts.</Empty>
      ) : q.isPending ? (
        <Loading />
      ) : (
        <>
          {list.length === 0 && open !== "new" ? (
            <Empty>No discount codes yet.</Empty>
          ) : (
            list.map((d) => (
              <View key={d.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Pressable style={{ flex: 1 }} onPress={() => (open === d.id ? setOpen(null) : openEdit(d))}>
                    <Text style={{ fontFamily: "Menlo", fontSize: 14, color: colors.text, letterSpacing: 0.5 }}>{d.code}</Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 3 }}>{describeDiscount(d)}</Text>
                  </Pressable>
                  {/* Immediate, because switching a code off is the urgent one. */}
                  <Switch
                    value={d.active}
                    disabled={busy}
                    onValueChange={(v) => void act(() => apiPatch("/api/store/discounts", { id: d.id, active: v }))}
                    trackColor={{ true: colors.accent, false: colors.chip }}
                  />
                </View>
                {open === d.id ? <FormBody /> : null}
              </View>
            ))
          )}

          {open === "new" ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted }}>NEW CODE</Text>
              <FormBody />
            </View>
          ) : (
            <Button label="New code" kind="secondary" onPress={openNew} />
          )}

          {error ? <Notice>{error}</Notice> : null}
        </>
      )}
    </SellerScreen>
  );

  function FormBody() {
    return (
      <View style={{ paddingBottom: spacing.lg }}>
        <Field
          label="Code"
          value={form.code}
          onChangeText={(v) => setForm({ ...form, code: v })}
          placeholder="SPRING20"
          autoCapitalize="characters"
          hint="What a buyer types at checkout. Letters and numbers."
        />
        <ChoiceRow
          label="Takes off"
          options={[
            { key: "percent" as DiscountKind, label: "A percentage" },
            { key: "fixed" as DiscountKind, label: "An amount" },
          ]}
          value={form.kind}
          onChange={(v) => setForm({ ...form, kind: v })}
        />
        <Field
          label="Amount"
          value={form.value}
          onChangeText={(v) => setForm({ ...form, value: v })}
          keyboardType={form.kind === "percent" ? "numeric" : "decimal-pad"}
          suffix={form.kind === "percent" ? "%" : undefined}
        />
        <Field
          label="Name it"
          value={form.label}
          onChangeText={(v) => setForm({ ...form, label: v })}
          placeholder="Optional — for you, not the buyer"
        />

        <Button
          label={open === "new" ? "Create code" : "Save"}
          busyLabel="Saving…"
          busy={busy}
          disabled={!normalizeCode(form.code)}
          onPress={() => void save()}
        />
        {typeof open === "number" ? (
          <Pressable
            onPress={() => void act(async () => { await apiDelete("/api/store/discounts", { id: open }); setOpen(null); })}
            disabled={busy}
            hitSlop={8}
            style={{ paddingVertical: spacing.md, alignItems: "center" }}
          >
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Delete this code</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}
