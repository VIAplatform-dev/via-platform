import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { allTags, filterByTag, withTag, withoutTag } from "../../lib/seller/customers";
import { SellerScreen, Empty } from "../../components/seller/Screen";

// Customers, sorted by what they have spent — not alphabetically. The one line that matters is at
// the bottom: how much of her business is repeat.
//
// Tap one and it opens in place: her note (saved when she leaves the box) and her tags (add one,
// tap one to remove it). Tags are also the filter row along the top — "who did I tag market?" is
// the counter question. Same route the web's customer page writes to, same shape.

type Customer = { email: string; name: string | null; location: string | null; orders: number; spentCents: number; tags?: string[]; notes?: string | null };

/** The first line of her note — enough to remember who this is at the counter. */
const noteLine = (notes: string | null | undefined) => (notes || "").split("\n").map((l) => l.trim()).find(Boolean) ?? null;

export default function CustomersScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const q = useQuery({
    queryKey: ["store", "customers"],
    queryFn: () => apiGet<{ customers: Customer[]; buyers: number }>("/api/store/customers"),
    enabled: !!storeSlug,
  });
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // the customer whose card is open, by email
  const [note, setNote] = useState<string | null>(null); // what she is typing; null = untouched
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  // One PATCH per change; the list refetches so the chips and the note line agree with the server.
  const save = useMutation({
    mutationFn: (body: { email: string; notes?: string; tags?: string[] }) => apiPatch("/api/store/customers/profile", body),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["store", "customers"] }); },
    onError: () => setError("Couldn't save that. Try again."),
  });

  const currency = me.data?.currency ?? "USD";
  const buyers = (q.data?.customers ?? []).filter((c) => c.orders > 0);
  const tags = allTags(buyers);
  const ranked = filterByTag([...buyers].sort((a, b) => b.spentCents - a.spentCents), tag);
  const repeat = buyers.filter((c) => c.orders > 1).length;
  const repeatPct = buyers.length ? Math.round((repeat / buyers.length) * 100) : 0;

  const toggle = (c: Customer) => {
    if (open === c.email) { setOpen(null); setNote(null); setNewTag(""); return; }
    setOpen(c.email); setNote(null); setNewTag(""); setError(null);
  };
  const saveNote = (c: Customer) => {
    if (note === null || note === (c.notes ?? "")) return;
    save.mutate({ email: c.email, notes: note });
  };
  const addTag = (c: Customer) => {
    const next = withTag(c.tags, newTag);
    setNewTag("");
    if (next.length !== (c.tags ?? []).length) save.mutate({ email: c.email, tags: next });
  };

  return (
    <SellerScreen title="Customers" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {tags.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }}>
          {[null, ...tags].map((t) => {
            const on = t === tag;
            return (
              <Pressable key={t ?? "__all"} onPress={() => setTag(on ? null : t)} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{t ?? "All"}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {q.isError ? (
        <Empty>Couldn&apos;t load your customers.</Empty>
      ) : ranked.length === 0 && !q.isPending ? (
        <Empty>{tag ? `Nobody tagged ${tag}.` : "No customers yet."}</Empty>
      ) : (
        <>
          {ranked.slice(0, 50).map((c) => {
            const isOpen = open === c.email;
            return (
              <View key={c.email} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Pressable onPress={() => toggle(c)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{c.name ?? c.email}</Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                      {c.orders} {c.orders === 1 ? "order" : "orders"}{c.location ? ` · ${c.location}` : ""}
                    </Text>
                    {!isOpen && (c.tags ?? []).length > 0 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {(c.tags ?? []).slice(0, 4).map((t) => (
                          <View key={t} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.chip }}>
                            <Text style={{ fontSize: 10.5, color: colors.textMuted }}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {!isOpen && noteLine(c.notes) ? (
                      <Text style={{ fontSize: 12.5, color: colors.textDim, marginTop: 3 }} numberOfLines={1}>{noteLine(c.notes)}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>{formatMoney(c.spentCents, currency)}</Text>
                    <Text style={{ fontSize: 11, color: colors.textDim }}>lifetime</Text>
                  </View>
                </Pressable>

                {isOpen ? (
                  <View style={{ paddingBottom: spacing.lg, paddingLeft: 36 + spacing.md }}>
                    <Text style={{ fontSize: 12, color: colors.textDim }}>{c.email}</Text>
                    <Text style={{ fontFamily: fonts.serif, fontSize: 15, color: colors.text, marginTop: spacing.md }}>Note</Text>
                    <TextInput
                      value={note ?? c.notes ?? ""}
                      onChangeText={setNote}
                      onBlur={() => saveNote(c)}
                      multiline
                      placeholder="What to remember about them — sizes, what they look for, how they like to be reached"
                      placeholderTextColor={colors.textDim}
                      style={{ fontSize: 14, color: colors.text, lineHeight: 20, minHeight: 60, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    />
                    <Text style={{ fontFamily: fonts.serif, fontSize: 15, color: colors.text, marginTop: spacing.md }}>Tags</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
                      {(c.tags ?? []).map((t) => (
                        <Pressable key={t} onPress={() => save.mutate({ email: c.email, tags: withoutTag(c.tags, t) })} style={{ flexDirection: "row", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: 999, backgroundColor: colors.chip }}>
                          <Text style={{ fontSize: 12.5, color: colors.text }}>{t}</Text>
                          <Text style={{ fontSize: 12.5, color: colors.textDim }}>×</Text>
                        </Pressable>
                      ))}
                      <TextInput
                        value={newTag}
                        onChangeText={setNewTag}
                        onSubmitEditing={() => addTag(c)}
                        onBlur={() => { if (newTag.trim()) addTag(c); }}
                        placeholder="Add a tag"
                        placeholderTextColor={colors.textDim}
                        autoCapitalize="none"
                        returnKeyType="done"
                        style={{ minWidth: 96, fontSize: 13, color: colors.text, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border }}
                      />
                    </View>
                    {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm }}>{error}</Text> : null}
                    {save.isPending ? <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm }}>Saving…</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {buyers.length ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.lg }}>
              <Text style={{ color: colors.positive, fontWeight: "700" }}>{repeatPct}%</Text> of your buyers have ordered more than once.
            </Text>
          ) : null}
        </>
      )}
    </SellerScreen>
  );
}
