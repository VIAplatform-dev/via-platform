import { Linking, Platform, Text, View } from "react-native";
import { colors, spacing, radius } from "../../lib/portal-theme";
import { parseRich, type RichBlock, type Span } from "../../lib/seller/assistant";

// The only face in the app that is not one of the two brand families. Code has to be monospaced to
// be readable as code, and the name differs per platform: "monospace" is not a family iOS knows,
// and an unknown family there is silently ignored rather than substituted.
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

// VYA's replies, rendered.
//
// Claude writes markdown whether or not it was asked to, and a bare <Text> prints the asterisks.
// The grammar is parsed in lib/seller/assistant.ts; this file only maps blocks to views, which is
// why there is nothing here worth testing and nothing there that needs a renderer to test.

function Runs({ spans: runs, size }: { spans: Span[]; size: number }) {
  return (
    <>
      {runs.map((s, i) => (
        <Text
          key={i}
          onPress={s.href ? () => void Linking.openURL(s.href as string) : undefined}
          style={{
            fontSize: s.code ? size - 1 : size,
            color: colors.text,
            fontWeight: s.bold ? "600" : "400",
            fontStyle: s.italic ? "italic" : "normal",
            // A link is the one run that changes colour. Underlined too: colour alone is not a
            // signal on a screen where the ink is already oxblood.
            ...(s.href ? { color: colors.accent, textDecorationLine: "underline" as const } : {}),
            ...(s.code ? { fontFamily: MONO, backgroundColor: colors.bgAlt } : {}),
          }}
        >
          {s.text}
        </Text>
      ))}
    </>
  );
}

export function RichText({ text, size = 15 }: { text: string; size?: number }) {
  const blocks = parseRich(text);
  return (
    <View>
      {blocks.map((b: RichBlock, i) => {
        const first = i === 0;
        if (b.kind === "code") {
          return (
            <View key={i} style={{ marginTop: first ? 0 : spacing.sm, backgroundColor: "#1C1917", borderRadius: radius, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
              {/* No horizontal scroll: a code block inside a chat bubble that scrolls sideways
                  fights the message list for the same gesture. Long lines wrap instead. */}
              <Text style={{ fontFamily: MONO, fontSize: size - 2, lineHeight: (size - 2) * 1.5, color: "#E7E5E4" }}>{b.text}</Text>
            </View>
          );
        }
        if (b.kind === "list") {
          return (
            <View key={i} style={{ marginTop: first ? 0 : spacing.sm, gap: spacing.xs }}>
              {b.items.map((item, j) => (
                <View key={j} style={{ flexDirection: "row", gap: spacing.sm }}>
                  {/* A fixed-width marker column, so wrapped lines hang under the words rather
                      than under the bullet. */}
                  <Text style={{ fontSize: size, lineHeight: size * 1.45, color: colors.textDim, minWidth: b.ordered ? 18 : 10 }}>
                    {b.ordered ? `${j + 1}.` : "•"}
                  </Text>
                  <Text style={{ flex: 1, fontSize: size, lineHeight: size * 1.45, color: colors.text }}>
                    <Runs spans={item} size={size} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={{ marginTop: first ? 0 : spacing.sm, fontSize: size, lineHeight: size * 1.45, color: colors.text }}>
            <Runs spans={b.spans} size={size} />
          </Text>
        );
      })}
    </View>
  );
}
