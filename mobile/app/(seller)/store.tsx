import { useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts, radius } from "../../lib/portal-theme";
import { formatMoney } from "../../lib/seller/home";
import { filterItems } from "../../lib/seller/inventory";
import { storefrontAddress, describeReach, describeServeMode, shopLine, NO_ADDRESS, type DomainState, type StorefrontState } from "../../lib/seller/storefront";
import { imageUrl, IMG } from "../../lib/imageUrl";

// The Store tab — her storefront, running inside the app.
//
// HER SITE, NOT OUR IDEA OF IT. Whatever she has is what shows here: the imported copy of the shop
// she arrived with, or the storefront she built from sections. Both are served from the same one
// address, because the proxy decides between them (a capture goes to /site/{slug}, a built
// storefront to /s/{handle}) — so this screen needs the address and nothing else. Nothing below is
// VYA's design. VYA is the thin bar above it and the tab bar beneath it, and that is the point:
// half of why a shop joins a platform at this end of the market is to stop looking like everyone
// else on it.
//
// THE ADDRESS WAS THE BUG. It used to come from `me.website` — which is not her storefront. That
// field is the shop's OWN EXTERNAL SITE, the Shopify or Squarespace address VYA syncs its catalogue
// from. So the Store tab opened blummier.com, situationsvintage.com, and on the admin account the
// VYA marketplace homepage. Her actual storefront was never what this tab showed.
//
// It now comes from /api/store/storefront's `publicOrigin`, computed by the same helper the proxy
// routes on (storePublicOrigin), with a verified custom domain taking precedence. See
// lib/seller/storefront.ts for why the app must not build that address itself.
//
// AND WHEN THERE IS NOTHING THERE. A store with no capture and no storefront switched on has an
// address that answers 404 — she saw Next.js's black-on-white "404 This page could not be found"
// sitting inside her own app. That is said in our words now, and rather than leaving her on a dead
// screen the tab falls back to what IS in the window: her live pieces, drawn here, each one opening
// its editor. It is not a storefront and does not pretend to be one — it is the honest remainder.
//
// The ☰ stays, because the settings drawer has to be reachable from somewhere and this tab is where
// it lives — her storefront has no chrome of ours to hang it on.

type Me = { storeName?: string; location?: string | null; logo?: string | null; logoBg?: string | null; storeFollowers?: number };
type Item = { id: string; title: string; priceCents: number; currency: string; images: string[]; status: string };

export default function StoreScreen() {
  const { storeSlug } = useAuth();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  // What the address said, as the WebView found out: undefined until it answers, 0 when it could not
  // be reached at all, otherwise the HTTP status. No extra request — the load IS the check.
  const [status, setStatus] = useState<number | undefined>(undefined);

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<Me>("/api/store/me"), enabled: !!storeSlug });
  // The address, and which storefront is behind it. Both from the server.
  const sf = useQuery({
    queryKey: ["store", "storefront"],
    queryFn: () => apiGet<StorefrontState>("/api/store/storefront").catch(() => null),
    enabled: !!storeSlug,
  });
  // Her own domain when she has one that resolves. A store with none answers 404 here, which is the
  // ordinary case rather than a failure — hence the catch.
  const domain = useQuery({
    queryKey: ["store", "domain"],
    queryFn: () => apiGet<DomainState>("/api/store/domain").catch(() => null),
    enabled: !!storeSlug,
  });
  const address = storefrontAddress(sf.data, domain.data);
  const reached = describeReach(status, domain.data);
  const kind = describeServeMode(sf.data);
  // A status we have and that is not a success means the page she asked for is not there. Anything
  // still in flight is not a failure yet.
  const broken = status !== undefined && (status === 0 || status >= 400);

  // ONLY WHEN THE FALLBACK IS ACTUALLY NEEDED.
  //
  // This fetched the whole inventory on every visit to the tab, to have a grid ready in case the
  // storefront failed to load. For a shop with real stock that is 4.3 MB of JSON downloaded and
  // parsed on a phone — measured, not guessed — to render something usually never shown. The
  // storefront draws her pieces itself; this list is the remainder for when it can't.
  const needFallback = !address || broken;
  const items = useQuery({
    queryKey: ["store", "items", "list"],
    queryFn: () => apiGet<{ items: Item[] }>("/api/store/items?view=list"),
    enabled: !!storeSlug && needFallback,
  });

  const retry = () => { setStatus(undefined); setLoading(true); webRef.current?.reload(); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* The thin VYA bar. Back, the address she is looking at, and the way into settings. */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
        <Pressable hitSlop={10} onPress={() => webRef.current?.goBack()} accessibilityLabel="Back">
          <Feather name="chevron-left" size={22} color={address && !broken ? colors.text : colors.textDim} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 14, color: colors.text }} numberOfLines={1}>
          {address?.host ?? me.data?.storeName ?? storeSlug}
        </Text>
        <Pressable hitSlop={10} onPress={() => router.push("/(seller)/menu")} accessibilityLabel="Settings">
          <Feather name="menu" size={20} color={colors.text} />
        </Pressable>
      </View>

      {address && !broken ? (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            source={{ uri: address.url }}
            style={{ flex: 1, backgroundColor: colors.bg }}
            onLoadEnd={() => { setLoading(false); setStatus((s) => s ?? 200); }}
            onError={() => { setLoading(false); setStatus(0); }}
            // A 404 IS NOT AN onError. onError fires when the page cannot be fetched at all — no DNS,
            // no route, TLS refused. A server that answers 404 has answered, so the WebView renders
            // whatever came back, which is how a seller opening her own Store tab was shown Next.js's
            // 404 page inside her app.
            onHttpError={(e) => {
              const { statusCode, url: failedUrl } = e.nativeEvent;
              // Only the page she asked for. A theme's missing font or a 404 on one image must not
              // replace a storefront that is otherwise rendering perfectly well.
              if (failedUrl !== address.url) return;
              setLoading(false);
              setStatus(statusCode);
            }}
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
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}>
          {/* What is wrong, in our words, and what it is not: nothing she can fix, and nothing
              wrong with her shop. */}
          <View style={{ backgroundColor: colors.chip, borderRadius: radius, padding: spacing.lg }}>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>
              {address ? reached.line : NO_ADDRESS}
            </Text>
            {address ? (
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 }}>
                {status === 0
                  ? "Pull the address up again once you have a signal."
                  : "Your pieces are safe and still sell through the VYA marketplace. Nothing you can do here changes it."}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              {address ? (
                <Pressable onPress={retry} style={{ backgroundColor: colors.accent, borderRadius: radius, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
                  <Text style={{ color: colors.accentText, fontWeight: "600" }}>Try again</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => router.push("/(seller)/domain")} style={{ borderWidth: 1, borderColor: colors.taupeDeep, borderRadius: radius, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Domain</Text>
              </Pressable>
            </View>
          </View>

          {/* The honest remainder: what a shopper would find if the door were open. */}
          <Window items={filterItems(items.data?.items ?? [], "live") as Item[]} followers={me.data?.storeFollowers} loading={items.isPending} />
        </ScrollView>
      )}

      {/* Which storefront this is — her imported site, or the one she built. Only when it renders:
          under a failure it would be a claim about a page that isn't there. */}
      {address && !broken && kind ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom ? 0 : spacing.sm, paddingTop: spacing.xs, backgroundColor: colors.bg }}>
          <Text style={{ fontSize: 11, color: colors.textDim, textAlign: "center" }}>{kind}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Her live pieces, for when the storefront cannot be shown. Not a storefront — the remainder. */
function Window({ items, followers, loading }: { items: Item[]; followers?: number; loading: boolean }) {
  if (loading) return null;
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={{ fontFamily: fonts.label, fontSize: 13, letterSpacing: 2.0, color: colors.textDim, fontWeight: "700" }}>
        IN THE WINDOW
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.xs }}>
        {shopLine(items.length, followers)}
      </Text>
      {items.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.textMuted, paddingVertical: spacing.xl, textAlign: "center", lineHeight: 20 }}>
          Nothing is live yet. Drafts don&apos;t show to shoppers.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md }}>
          {items.map((it) => (
            <Link key={it.id} href={{ pathname: "/(seller)/piece/[id]", params: { id: it.id } }} asChild>
              <Pressable style={{ width: `${(100 - 4) / 2}%` }}>
                {it.images?.[0] ? (
                  <Image source={{ uri: imageUrl(it.images[0], IMG.card) }} style={{ width: "100%", aspectRatio: 0.8, borderRadius: radius, backgroundColor: colors.chip }} />
                ) : (
                  <View style={{ width: "100%", aspectRatio: 0.8, borderRadius: radius, backgroundColor: colors.chip }} />
                )}
                <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm }} numberOfLines={1}>{it.title}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 1 }}>{formatMoney(it.priceCents, it.currency)}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </View>
  );
}
