import { Image, Linking, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Loading } from "../../components/seller/Form";
import { rentalDay, bookingLine, trackingLine, todayDay, type Booking } from "../../lib/seller/rentals";

// What leaves today, what comes back today, and what is late.
//
// Three lists in that order, because that is the order the day happens in and the order the work
// matters. OVERDUE IS FIRST when there is any: a piece due three days ago is a phone call, not a
// return, and a screen that files it under "coming back" is how it stays lost for a week.
//
// The return label and the carrier's tracking sit on the row rather than a detail screen — at the
// counter the question is "where is it", and making her tap through to find out is the whole
// friction this screen exists to remove.

type Resp = { bookings: Booking[] };

function Section({ title, tone, items, today }: { title: string; tone?: "urgent"; items: Booking[]; today: string }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={{ fontSize: 11, letterSpacing: 1.4, color: tone === "urgent" ? colors.accent : colors.textMuted, fontWeight: "700" }}>
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
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                {bookingLine(b, today)}
              </Text>
              {tracking ? (
                <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{tracking}</Text>
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
  const q = useQuery({
    queryKey: ["store", "rentals", "bookings"],
    queryFn: () => apiGet<Resp>("/api/store/rentals/bookings"),
    enabled: !!storeSlug,
  });

  const today = todayDay();
  const day = rentalDay(q.data?.bookings ?? [], today);
  const nothing = !day.goingOut.length && !day.comingBack.length && !day.overdue.length && !day.out.length;

  return (
    <SellerScreen title="Rentals" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your rentals.</Empty>
      ) : q.isPending ? (
        <Loading />
      ) : nothing ? (
        <Empty>Nothing out and nothing booked.</Empty>
      ) : (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl, marginTop: spacing.sm }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>OUT NOW</Text>
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
          <Section title="Going out today" items={day.goingOut} today={today} />
          <Section title="Coming back today" items={day.comingBack} today={today} />
          <Section title="Out" items={day.out.filter((b) => !day.comingBack.includes(b) && !day.overdue.includes(b))} today={today} />
        </>
      )}
    </SellerScreen>
  );
}
