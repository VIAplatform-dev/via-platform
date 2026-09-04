import { useEffect, useState } from "react";
import {
 ActivityIndicator,
 LayoutChangeEvent,
 Pressable,
 Text,
 TextInput,
 useWindowDimensions,
 View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { Redirect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import Animated, {
 Easing,
 useAnimatedStyle,
 useReducedMotion,
 useSharedValue,
 withRepeat,
 withTiming,
 type SharedValue,
} from "react-native-reanimated";
import { API_BASE_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, fonts, spacing } from "../../lib/theme";

// Sign in, over a wall of pieces that drifts.
//
// The email path deliberately does NOT wait for the person to come back. Requesting the link ends
// the interaction here; tapping the link opens auth/callback, which finishes the sign-in.
//
// WHY THE COLLAGE IS BUNDLED AND NOT FETCHED. This screen renders before anybody has a token, and
// every catalogue route — /api/public/* included — answers 403 without one (see the note at the top
// of lib/api.ts: for the app, a valid login IS the approval). These seven ship with the app, so the
// wall is there the instant it opens rather than after a cold-start round trip.

const GAP = 6;
const DRIFT_MS = 48_000; // one full cycle. Linear, never eased — an eased loop pulses.
const TILES_PER_COLUMN = 9; // enough to fill a column taller than the screen

// The photographs stop this many points above the wordmark. Measured against the wordmark's real
// laid-out position rather than a fraction of screen height, so it holds on any device: the type
// block is a fixed height in points, so its distance from the top changes with every screen size.
const CLEARANCE = 5;

// How much of the wall above that line is spent fading. 0.42 puts the first hint of cream a little
// under halfway up the picture area — high enough to be gradual, low enough to keep the top sharp.
const FADE_SPAN = 0.42;

// THE TWO COLUMNS SHARE NO PHOTOGRAPHS. This is the only arrangement that guarantees the same
// piece never appears on both sides at once. An offset into one shared list cannot do it: the
// columns drift in OPPOSITE directions, so their alignment changes continuously and every
// photograph eventually meets itself — an offset only decides when, not whether.
const LEFT_SET = [
 require("../../assets/collage/01.jpg"), // Fendi gold/green sandals, orchids — pale
 require("../../assets/collage/04.jpg"), // silk scarf stack — colour
 require("../../assets/collage/05.jpg"), // Dior / LV / Prada on the sink — busy
 require("../../assets/collage/07.jpg"), // Gucci bag and wine, convertible — warm
];
const RIGHT_SET = [
 require("../../assets/collage/02.jpg"), // Manolo / Jimmy Choo flat-lay — pale
 require("../../assets/collage/03.jpg"), // pink Fendi baguette, held — colour
 require("../../assets/collage/06.jpg"), // purple houndstooth suit — studio
];

// The cost of disjoint sets is repetition WITHIN a column: four on the left recur every fourth
// tile, three on the right every third. Twelve photographs (six each) would remove that too.
const fill = (set: number[]) =>
 Array.from({ length: TILES_PER_COLUMN * 2 }, (_, i) => set[i % set.length]);

const LEFT_TILES = fill(LEFT_SET);
const RIGHT_TILES = fill(RIGHT_SET);

/** One column, rendered twice over so a −50% translation loops without a seam. */
function Column({
 offset,
 tiles,
 tileHeight,
}: {
 offset: SharedValue<number>;
 tiles: number[];
 tileHeight: number;
}) {
 const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
 return (
  <Animated.View style={[{ gap: GAP }, style]}>
   {tiles.map((source, i) => (
    <Image
     key={i}
     source={source}
     style={{ height: tileHeight, borderRadius: 2, backgroundColor: colors.bgCard }}
     contentFit="cover"
     transition={220}
     cachePolicy="memory-disk"
    />
   ))}
  </Animated.View>
 );
}

export default function LoginScreen() {
 const { requestMagicLink, user, storeSlug, devMode } = useAuth();
 const isFocused = useIsFocused();
 const { width, height } = useWindowDimensions();
 const reducedMotion = useReducedMotion();

 const [email, setEmail] = useState("");
 const [sent, setSent] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // Where the wall ends and the cream begins. Null until the wordmark has been laid out; the
 // fallback keeps the first frame composed rather than showing a bare wall for one tick.
 const [wallBottom, setWallBottom] = useState<number | null>(null);
 const measureWordmark = (e: LayoutChangeEvent) => {
  // The sheet fills the screen from y=0, so the wordmark's own y IS its distance from the top.
  const next = Math.max(0, e.nativeEvent.layout.y - CLEARANCE);
  setWallBottom((prev) => (prev === next ? prev : next));
 };
 const wallHeight = wallBottom ?? height * 0.55;

 const columnWidth = (width - spacing.sm * 2 - GAP) / 2;
 const tileHeight = Math.round(columnWidth * 1.25); // 4:5, the ratio ProductCard already uses
 const runHeight = TILES_PER_COLUMN * (tileHeight + GAP);

 // Left drifts down (starts a full copy high, settles at zero); right drifts up. Opposing
 // directions stop either column reading as a scroll the person caused.
 const left = useSharedValue(-runHeight);
 const right = useSharedValue(0);

 useEffect(() => {
  if (reducedMotion) {
   left.value = -runHeight / 2;
   right.value = 0;
   return;
  }
  const linear = { duration: DRIFT_MS, easing: Easing.linear };
  left.value = withRepeat(withTiming(0, linear), -1, false);
  right.value = withRepeat(withTiming(-runHeight, linear), -1, false);
 }, [reducedMotion, runHeight, left, right]);

 // The dev API signs a token immediately instead of mailing; if that happened we're already in.
 //
 // <Redirect>, NOT router.replace(). Calling replace() here ran during render, so React re-rendered,
 // which called it again — an infinite navigation loop that shows up as the screen thrashing, and as
 // "Cannot update a component while rendering a different component" in the console.
 //
 // A store owner goes to her own tabs; `storeSlug` is null for shoppers.
 // isFocused matters MORE here than anywhere: this screen is a modal, so it stays mounted after
 // sign-in and would re-fire this redirect on every render — the app blinks between blank and
 // the destination forever.
 if (user && isFocused) return <Redirect href={storeSlug ? "/(seller)" : "/(tabs)"} />;

 async function send() {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) {
   setError("Enter a valid email address.");
   return;
  }
  setBusy(true);
  setError(null);
  try {
   await requestMagicLink(trimmed);
   setSent(true);
  } catch (e) {
   setError(e instanceof Error ? e.message : "Couldn’t send the link. Try again.");
  } finally {
   setBusy(false);
  }
 }

 // Creating a store is a web flow (/store/signup); there is no native equivalent.
 async function openStoreSignup() {
  await WebBrowser.openBrowserAsync(`${API_BASE_URL}/store/signup`, {
   presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  }).catch(() => setError("Couldn’t open store sign-up. Try again."));
 }

 if (sent) {
  return (
   <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center" }}>
    <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>Check your email</Text>
    <Text style={{ marginTop: spacing.md, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
     We sent a link to {email.trim()}. Tap the link from this device to sign in.
    </Text>
    <Pressable onPress={() => { setSent(false); setError(null); }} style={{ marginTop: spacing.xl }}>
     <Text style={{ fontSize: 15, color: colors.text, textDecorationLine: "underline" }}>Back to Sign In</Text>
    </Pressable>
   </View>
  );
 }

 return (
  <View style={{ flex: 1, backgroundColor: colors.bg }}>
   {/* The wall, clipped to end CLEARANCE points above the wordmark. */}
   <View
    pointerEvents="none"
    style={{
     position: "absolute", top: 0, left: 0, right: 0, height: wallHeight,
     flexDirection: "row", gap: GAP, paddingHorizontal: spacing.sm, overflow: "hidden",
    }}
   >
    <View style={{ width: columnWidth, overflow: "hidden" }}>
     <Column offset={left} tiles={LEFT_TILES} tileHeight={tileHeight} />
    </View>
    <View style={{ width: columnWidth, overflow: "hidden" }}>
     <Column offset={right} tiles={RIGHT_TILES} tileHeight={tileHeight} />
    </View>
   </View>

   {/* Exactly as tall as the wall, so it reaches full cream on the wall's last row of pixels —
       the photographs meet the ground rather than stopping at a visible edge. */}
   <LinearGradient
    pointerEvents="none"
    colors={["rgba(255,253,248,0)", "rgba(255,253,248,0.08)", colors.bg]}
    locations={[0, FADE_SPAN, 1]}
    style={{ position: "absolute", top: 0, left: 0, right: 0, height: wallHeight }}
   />

   <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl + spacing.md }}>
    <Text
     onLayout={measureWordmark}
     style={{
      fontFamily: fonts.serif, fontSize: 19, letterSpacing: 6,
      color: colors.text, textAlign: "center", marginBottom: spacing.md,
     }}
    >
     VYA
    </Text>
    <Text
     style={{
      fontFamily: fonts.serif, fontSize: 30, lineHeight: 34,
      color: colors.text, textAlign: "center",
     }}
    >
     Access the world's{"\n"}best vintage.
    </Text>
    <Text
     style={{
      marginTop: spacing.sm, fontSize: 14, lineHeight: 20,
      color: colors.textMuted, textAlign: "center",
     }}
    >
     Discover vintage from expert sellers globally.
    </Text>

    <TextInput
     value={email}
     onChangeText={setEmail}
     placeholder="you@email.com"
     placeholderTextColor={colors.textDim}
     autoCapitalize="none"
     autoCorrect={false}
     keyboardType="email-address"
     textContentType="emailAddress"
     onSubmitEditing={send}
     style={{
      marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: 999,
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md + 2, fontSize: 15,
      color: colors.text, backgroundColor: colors.bgCard, textAlign: "center",
     }}
    />

    {error ? (
     <Text style={{ marginTop: spacing.sm, fontSize: 13, color: "#B3261E", textAlign: "center" }}>{error}</Text>
    ) : null}

    <Pressable
     onPress={send}
     disabled={busy}
     accessibilityRole="button"
     style={{
      marginTop: spacing.sm + 2, backgroundColor: colors.accent, borderRadius: 999,
      paddingVertical: spacing.lg, alignItems: "center", opacity: busy ? 0.6 : 1,
     }}
    >
     {busy
      ? <ActivityIndicator color={colors.accentText} />
      : <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "500" }}>Join as a customer</Text>}
    </Pressable>

    <Pressable
     onPress={openStoreSignup}
     accessibilityRole="button"
     style={{
      marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 999,
      paddingVertical: spacing.lg, alignItems: "center", backgroundColor: colors.bgCard,
     }}
    >
     <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>Get started as a store</Text>
    </Pressable>

    <Text
     style={{
      marginTop: spacing.lg, fontSize: 12, lineHeight: 18,
      color: colors.textDim, textAlign: "center",
     }}
    >
     {devMode
      ? "Development build — signing in automatically. If you're seeing this, check EXPO_PUBLIC_DEV_ADMIN_PASSWORD in mobile/.env.local."
      : "We'll email you a link. No password to remember."}
    </Text>
   </View>
  </View>
 );
}
