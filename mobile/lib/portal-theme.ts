// The seller portal's visual language, taken from getvya.ai.
//
// Two products, two identities. The shopper side of this app is vyaplatform.com: cream ground,
// one deep burgundy carrying every piece of ink (see ./theme.ts). The seller side is getvya.ai,
// which is warmer, browner and quieter. Ink is a soft near-black, oxblood is reserved for the
// things you act on, and the whole thing sits on paper rather than cream.
//
// The values below are lifted verbatim from app/infrastructure/infrastructure.css, the getvya.ai
// stylesheet, so the site and the portal cannot drift apart by eye. Its custom-property name is
// kept in a comment beside each one.
//
// The exported NAMES match ./theme.ts exactly. Colors, spacing, fonts, eyebrow, with the same
// keys. That is deliberate: a seller screen swaps one import path and needs no other edit, and a
// screen can never half-adopt the portal identity.

export const colors = {
  bg: "#FBF8F2", //        --paper
  bgCard: "#FFFFFF", //    --card
  /** The warmer ground behind grouped rows and tiles. */
  bgAlt: "#F5EFE4", //     --cream
  text: "#2C241D", //      --ink
  /** Secondary lines: a store's location, a row's supporting sentence. */
  textMuted: "#574D43", // --ink-soft
  /** Placeholder copy, inactive icons, the dimmest tier. */
  textDim: "#8D8478", //   --mute
  border: "#E8E0D1", //    --line
  accent: "#5D1620", //    --oxblood
  accentText: "#F7EFE6",
  /** Pressed state for an oxblood button. */
  accentDeep: "#46101A", // --oxblood-deep
  /** getvya.ai's third colour. Eyebrows and the quietest metadata only. */
  mauve: "#9B7D83", //     --mauve
  taupe: "#CDC1B0", //     --taupe
  taupeDeep: "#6F6153", // --taupe-deep
  overlayChip: "rgba(44, 36, 29, 0.22)",

  /** Positive movement only: the ↑ delta, the live dot, "Label sent to you". Never decoration. */
  positive: "#3A6B45", //  getvya.ai's .pos
  /** Ground behind an unselected filter chip and the tiles on Home. */
  chip: "#F5EFE4", //      --cream
  /** Ground behind a SELECTED filter chip. Oxblood, not near-black: on getvya.ai the thing you
   *  have chosen is the thing wearing the brand colour. */
  chipActive: "#5D1620",
  chipActiveText: "#F7EFE6",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// getvya.ai runs three faces: Playfair Display for headings, Cormorant for the uppercase
// letter-spaced labels on every eyebrow and button, and a serif body.
//
// The body face is where the portal departs from the site, on purpose. getvya.ai is a marketing
// page read once at leisure; this is a dashboard read at a glance, in a shop, one-handed. A serif
// body at 13px in a dense table is the wrong tool, and the existing shopper theme already makes
// this call for the same reason. So the brand faces dress the CHROME. Titles, eyebrows, buttons,
// section headings, and the numbers and rows a seller scans stay in the system sans.
// THE SAME TWO FACES AS getvya.ai. The workspace on a laptop is set in Newsreader and Hanken
// Grotesk; the app was in Playfair Display and Cormorant, so the same product read as two products
// depending on which screen a seller was looking at. One pair, both places.
export const fonts = {
  /** Screen titles, section headings, the wordmark. --font-display on the web. */
  serif: "Newsreader_500Medium",
  /** Uppercase, letter-spaced labels: eyebrows, buttons, tab bar. */
  label: "HankenGrotesk_600SemiBold",
  /** Dense data: prices, counts, product titles, table rows. --font-sans on the web. */
  sans: "HankenGrotesk_400Regular" as string | undefined,
};

/** Every font family the portal needs, for useFonts() at the root.
 *  require() is how Expo's asset pipeline resolves a bundled font; an import would not be
 *  rewritten to a runtime asset reference. */
/* eslint-disable @typescript-eslint/no-require-imports */
export const PORTAL_FONTS = {
  Newsreader_500Medium: require("@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf"),
  Newsreader_600SemiBold: require("@expo-google-fonts/newsreader/600SemiBold/Newsreader_600SemiBold.ttf"),
  HankenGrotesk_400Regular: require("@expo-google-fonts/hanken-grotesk/400Regular/HankenGrotesk_400Regular.ttf"),
  HankenGrotesk_500Medium: require("@expo-google-fonts/hanken-grotesk/500Medium/HankenGrotesk_500Medium.ttf"),
  HankenGrotesk_600SemiBold: require("@expo-google-fonts/hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The uppercase, letter-spaced label above every section heading.
 *  getvya.ai sets these in Cormorant 600 at .2em, in oxblood, not in the body grey. */
export const eyebrow = {
  fontFamily: fonts.label,
  fontSize: 13,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
  color: colors.accent,
};

/** getvya.ai's buttons: Cormorant 600, .18em tracking, uppercase, and a 2px radius. Corners just
 *  soft enough to read as deliberate rather than rounded. */
export const button = {
  fontFamily: fonts.label,
  fontSize: 14,
  letterSpacing: 2.5,
  textTransform: "uppercase" as const,
  borderRadius: 2,
};

/** --rad. The site rounds almost nothing; cards are 3px, not 12px. */
export const radius = 3;
