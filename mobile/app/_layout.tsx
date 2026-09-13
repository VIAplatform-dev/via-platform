import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { DraftProvider } from "../lib/seller/draft";
import { useFonts } from "expo-font";
import { colors } from "../lib/theme";
import { PORTAL_FONTS } from "../lib/portal-theme";

// Stale time exists because the catalogue is vintage: one-of-one pieces that change slowly. Refetching
// the feed every time someone taps back from a product costs bandwidth and shows the same items.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

// A push that arrives while the app is open still shows as a banner — a sale is worth interrupting
// for. Module level, as expo-notifications asks, so it is set before any notification can arrive.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Where a tapped push lands: the data.type the server put on it (app/lib/seller-push-core.ts). */
function routeForPush(data: Record<string, unknown> | undefined): "/(seller)/orders" | "/(seller)/inbox" | null {
  if (data?.type === "sold") return "/(seller)/orders";
  if (data?.type === "store_message") return "/(seller)/inbox";
  return null;
}

export default function RootLayout() {
  // getvya.ai's faces, for the seller portal. Loaded at the root because a font family has to be
  // registered before any screen that names it renders. Rendering does NOT wait on them: a seller
  // opening the app to check a sale should not stare at a blank screen because a typeface is still
  // decoding. Until they land, the portal draws in the platform serif and swaps in place.
  useFonts(PORTAL_FONTS);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const to = routeForPush(r.notification.request.content.data as Record<string, unknown> | undefined);
      if (to) router.push(to);
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CartProvider>
            <DraftProvider>
              <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerTitleStyle: { fontFamily: "Georgia", fontSize: 17 },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              {/* The seller app. Same bundle, same sign-in; `storeSlug` routes between them. */}
              <Stack.Screen name="(seller)" options={{ headerShown: false }} />
              {/* Market Mode takes over the screen — no tab bar, no header. */}
              <Stack.Screen name="market/index" options={{ headerShown: false }} />
              <Stack.Screen name="market/find" options={{ headerShown: false }} />
              <Stack.Screen name="market/quick" options={{ headerShown: false }} />
              <Stack.Screen name="market/checkout/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="market/sales" options={{ headerShown: false }} />
              <Stack.Screen name="auth/login" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
              <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="store/[slug]" options={{ headerShown: false }} />
              <Stack.Screen name="category/[slug]" options={{ headerShown: false }} />
              <Stack.Screen name="collection/[slug]" options={{ headerShown: false }} />
              <Stack.Screen name="purchases" options={{ title: "Purchases" }} />
              <Stack.Screen name="settings" options={{ title: "Settings" }} />
            </Stack>
            </DraftProvider>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// A render error anywhere below here shows a screen you can leave, instead of closing the app.
//
// expo-router looks for this export by name and wraps the whole tree in it. It is not a substitute
// for fixing the error — the message is printed, not swallowed — but a shopper who taps something
// and watches VYA disappear does not come back, and on a phone there is no console to tell her
// what happened.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Text style={{ fontFamily: "Georgia", fontSize: 22, color: colors.text, textAlign: "center" }}>
        Something went wrong
      </Text>
      <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
        {error?.message || "That screen couldn't load."}
      </Text>
      <Pressable
        onPress={() => void retry()}
        style={{ marginTop: 28, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 32, paddingVertical: 14 }}
      >
        <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>Try again</Text>
      </Pressable>
    </View>
  );
}
