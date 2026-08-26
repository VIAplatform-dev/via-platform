import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import CookieManager from "@react-native-cookies/cookies";
import { colors, spacing } from "../lib/theme";

// ───────────────────────────────────────────────────────────────────────────
// Depop connect — DIAGNOSTIC SPIKE, not the finished flow.
//
// This exists to answer the two questions that block everything else:
//   Q1  What credential does a completed Depop login actually produce?
//   Q2  How long does it last?
//
// It logs into Depop ON THE DEVICE inside a WebView — the seller's real phone, real IP — so the
// login looks genuine and never trips the SMS gate that the desktop-web attempt hit. After login,
// it reads Depop's cookie jar natively (CookieManager, which can see httpOnly session cookies that
// injected `document.cookie` cannot) and shows each cookie's NAME, VALUE LENGTH and EXPIRY on
// screen. It deliberately does NOT send anything to VYA yet, and never shows a full value — this is
// reconnaissance, and it needs no VYA login to run.
//
// Once we can see the real session here, we'll know: whether it's one cookie or a set, whether
// there's a long-lived refresh cookie, and how many days a seller gets before reconnecting. THAT
// is what tells us how to build the poster and the sold-sync correctly, instead of guessing.
//
// PREREQS (this file won't compile/run until these are in place):
//   npx expo install react-native-webview @react-native-cookies/cookies
//   @react-native-cookies/cookies needs a native build (not Expo Go):  npx expo run:ios
// ───────────────────────────────────────────────────────────────────────────

const DEPOP_LOGIN = "https://www.depop.com/login/";
const DEPOP_ORIGIN = "https://www.depop.com";

// Shape only — never the value. Enough to recognise a JWT vs an opaque session id.
type CookieShape = { name: string; len: number; looksLike: string; expires: string | null };

function classify(v: string): string {
  if (/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(v)) return "JWT";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return "UUID";
  if (v.length >= 20) return "opaque token";
  return "short";
}

export default function ConnectDepop() {
  const [phase, setPhase] = useState<"login" | "reading" | "done">("login");
  const [cookies, setCookies] = useState<CookieShape[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Watch the WebView's navigation: once we're logged in, Depop leaves /login and lands on the
  // app/home. That transition is our cue to read the jar. The /mfa path means the SMS gate fired —
  // surface it rather than silently waiting, so we learn whether on-device really avoids it.
  async function onNav(nav: WebViewNavigation) {
    if (nav.loading) return;
    const url = nav.url || "";
    if (url.includes("/login/mfa")) {
      setError("Depop asked for an SMS code even on-device. Enter it in the page above — if this keeps happening, on-device isn't clearing MFA and that's an important finding.");
      return;
    }
    const loggedIn = url.startsWith(DEPOP_ORIGIN) && !url.includes("/login");
    if (!loggedIn || phase !== "login") return;

    setError(null);
    setPhase("reading");
    try {
      // useWebKit:true reads the WKWebView jar on iOS — the one the login actually populated.
      const jar = await CookieManager.get(DEPOP_ORIGIN, true);
      const shapes: CookieShape[] = Object.entries(jar).map(([name, c]) => {
        const value = (c as { value?: string }).value ?? "";
        const expires = (c as { expires?: string }).expires ?? null;
        return { name, len: value.length, looksLike: classify(value), expires };
      });
      shapes.sort((a, b) => b.len - a.len);
      setCookies(shapes);
      setPhase("done");
    } catch (e) {
      setError(`Couldn't read the cookie jar: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("done");
    }
  }

  if (phase === "done") {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
        <Text style={styles.h1}>What Depop gave us</Text>
        <Text style={styles.note}>
          Cookie names, value lengths and expiries — no values. This is the answer to &ldquo;what is
          the session and how long does it last.&rdquo; Screenshot it and hand it back.
        </Text>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {cookies.length === 0 ? (
          <Text style={styles.note}>No cookies found for depop.com — login may not have completed.</Text>
        ) : (
          cookies.map((c) => (
            <View key={c.name} style={styles.row}>
              <Text style={styles.cName}>{c.name}</Text>
              <Text style={styles.cMeta}>
                {c.len} chars · {c.looksLike}
                {c.expires ? ` · expires ${c.expires.slice(0, 10)}` : " · session cookie (no expiry)"}
              </Text>
            </View>
          ))
        )}

        <Pressable style={styles.btn} onPress={() => { setCookies([]); setPhase("login"); setError(null); }}>
          <Text style={styles.btnText}>Start over</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Log into Depop below, on this phone. When you land back on Depop&rsquo;s home, we&rsquo;ll
          read what the login produced.
        </Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </View>
      {phase === "reading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.note}>Reading the session…</Text>
        </View>
      ) : (
        <WebView
          source={{ uri: DEPOP_LOGIN }}
          onNavigationStateChange={onNav}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          style={styles.web}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  banner: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  bannerText: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  pad: { padding: spacing.xl, gap: spacing.md },
  h1: { fontFamily: "Georgia", fontSize: 26, color: colors.text },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  err: { color: "#A32637", fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  row: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  cName: { fontFamily: "Courier", fontSize: 14, color: colors.text, fontWeight: "600" },
  cMeta: { fontFamily: "Courier", fontSize: 12, color: colors.textMuted, marginTop: 2 },
  btn: { marginTop: spacing.xl, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: 8, alignItems: "center" },
  btnText: { color: colors.accentText, fontSize: 14, fontWeight: "600" },
});
