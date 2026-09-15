import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors as portalColors, spacing, radius } from "../../lib/portal-theme";

// A dropdown: one row that says what is chosen, and a sheet that changes it.
//
// WHAT THIS REPLACES. Every list of choices in the seller app was drawn as a wall of chips. All
// seven packaging presets, all of a store's collections, every consignor. Laid out inline and
// wrapped over three or four lines. That shape is right for two or three options and wrong for
// seven: it pushes everything below it off the screen, it gives a rarely-changed setting the same
// visual weight as the price, and the thing you actually want to know ("which one is it now?")
// takes a scan of the whole wall to answer, because it is a colour difference rather than a
// sentence. A row that says "Ships in. Padded mailer" answers it without being opened.
//
// It is a Modal rather than an inline expansion for the reason the consignors screen gives for NOT
// using one: a sheet over a list hides the list. Here that is the point. A picker replaces its
// list rather than adding to it, and a full sheet gives thirty categories room to be grouped.
//
// THE PALETTE IS A PROP. The seller portal is getvya.ai burgundy-on-cream (lib/portal-theme) and
// Market Mode is the shopper app's palette (lib/theme). The two modules export the same names, so
// a screen passes its own and this control belongs to whichever app it is standing in.

export type SelectOption = { key: string; label: string; hint?: string };
export type SelectGroup = { label?: string; options: SelectOption[] };

/** The colours this control needs. Satisfied by lib/theme and lib/portal-theme alike. */
export type SelectPalette = {
  bg: string; bgAlt: string; text: string; textMuted: string; textDim: string;
  border: string; accent: string; accentText: string; chip: string;
};

function Sheet({
  visible, onClose, title, palette, children, footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  palette: SelectPalette;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.border }}>
          <Pressable onPress={onClose} hitSlop={10}><Feather name="x" size={22} color={palette.text} /></Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: palette.text, marginRight: 22 }}>{title}</Text>
        </View>
        {/* "handled" for the same reason SellerScreen sets it: with a keyboard up. The New
            collection box below: the first tap would otherwise be spent dismissing it. */}
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? (
          <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, borderTopWidth: 1, borderTopColor: palette.border }}>
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** One option, as a row. A tick rather than a filled ground: this is a list, not a chip. */
function OptionRow({
  option, on, onPress, palette,
}: {
  option: SelectOption;
  on: boolean;
  onPress: () => void;
  palette: SelectPalette;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: on ? "600" : "400", color: palette.text }}>{option.label}</Text>
        {option.hint ? <Text style={{ fontSize: 12, color: palette.textDim, marginTop: 2 }}>{option.hint}</Text> : null}
      </View>
      {on ? <Feather name="check" size={18} color={palette.accent} /> : null}
    </Pressable>
  );
}

/** The closed row: the label, what is chosen, and a chevron saying it opens. */
function Row({
  label, value, placeholder, labelWidth, palette, onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  labelWidth: number;
  palette: SelectPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: spacing.md }}
    >
      <Text style={{ width: labelWidth, fontSize: 14, color: palette.textMuted }}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: 15, fontWeight: "600", color: value ? palette.text : palette.textDim, paddingVertical: spacing.sm }}
      >
        {value || placeholder}
      </Text>
      <Feather name="chevron-down" size={18} color={palette.textDim} />
    </Pressable>
  );
}

/**
 * Pick one. Choosing closes the sheet. A single choice needs no confirmation.
 *
 * `action` is an escape hatch for a list that can be empty or incomplete: "Add someone…" under the
 * consignors, which closes the sheet and goes to the screen that can add one.
 */
export function SelectRow({
  label, value, options, groups, onChange, placeholder = "Choose", title, labelWidth = 92, hint, palette = portalColors, action, autoOpen, onAutoOpened,
}: {
  label: string;
  value: string | null;
  options?: SelectOption[];
  groups?: SelectGroup[];
  onChange: (key: string) => void;
  placeholder?: string;
  title?: string;
  labelWidth?: number;
  hint?: string;
  palette?: SelectPalette;
  action?: { label: string; onPress: () => void };
  /** Open it without a tap. The screen is ASKING, not offering (Market Mode's category). */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const all: SelectGroup[] = groups ?? [{ options: options ?? [] }];
  const chosen = all.flatMap((g) => g.options).find((o) => o.key === value);

  // An ask, rather than an offer: the parent flips autoOpen and the sheet is already up. In an
  // effect, not in render. Telling the parent it has happened is a setState on someone else.
  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpened?.();
    // Only the flag: re-running because the parent passed a new callback would re-open a sheet
    // she has just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <>
      <Row label={label} value={chosen?.label ?? ""} placeholder={placeholder} labelWidth={labelWidth} palette={palette} onPress={() => setOpen(true)} />
      {hint ? <Text style={{ fontSize: 12, color: palette.textDim, marginTop: spacing.xs, lineHeight: 17 }}>{hint}</Text> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? label} palette={palette}>
        {all.map((g, i) => (
          <View key={g.label ?? `group-${i}`} style={{ marginTop: i === 0 ? 0 : spacing.xl }}>
            {g.label ? (
              <Text style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: palette.textDim, marginBottom: spacing.sm }}>{g.label}</Text>
            ) : null}
            {g.options.map((o) => (
              <OptionRow
                key={o.key}
                option={o}
                on={o.key === value}
                palette={palette}
                onPress={() => { onChange(o.key); setOpen(false); }}
              />
            ))}
          </View>
        ))}
        {action ? (
          <Pressable onPress={() => { setOpen(false); action.onPress(); }} style={{ paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: palette.accent }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Sheet>
    </>
  );
}

/**
 * Pick any number. The sheet stays open while she picks and closes on Done, because choosing three
 * collections is one decision made three times, not three decisions.
 *
 * `onCreate` puts a "new one" box at the bottom, for collections, where the route takes titles and
 * creates whatever doesn't exist yet, so picking and creating are the same act.
 */
export function MultiSelectRow({
  label, values, options, onChange, placeholder = "None", title, labelWidth = 92, palette = portalColors, onCreate, createPlaceholder,
}: {
  label: string;
  values: string[];
  options: SelectOption[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  title?: string;
  labelWidth?: number;
  palette?: SelectPalette;
  onCreate?: (text: string) => void;
  createPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const labelFor = (k: string) => options.find((o) => o.key === k)?.label ?? k;
  // What is chosen, in the order she chose it, on one line. The row has to answer "which ones?"
  // without being opened, and a count ("3 selected") answers a different, less useful question.
  const summary = values.map(labelFor).join(", ");

  const create = () => {
    const t = draft.trim();
    if (!t || !onCreate) return;
    onCreate(t);
    setDraft("");
  };

  return (
    <>
      <Row label={label} value={summary} placeholder={placeholder} labelWidth={labelWidth} palette={palette} onPress={() => setOpen(true)} />
      <Sheet
        visible={open}
        onClose={() => { setOpen(false); setDraft(""); }}
        title={title ?? label}
        palette={palette}
        footer={
          <Pressable
            onPress={() => { setOpen(false); setDraft(""); }}
            style={{ backgroundColor: palette.accent, borderRadius: radius, paddingVertical: spacing.lg, alignItems: "center" }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: palette.accentText }}>Done</Text>
          </Pressable>
        }
      >
        {options.length === 0 && !onCreate ? (
          <Text style={{ fontSize: 14, color: palette.textMuted, paddingVertical: spacing.xl, textAlign: "center" }}>Nothing to choose from yet.</Text>
        ) : null}
        {options.map((o) => (
          <OptionRow
            key={o.key}
            option={o}
            on={values.includes(o.key)}
            palette={palette}
            onPress={() => onChange(values.includes(o.key) ? values.filter((v) => v !== o.key) : [...values, o.key])}
          />
        ))}
        {onCreate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={createPlaceholder ?? "New one"}
              placeholderTextColor={palette.textDim}
              autoCapitalize="words"
              onSubmitEditing={create}
              style={{ flex: 1, fontSize: 15, color: palette.text, borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: spacing.sm }}
            />
            <Pressable hitSlop={8} disabled={!draft.trim()} onPress={create}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: palette.accent, opacity: draft.trim() ? 1 : 0.4 }}>Add</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
