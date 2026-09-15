import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radius, fonts } from "../../lib/portal-theme";
import {
  combine, formatClock, isPastDay, isSchedulable, monthGrid, monthLabel,
  parseClock, sameDay, shiftMonth,
} from "../../lib/seller/calendar";

// A calendar and a time, for deciding when a piece goes out.
//
// The four presets this replaced ("This evening", "Tomorrow morning", "Saturday morning") answered
// a question nobody was asking. A seller scheduling a listing has a DATE in mind, because the drop
// is on a date, and "Saturday morning" cannot express the Saturday after next.
//
// Pure JS on purpose: @react-native-community/datetimepicker is a native module, and a native
// module means a fresh binary on every phone for one control. This ships over the air.

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** One number with an arrow above and below. The clock's two halves are the same control twice. */
function Stepper({ value, onUp, onDown, label }: { value: string; onUp: () => void; onDown: () => void; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable onPress={onUp} hitSlop={10} accessibilityLabel={`${label} up`} style={{ padding: 2 }}>
        <Feather name="chevron-up" size={18} color={colors.textMuted} />
      </Pressable>
      <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text, minWidth: 40, textAlign: "center" }}>{value}</Text>
      <Pressable onPress={onDown} hitSlop={10} accessibilityLabel={`${label} down`} style={{ padding: 2 }}>
        <Feather name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function WhenPicker({ value, onChange }: { value: Date | null; onChange: (next: Date | null) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(() => shiftMonth(value ?? now, 0));
  // The time is held apart from the day so changing the day at 6pm doesn't reset it to midnight.
  const [hour, setHour] = useState(value ? value.getHours() : 18);
  const [minute, setMinute] = useState(value ? value.getMinutes() : 0);
  const [typing, setTyping] = useState<string | null>(null);

  const pickDay = (day: Date) => onChange(combine(day, hour, minute));
  const pickTime = (h: number, m: number) => {
    setHour(h);
    setMinute(m);
    // Only rewrites an existing choice. Setting a time before a day would invent a date she never
    // picked, and the confirm below is what turns "some time" into "this instant".
    if (value) onChange(combine(value, h, m));
  };

  const commitTyped = () => {
    const parsed = typing === null ? null : parseClock(typing);
    if (parsed) pickTime(parsed.hour, parsed.minute);
    setTyping(null);
  };

  const weeks = monthGrid(month);
  const tooSoon = value !== null && !isSchedulable(value, now);

  return (
    <View style={{ marginTop: spacing.md }}>
      {/* Month, and the way back and forward. Past months are reachable: a seller scrolling back to
          check a date is not an error, and every day in them is simply not tappable. */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
        <Pressable hitSlop={10} onPress={() => setMonth(shiftMonth(month, -1))} accessibilityLabel="Previous month">
          <Feather name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 16, color: colors.text }}>
          {monthLabel(month)}
        </Text>
        <Pressable hitSlop={10} onPress={() => setMonth(shiftMonth(month, 1))} accessibilityLabel="Next month">
          <Feather name="chevron-right" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row" }}>
        {DOW.map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, color: colors.textDim, marginBottom: 4 }}>{d}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: "row" }}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={{ flex: 1, height: 38 }} />;
            const past = isPastDay(day, now);
            const on = sameDay(day, value);
            const today = sameDay(day, now);
            return (
              <Pressable
                key={di}
                disabled={past}
                onPress={() => pickDay(day)}
                style={{ flex: 1, height: 38, alignItems: "center", justifyContent: "center" }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.accent : "transparent" }}>
                  <Text style={{ fontSize: 14, color: on ? colors.accentText : past ? colors.textDim : colors.text, fontWeight: on || today ? "700" : "400" }}>
                    {day.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* THE TIME, AS A CLOCK.
          This was four chips (9am, 12pm, 6pm, 8pm) and a box. The chips are the same mistake the
          day presets were: they answer for her. Hours and minutes step with the arrows, AM/PM is a
          toggle, and the middle is still a plain box for anyone who would rather type "6:45pm" than
          tap to it. Minutes step by five: nobody schedules a drop for 6:43. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg }}>
        <Stepper
          value={String(hour % 12 === 0 ? 12 : hour % 12)}
          onUp={() => pickTime((hour + 1) % 24, minute)}
          onDown={() => pickTime((hour + 23) % 24, minute)}
          label="Hour"
        />
        <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text, marginTop: 14 }}>:</Text>
        <Stepper
          value={String(minute).padStart(2, "0")}
          onUp={() => pickTime(hour, (minute + 5) % 60)}
          onDown={() => pickTime(hour, (minute + 55) % 60)}
          label="Min"
        />
        <View style={{ marginLeft: spacing.sm, marginTop: 14 }}>
          {(["am", "pm"] as const).map((half) => {
            const on = (half === "am") === (hour < 12);
            return (
              <Pressable
                key={half}
                onPress={() => pickTime(half === "am" ? hour % 12 : (hour % 12) + 12, minute)}
                style={{ paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius, backgroundColor: on ? colors.chipActive : colors.chip, marginBottom: 3 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>
                  {half.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Or type it. "6pm", "6:30pm" and "18:30" all parse; rejecting one of those for want of a
          colon is how you make a seller give up and publish it now instead. */}
      <TextInput
        value={typing ?? formatClock(hour, minute)}
        onFocus={() => setTyping(formatClock(hour, minute))}
        onChangeText={setTyping}
        onBlur={commitTyped}
        onSubmitEditing={commitTyped}
        placeholder="6:30pm"
        placeholderTextColor={colors.textDim}
        style={{ alignSelf: "center", minWidth: 110, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, textAlign: "center" }}
      />

      {/* A time that has already gone is refused by the server, so it is refused here, before she
          taps List it and is told no. */}
      {tooSoon ? (
        <Text style={{ fontSize: 12, color: colors.text, marginTop: spacing.sm }}>
          That has already passed. Pick a later time.
        </Text>
      ) : null}
    </View>
  );
}
