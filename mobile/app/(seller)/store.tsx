import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";

// The Store tab — option A: her own storefront, running inside the app.
//
// The alternative was a VYA-styled profile (avatar, counts, filter chips). This is the one chosen,
// and the reason holds up: Blummier spent money making her site look like Blummier, and half the
// point of joining a platform at this end of the market is to STOP looking like everyone else on
// it. Nothing in the page below is VYA's design — VYA is the thin bar above it and the tab bar
// beneath it, and that is the whole point.
//
// It also reuses what already exists. The captured storefront is live on {slug}.vyasites.com, so
// this screen is a window onto the thing buyers already get rather than a second implementation
// that has to be kept in step with it.
//
// The ☰ stays, because the settings drawer has to be reachable from somewhere and this tab is
// where it lives — the storefront itself has no chrome of ours to hang it on.

type Me = { storeName: string; website: string };

export default function StoreScreen() {
  const { storeSlug } = useAuth();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<Me>("/api/store/me"), enabled: !!storeSlug });

  // Her own domain when she has one, the hosted storefront otherwise — the same address the Share
  // button on Home hands out, so what she checks here is exactly what a buyer opens.
  const host = me.data?.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") || `${storeSlug}.vyasites.com`;
  const url = `https://${host}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* The thin VYA bar. Back, the domain she is looking at, and the way into settings. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <Pressable hitSlop={10} onPress={() => webRef.current?.goBack()}>
          <Feather name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 14, color: colors.text }} numberOfLines={1}>
          {host}
        </Text>
        <Pressable hitSlop={10} onPress={() => router.push("/(seller)/settings")}>
          <Feather name="menu" size={20} color={colors.text} />
        </Pressable>
      </View>

      {failed ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <Text style={{ fontSize: 15, color: colors.text, textAlign: "center" }}>Couldn&apos;t reach {host}.</Text>
          <Pressable
            onPress={() => { setFailed(false); setLoading(true); webRef.current?.reload(); }}
            style={{ marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md }}
          >
            <Text style={{ color: colors.accentText, fontWeight: "600" }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: colors.bg }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
            // Her storefront is a normal site — let it behave like one.
            allowsBackForwardNavigationGestures
            decelerationRate="normal"
          />
          {loading ? (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
              <ActivityIndicator color={colors.textDim} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
