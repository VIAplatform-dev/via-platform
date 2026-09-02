// VYA's visual language, read off the shipped app's screenshots.
//
// The palette is a warm cream ground with a single deep burgundy carrying every piece of ink —
// headings, icons, prices, the wordmark. There is no second accent. Hierarchy comes from opacity of
// that one colour, which is why the muted tones below are alpha ramps rather than separate hues.

export const colors = {
  bg: "#FDFBF6",
  bgCard: "#FFFFFF",
  /** Slightly warmer ground used behind list screens (Account, Settings). */
  bgAlt: "#F5F2EC",
  text: "#5D0F17",
  /** Section eyebrows, store names, secondary lines. */
  textMuted: "rgba(93, 15, 23, 0.55)",
  /** Inactive tab icons, dividers' text, placeholder copy. */
  textDim: "rgba(93, 15, 23, 0.35)",
  border: "rgba(93, 15, 23, 0.10)",
  accent: "#5D0F17",
  accentText: "#FDFBF6",
  /** The puck behind a heart sitting on a photograph. Grey, not white: most vintage is shot on a
   *  white sweep, and a white chip on a white background is an invisible button. */
  overlayChip: "rgba(120, 100, 100, 0.22)",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const fonts = {
  // Headings, the wordmark and screen titles are all serif. Product titles are NOT — they are the
  // system sans at semibold, which is what keeps a dense grid legible at 15px.
  serif: "Georgia",
  sans: undefined as string | undefined,
};

/** The uppercase, letter-spaced label above every section heading ("JUST IN", "SHOP BY"). */
export const eyebrow = {
  fontSize: 12,
  letterSpacing: 1.6,
  textTransform: "uppercase" as const,
  color: colors.textMuted,
};
