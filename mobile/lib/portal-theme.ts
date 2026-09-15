// The seller workspace's visual language, taken from the workspace itself.
//
// THIS FILE USED TO BE READ OFF THE WRONG PAGE. The values were lifted from
// app/infrastructure/infrastructure.css, which is getvya.ai the MARKETING SITE: serif throughout,
// wine accent, corners at 3px, uppercase labels letter-spaced at .2em. That is a real identity and
// it is not the one a seller works in. The workspace she actually uses, /admin, is
// app/infrastructure/admin/layout.tsx and admin/ui.tsx: Hanken Grotesk, a GREEN accent, white cards
// at rounded-2xl on #f7f6f3, and buttons that are fully round. The app looked like a different
// product from the one on her laptop, which is exactly what it had been drawn from.
//
// Everything below is read off those two files. Where a value here differs from them, that is a
// bug rather than a preference.
//
// The exported NAMES still match ./theme.ts (the shopper side) key for key, so a seller screen
// swaps one import path and needs no other edit, and can never half-adopt an identity.

import { Platform } from "react-native";

/** The platform's monospace. The workspace's eyebrows are `font-mono`, and "monospace" is not a
 *  family iOS knows: an unrecognised family there is silently ignored rather than substituted. */
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

export const colors = {
  bg: "#F7F6F3", //        admin/layout.tsx: bg-[#f7f6f3]
  bgCard: "#FFFFFF",
  /** The ground behind grouped rows and inset blocks. Tailwind stone-100. */
  bgAlt: "#F5F5F4",

  // The stone ramp the workspace writes in. Not a cream ramp: the workspace ground is neutral, and
  // warm-grey text on it is what keeps a forty-row table readable one-handed.
  text: "#1C1917", //      stone-900
  /** Secondary lines: a store's location, a row's supporting sentence. */
  textMuted: "#57534E", // stone-600
  /** Placeholder copy, inactive icons, the dimmest tier. */
  textDim: "#A8A29E", //   stone-400
  border: "#E7E5E4", //    stone-200
  /** A hairline INSIDE a card, between its rows. Lighter than the card's own edge. */
  borderSoft: "#F5F5F4", //stone-100

  // THE ACCENT IS GREEN. admin/layout.tsx sets --accent #0e9f76 and every shared component reads
  // it. The wine below is not the accent; see `wine`.
  accent: "#0E9F76",
  accentText: "#FFFFFF",
  /** Pressed state for an accent button. --accent-hover. */
  accentDeep: "#0B8A66",
  /** The tint behind a live pill, or the selected row in the drawer. --accent-soft. */
  accentSoft: "#EAFAF3",
  /** Accent text ON accentSoft, and the colour of a positive number. --accent-ink. */
  accentInk: "#0B7A5C",
  /** The lit dot on a "live" pill. --accent-bright. */
  accentBright: "#2FD39B",

  /**
   * ONE THING WEARS WINE, here and in the workspace: selling in person.
   *
   * admin/layout.tsx paints the status dot #5D0F17 when Market Mode is on and the accent green
   * otherwise. Spending it anywhere else is what made the whole app read as the marketing site.
   */
  wine: "#5D0F17",

  /** Positive movement only: the ↑ delta, a piece that is free, "Label sent to you". */
  positive: "#0B7A5C",
  /** Something is late or failing. rose-500 on rose-50, the workspace's `down` pill. */
  negative: "#F43F5E",
  negativeSoft: "#FFF1F2",
  /** Worth a look, but nothing is wrong: reserved, booked, AI unsure. amber-600 on amber-50. */
  warning: "#D97706",
  warningSoft: "#FFFBEB",

  /** Ground behind an unselected chip in a segmented control. */
  chip: "#F5F5F4",
  /** Ground behind a SELECTED one. Stone-900, as the workspace's TagRow draws it: the choice is
   *  near-black, and green stays reserved for state rather than selection. */
  chipActive: "#1C1917",
  chipActiveText: "#FFFFFF",

  overlayChip: "rgba(28, 25, 23, 0.22)",

  // Kept so a screen still written against the old palette compiles while it is converted. Both
  // now point into the stone ramp rather than the cream one.
  mauve: "#A8A29E",
  taupe: "#D6D3D1",
  taupeDeep: "#57534E",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * NOTHING SHE READS IS A SERIF.
 *
 * The workspace sets its UI in Hanken Grotesk and reaches for Newsreader once per page, on the
 * title. The app had it the other way round: serif titles AND serif product names AND Cormorant
 * labels tracked at .2em, which is handsome at 40px on a marketing page and hard work at 13px in
 * a shop.
 *
 * `label` is the small uppercase eyebrow, and in the workspace it is MONOSPACE at 10px. Left
 * undefined so React Native falls back to the platform mono, which costs no bundled font.
 */
export const fonts = {
  /** Page titles only. --font-display on the web. */
  serif: "Newsreader_500Medium",
  /** The small uppercase eyebrow above a section. Platform monospace. */
  label: MONO,
  /** Everything else: rows, prices, buttons, body. */
  sans: "HankenGrotesk_400Regular" as string | undefined,
  medium: "HankenGrotesk_500Medium" as string | undefined,
  semibold: "HankenGrotesk_600SemiBold" as string | undefined,
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

/**
 * The uppercase label above a section.
 *
 * admin/ui.tsx: `font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400`.
 * It was Cormorant at 13px, .2em tracking, in oxblood: three separate things louder than the
 * workspace's, on a label whose entire job is to be quiet.
 */
export const eyebrow = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: "600" as const,
  letterSpacing: 1.6,
  textTransform: "uppercase" as const,
  color: colors.textDim,
};

/** The workspace's buttons: fully round, 13px, weight 500, sentence case. Not uppercase and not
 *  letter-spaced. ADMIN_BTN_BASE in admin/ui.tsx. */
export const button = {
  fontSize: 13,
  fontWeight: "500" as const,
  borderRadius: 999,
};

/**
 * THREE RADII, because the workspace uses three and one number cannot stand in for them.
 *
 * `radius` is the CARD: rounded-2xl, 16. `pill` is every button, chip and status badge:
 * rounded-full. `radiusSm` is a thumbnail or an inset tile: rounded-lg, 8.
 *
 * It used to be a single `radius: 3`, the marketing site's `--rad`, applied to cards, buttons and
 * photographs alike. Almost nothing in the workspace is 3px.
 */
export const radius = 16;
export const pill = 999;
export const radiusSm = 8;

/** The workspace's card: white, a hairline edge, and a shadow that lifts it barely off the ground.
 *  TechCard in admin/ui.tsx carries two layers; React Native takes the outer one. */
export const cardShadow = {
  shadowColor: "#101828",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
};
