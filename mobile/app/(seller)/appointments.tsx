import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { Loading } from "../../components/seller/Form";
import { daySchedule, stillToCome, appointmentLine, clock, type Appointment } from "../../lib/seller/appointments";
import { todayDay } from "../../lib/seller/rentals";

// The diary — what is left today, and what tomorrow looks like.
//
// A schedule is the surface where a phone genuinely beats a laptop: it is checked standing up,
// between customers, with one hand. So the screen answers the standing-up question first — how many
// are left and when is the next — and only then lists them.
//
// Cancelled and no-shows are filtered out in daySchedule, not here: a day with three bookings and
// two cancellations reads as a busy day until you notice, and noticing is not the seller's job.

type Resp = { appointments: Appointment[] };

const DAYS: { key: "today" | "tomorrow"; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
];

function dayAfter(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`;
}

export default function AppointmentsScreen() {
  const { storeSlug } = useAuth();
  const [which, setWhich] = useState<"today" | "tomorrow">("today");
  const today = todayDay();
  const day = which === "today" ? today : dayAfter(today);

  const q = useQuery({
    queryKey: ["store", "appointments", day],
    queryFn: () => apiGet<Resp>(`/api/store/appointments?from=${day}&to=${day}`),
    enabled: !!storeSlug,
  });

  const schedule = daySchedule(q.data?.appointments ?? [], day);
  const left = which === "today" ? stillToCome(schedule) : schedule;

  return (
    <SellerScreen title="Appointments" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Chips options={DAYS} value={which} onChange={setWhich} />

      {q.isError ? (
        <Empty>Couldn&apos;t load your diary.</Empty>
      ) : q.isPending ? (
        <Loading />
      ) : (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl, marginTop: spacing.sm }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>
              {which === "today" ? "STILL TO COME" : "BOOKED"}
            </Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.text, marginTop: spacing.sm }}>
              {left.length}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
              {left.length === 0
                ? which === "today" ? "Nothing left today." : "Nothing booked."
                : `Next at ${clock(left[0].start)}`}
            </Text>
          </View>

          {schedule.length === 0 ? (
            <Empty>Nothing in the diary {which === "today" ? "today" : "tomorrow"}.</Empty>
          ) : (
            schedule.map((a) => {
              // A past appointment stays on the list — she may need to mark it or look it up — but
              // it steps back so the eye lands on what is still ahead.
              const done = which === "today" && !left.includes(a);
              return (
                <View key={a.id} style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: done ? 0.45 : 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                    {appointmentLine(a)}
                  </Text>
                  {a.note ? (
                    <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={2}>{a.note}</Text>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: a.note ? spacing.sm : spacing.xs }}>
                    {a.customerPhone ? (
                      <Pressable hitSlop={8} onPress={() => void Linking.openURL(`tel:${a.customerPhone}`)}>
                        <Text style={{ fontSize: 13, color: colors.accent, fontWeight: "600" }}>Call</Text>
                      </Pressable>
                    ) : null}
                    {a.customerEmail ? (
                      <Pressable hitSlop={8} onPress={() => void Linking.openURL(`mailto:${a.customerEmail}`)}>
                        <Text style={{ fontSize: 13, color: colors.accent, fontWeight: "600" }}>Email</Text>
                      </Pressable>
                    ) : null}
                    {a.status !== "booked" ? (
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>{a.status}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </SellerScreen>
  );
}
