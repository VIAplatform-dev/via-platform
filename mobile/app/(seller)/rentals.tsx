import { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts, radius, eyebrow } from "../../lib/portal-theme";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { Loading } from "../../components/seller/Form";
import {
  rentalDay, bookingLine, trackingLine, todayDay, rentalState, filterRentalItems, countByState,
  fromPrice, stateLine, RENTAL_STATES, type Booking, type RentalItem, type RentalState,
} from "../../lib/seller/rentals";

// WHAT SHE RENTS OUT, and what is happening to each piece.
//
// This screen used to be the DAY only: going out, coming back, overdue. All three are real work
// and they stay, at the top, where they always were. But a shop with fourteen rentable pieces and
// a quiet week opened this and read "Nothing out and nothing booked": true, and an answer to a
// question nobody asked. The pieces themselves were unreachable from the app that manages them.
//
// So: the day first when there IS one, then the pieces, filtered by state. Available, booked, out,
// overdue. The states are fewer than the booking table's on purpose (see rentalState): she is
// looking over what she rents, not auditing a workflow.
//
// The day's sections below.
//
// Three lists in that order, because that is the order the day happens in and the order the work
// matters. OVERDUE IS FIRST when there is any: a piece due three days ago is a phone call, not a
// return, and a screen that files it under "coming back" is how it stays lost for a week.
//
// The return label and the carrier's tracking sit on the row rather than a detail screen, at the
// counter the question is "where is it", and making her tap through to find out is the whole
// friction this screen exists to remove.

type Resp = { bookings: Booking[] };

function Section({ title, tone, items, today }: { title: string; tone?: "urgent"; items: Booking[]; today: string }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={{ ...eyebrow, color: tone === "urgent" ? colors.accent : colors.textDim }}>
        {title.toUpperCase()}
      </Text>
      {items.map((b) => {
        const tracking = trackingLine(b);
        return (
          <View key={b.id} style={{ flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {b.image ? (
              <Image source={{ uri: b.image }} style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.chip }} />
            ) : (
              <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.chip }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                {b.title ?? "Piece"}
              </Text>
              <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                {bookingLine(b, today)}
              </Text>
              {tracking ? (
                <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{tracking}</Text>
              ) : null}
              {b.returnLabelUrl ? (
                <Pressable hitSlop={8} onPress={() => void Linking.openURL(b.returnLabelUrl!)} style={{ marginTop: spacing.xs }}>
                  <Text style={{ fontSize: 13, color: colors.accent, fontWeight: "600" }}>Return label</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function RentalsScreen() {
  const { storeSlug } = useAuth();
  const [state, setState] = useState<RentalState | "all">("all");

  const q = useQuery({
    queryKey: ["store", "rentals", "bookings"],
    queryFn: () => apiGet<Resp>("/api/store/rentals/bookings"),
    enabled: !!storeSlug,
  });
  // What she rents out. Separate query so a slow list never blanks today's work, which is the half
  // of this screen that is time-critical.
  const forRent = useQuery({
    queryKey: ["store", "rentals", "items"],
    queryFn: () => apiGet<{ items: RentalItem[] }>("/api/store/rentals/terms"),
    enabled: !!storeSlug,
  });

  const today = todayDay();
  const day = rentalDay(q.data?.bookings ?? [], today);
  const nothing = !day.goingOut.length && !day.comingBack.length && !day.overdue.length && !day.out.length;
  const items = forRent.data?.items ?? [];
  const counts = countByState(items, today);
  const visible = filterRentalItems(items, state, today);

  return (
    <SellerScreen
      title="Rentals"
      back
      onRefresh={() => { void q.refetch(); void forRent.refetch(); }}
      refreshing={q.isRefetching || forRent.isRefetching}
    >
      {q.isError ? (
        <Empty>Couldn&apos;t load your rentals.</Empty>
      ) : q.isPending ? (
        <Loading />
      ) : nothing ? null : (
        <>
          <View style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.xl, marginTop: spacing.sm }}>
            <Text style={{ ...eyebrow }}>OUT NOW</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.text, marginTop: spacing.sm }}>
              {day.out.length}
            </Text>
            <Text style={{ fontSize: 13, color: day.overdue.length ? colors.accent : colors.textMuted, marginTop: 4 }}>
              {day.overdue.length
                ? `${day.overdue.length} overdue`
                : day.comingBack.length
                  ? `${day.comingBack.length} back today`
                  : "All on time"}
            </Text>
          </View>

          <Section title="Overdue" tone="urgent" items={day.overdue} today={today} />
          <Section title="To ship" items={day.goingOut} today={today} />
          <Section title="Coming back" items={day.comingBack} today={today} />
          <Section title="Out" items={day.out.filter((b) => !day.comingBack.includes(b) && !day.overdue.includes(b))} today={today} />
        </>
      )}

      {/* Every piece with rental terms on it, whatever today looks like. */}
      <Text style={{ ...eyebrow, marginTop: nothing ? spacing.sm : spacing.xxl }}>
        ITEMS FOR RENT
      </Text>

      {/* Counts on the chips, so "Overdue" is answerable without tapping it. A state nothing is in
          still draws, greyed by its own zero: a chip that appears and disappears as the week
          changes is a row she cannot learn the shape of. */}
      <Chips
        options={RENTAL_STATES.map((s) => ({ key: s.key, label: counts[s.key] ? `${s.label} ${counts[s.key]}` : s.label }))}
        value={state}
        onChange={setState}
      />

      {forRent.isError ? (
        <Empty>Couldn&apos;t load your rentable pieces.</Empty>
      ) : forRent.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>Nothing is set up to rent yet. Open a piece and give it rental terms.</Empty>
      ) : visible.length === 0 ? (
        <Empty>Nothing {state}.</Empty>
      ) : (
        visible.map((it) => {
          const st = rentalState(it, today);
          const price = fromPrice(it);
          return (
            <Link key={it.itemId} href={{ pathname: "/(seller)/piece/[id]", params: { id: it.itemId } }} asChild>
              <Pressable style={{ flexDirection: "row", gap: spacing.md, alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Image source={{ uri: it.image ?? undefined }} style={{ width: 52, height: 52, borderRadius: radius, backgroundColor: colors.chip }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                    {it.title ?? "Untitled piece"}
                  </Text>
                  <Text
                    style={{ fontSize: 13, marginTop: 2, color: st === "overdue" ? colors.accent : st === "available" ? colors.positive : colors.textMuted }}
                    numberOfLines={1}
                  >
                    {stateLine(it, today)}
                  </Text>
                  {price ? <Text style={{ fontSize: 13, color: colors.textDim, marginTop: 1 }}>{price}</Text> : null}
                </View>
                <Feather name="chevron-right" size={18} color={colors.textDim} />
              </Pressable>
            </Link>
          );
        })
      )}
    </SellerScreen>
  );
}
