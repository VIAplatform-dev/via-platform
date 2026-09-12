import { useRef } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { colors, spacing } from "../../lib/theme";

// The pieces every settings screen is built from.
//
// These exist because nine screens moved off the desktop at once — payouts, returns, domain,
// consignors, discounts, billing, labels, shipping, tax — and nine hand-rolled forms would drift
// into nine slightly different ideas of what a label, a save button and an error look like. The
// seller notices that even when she couldn't name it.
//
// The palette rule from lib/theme.ts holds throughout: one burgundy ink, green ONLY for something
// that has genuinely gone right. There is no red. A failed save says so in words on the same chip
// ground every other notice uses — a settings screen that flashes red at a seller who mistyped a
// postcode is a worse screen, and burgundy on cream is already legible.

/**
 * A label on the left, its box on the right — the shape the piece editor and the new-listing form
 * both use.
 *
 * WRAPPED IN A PRESSABLE THAT FOCUSES THE BOX. Without it only the right-hand portion of the row
 * does anything: the label is a fixed-width column, and tapping it — which is where the eye goes,
 * because it is the word naming the thing you want to change — misses the input entirely. On a
 * phone that reads as a field you are not allowed to edit.
 */
export function InlineField({
  label, value, onChangeText, labelWidth = 96, placeholder, keyboardType, autoCapitalize, multiline, trailing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  labelWidth?: number;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "decimal-pad" | "phone-pad" | "url" | "numbers-and-punctuation";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  /** A unit, an OPTIONAL badge — anything that sits after the box on the same row. */
  trailing?: React.ReactNode;
}) {
  const box = useRef<TextInput>(null);
  return (
    <Pressable
      onPress={() => box.current?.focus()}
      style={{ flexDirection: "row", alignItems: multiline ? "flex-start" : "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}
    >
      <Text style={{ width: labelWidth, fontSize: 14, color: colors.textMuted, paddingTop: multiline ? spacing.sm : 0 }}>{label}</Text>
      <TextInput
        ref={box}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === "none" ? false : undefined}
        multiline={multiline}
        style={{
          flex: 1,
          fontSize: 15,
          color: colors.text,
          fontWeight: multiline ? "400" : "600",
          paddingVertical: spacing.sm,
          minHeight: multiline ? 72 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {trailing}
    </Pressable>
  );
}

/** A labelled text field. `hint` sits under it for the thing the label can't say in two words. */
export function Field({
  label, value, onChangeText, hint, placeholder, keyboardType, multiline, autoCapitalize, editable = true, suffix,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "decimal-pad" | "phone-pad" | "url";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  /** A unit drawn inside the field's right edge — "%", "days", "oz". */
  suffix?: string;
}) {
  const box = useRef<TextInput>(null);
  return (
    // Pressable for the same reason as InlineField: the label is part of the control, so tapping
    // it has to put the cursor in the box rather than doing nothing.
    <Pressable onPress={() => box.current?.focus()} style={{ marginTop: spacing.lg }}>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TextInput
          ref={box}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCapitalize === "none" ? false : undefined}
          multiline={multiline}
          editable={editable}
          style={{
            flex: 1,
            fontSize: 15,
            color: editable ? colors.text : colors.textMuted,
            fontWeight: multiline ? "400" : "600",
            paddingVertical: spacing.sm,
            minHeight: multiline ? 96 : undefined,
            // Multiline on Android starts vertically centred, which looks like a bug in a form.
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
        {suffix ? <Text style={{ fontSize: 13, color: colors.textDim, marginLeft: spacing.sm }}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>{hint}</Text> : null}
    </Pressable>
  );
}

/** A switch on its own row, with room to say what turning it off actually does. */
export function ToggleRow({
  label, value, onValueChange, hint, disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <View style={{ paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{label}</Text>
        <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: colors.accent, false: colors.chip }} />
      </View>
      {hint ? <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>{hint}</Text> : null}
    </View>
  );
}

/** Two or three mutually exclusive answers, drawn as the same chips used everywhere else. */
export function ChoiceRow<T extends string>({
  label, options, value, onChange, hint,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  hint?: string;
}) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>{hint}</Text> : null}
    </View>
  );
}

/** The one filled control on a form. `busy` swaps the label rather than the shape, so nothing jumps. */
export function Button({
  label, busyLabel, onPress, busy, disabled, kind = "primary",
}: {
  label: string;
  busyLabel?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  kind?: "primary" | "secondary";
}) {
  const off = Boolean(busy || disabled);
  const primary = kind === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={{
        marginTop: spacing.lg,
        backgroundColor: primary ? colors.accent : colors.chip,
        borderRadius: 10,
        paddingVertical: spacing.lg,
        alignItems: "center",
        opacity: off ? 0.6 : 1,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color: primary ? colors.accentText : colors.text }}>
        {busy ? (busyLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}

/** Anything the screen needs to say back: a save that failed, a rule that applies, a step still to do. */
export function Notice({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" }) {
  return (
    <View style={{ backgroundColor: colors.chip, borderRadius: 10, padding: spacing.md, marginTop: spacing.lg }}>
      <Text style={{ fontSize: 13, color: tone === "good" ? colors.positive : colors.text, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

/** The resting state while a screen's first read is in flight. */
export function Loading() {
  return (
    <View style={{ paddingVertical: spacing.xxl, alignItems: "center" }}>
      <ActivityIndicator color={colors.textDim} />
    </View>
  );
}
