import { useRef } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { colors, spacing, button, radius, pill, fonts } from "../../lib/portal-theme";

// The pieces every settings screen is built from.
//
// These exist because nine screens moved off the desktop at once. Payouts, returns, domain,
// consignors, discounts, billing, labels, shipping, tax, and nine hand-rolled forms would drift
// into nine slightly different ideas of what a label, a save button and an error look like. The
// seller notices that even when she couldn't name it.
//
// The palette rule from lib/portal-theme.ts holds throughout: one burgundy ink, green ONLY for something
// that has genuinely gone right. There is no red. A failed save says so in words on the same chip
// ground every other notice uses. A settings screen that flashes red at a seller who mistyped a
// postcode is a worse screen, and burgundy on cream is already legible.

/**
 * A label on the left, its box on the right. The shape the piece editor and the new-listing form
 * both use.
 *
 * WRAPPED IN A PRESSABLE THAT FOCUSES THE BOX. Without it only the right-hand portion of the row
 * does anything: the label is a fixed-width column, and tapping it, which is where the eye goes,
 * because it is the word naming the thing you want to change. Misses the input entirely. On a
 * phone that reads as a field you are not allowed to edit.
 *
 * THE LABEL SITS ABOVE THE BOX, and the box has an edge.
 *
 * It used to be a 96pt label column and a bare underlined value: two columns of small type an
 * eighth of an inch apart, with nothing drawing the boundary between one field and the next. The
 * report was the right one, "it is a little bit too small and a little bit too close together, it
 * needs to be clearly in different boxes", and it is the same shape the web form has had all
 * along: a label, then a bordered input under it.
 *
 * The value is 16px. Not 13. This is typed into, one-handed, in a shop, sometimes by someone who
 * would rather not reach for their glasses, and a field nobody can read is a field filled wrong.
 */
export function InlineField({
  label, value, onChangeText, labelWidth, placeholder, keyboardType, autoCapitalize, multiline, trailing,
  onFocus, onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  /** For a field whose change has consequences: act when she LEAVES it, not per keystroke. Halfway
   *  through retyping a brand, "Dolce & Gabban" is a half-deleted word, not a new answer. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** Ignored. Kept so call sites that still pass it compile; the label sits ABOVE the box now. */
  labelWidth?: number;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "decimal-pad" | "phone-pad" | "url" | "numbers-and-punctuation";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  /** A unit, an OPTIONAL badge. Anything that sits after the box on the same row. */
  trailing?: React.ReactNode;
}) {
  const box = useRef<TextInput>(null);
  void labelWidth;
  return (
    <Pressable onPress={() => box.current?.focus()} style={{ marginTop: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 }}>
        <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500" }}>{label}</Text>
        {trailing}
      </View>
      <TextInput
        ref={box}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === "none" ? false : undefined}
        multiline={multiline}
        style={{
          backgroundColor: colors.bgCard,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          fontSize: 16,
          color: colors.text,
          fontWeight: "400",
          minHeight: multiline ? 88 : 46,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
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
  /** A unit drawn inside the field's right edge. "%", "days", "oz". */
  suffix?: string;
}) {
  const box = useRef<TextInput>(null);
  return (
    // Pressable for the same reason as InlineField: the label is part of the control, so tapping
    // it has to put the cursor in the box rather than doing nothing.
    <Pressable onPress={() => box.current?.focus()} style={{ marginTop: spacing.lg }}>
      <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500", marginBottom: 6 }}>{label}</Text>
      {/* A BOX WITH AN EDGE, not an underline. An underlined value in a column of underlined
          values gives the eye nothing to separate one field from the next, and at 12/15px in a
          shop that is a form filled wrong. Same shape as InlineField and as the web's. */}
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing.md }}>
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
            fontSize: 16,
            color: editable ? colors.text : colors.textMuted,
            fontWeight: "400",
            paddingVertical: spacing.md,
            minHeight: multiline ? 96 : 46,
            // Multiline on Android starts vertically centred, which looks like a bug in a form.
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
        {suffix ? <Text style={{ fontSize: 14, color: colors.textMuted, marginLeft: spacing.sm }}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={{ fontSize: 13, color: colors.textDim, marginTop: 6, lineHeight: 18 }}>{hint}</Text> : null}
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
    <View style={{ marginTop: spacing.lg, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Text style={{ flex: 1, fontSize: 15.5, color: colors.text, fontWeight: "500" }}>{label}</Text>
        <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: colors.accent, false: colors.border }} />
      </View>
      {hint ? <Text style={{ fontSize: 13, color: colors.textDim, marginTop: 6, lineHeight: 18 }}>{hint}</Text> : null}
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
      <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500" }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 6, flexWrap: "wrap" }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: pill, backgroundColor: on ? colors.chipActive : colors.bgCard, borderWidth: 1, borderColor: on ? colors.chipActive : colors.border }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: on ? colors.chipActiveText : colors.textMuted }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={{ fontSize: 13, color: colors.textDim, marginTop: 6, lineHeight: 18 }}>{hint}</Text> : null}
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
        backgroundColor: primary ? colors.accent : colors.bgCard,
        borderRadius: button.borderRadius,
        borderWidth: 1,
        // A secondary button is a white pill with a hairline, not an outlined transparent one:
        // admin/ui.tsx draws it on the card colour so it reads as a control rather than a border.
        borderColor: primary ? colors.accent : colors.border,
        paddingVertical: spacing.md,
        alignItems: "center",
        opacity: off ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.medium,
          fontSize: button.fontSize,
          fontWeight: button.fontWeight,
          color: primary ? colors.accentText : colors.textMuted,
        }}
      >
        {busy ? (busyLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}

/** Anything the screen needs to say back: a save that failed, a rule that applies, a step still to do. */
export function Notice({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" }) {
  return (
    <View style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.md, marginTop: spacing.lg }}>
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
