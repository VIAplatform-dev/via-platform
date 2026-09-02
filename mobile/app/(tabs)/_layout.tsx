import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

// Five icons, no labels.
//
// The bag is NOT here — it lives in the header, which is what makes five possible. Two of these
// tabs are really two screens each (Obsessions holds Sold Out and Searches; Community holds
// Messages), split by the underlined row inside them rather than by more tabs.
//
// Outline icons throughout; the active one is the same glyph at full strength against the muted
// rest. No labels, because with five familiar shapes they only add clutter — and because a label
// long enough to say "Obsessions" truncates to "Obsessi…" at this width.

function icon(name: React.ComponentProps<typeof Feather>["name"]) {
  return ({ color }: { color: string }) => <Feather name={name} size={24} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: icon("home") }} />
      <Tabs.Screen name="shop" options={{ tabBarIcon: icon("grid") }} />
      <Tabs.Screen name="obsessions" options={{ tabBarIcon: icon("heart") }} />
      <Tabs.Screen name="community" options={{ tabBarIcon: icon("message-circle") }} />
      <Tabs.Screen name="account" options={{ tabBarIcon: icon("user") }} />

      {/* Reached from Home's "See all" and from Browse, not from the bar. */}
      <Tabs.Screen name="new-arrivals" options={{ href: null }} />
      <Tabs.Screen name="browse" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
    </Tabs>
  );
}
