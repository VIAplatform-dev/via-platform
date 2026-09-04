import { Tabs } from "expo-router";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { colors } from "../../lib/theme";

// The seller's five tabs: Home · Inventory · List (+) · Inbox · Store.
//
// Same bar as the shopper app — five icons, no labels — because a seller is a shopper too and the
// two shapes should not feel like two products. What differs is the middle.
//
// THE + IS THE ONLY FILLED CONTROL IN THE APP. Everything else is a burgundy glyph on cream;
// listing is the one action that makes her money and the one she does forty times in an afternoon,
// so it is the one thing drawn as a solid target rather than an icon to aim at.
//
// Consignment is NOT a tab. It is a tile on Home — it matters on the days it matters and never
// competes for a permanent slot. Market Mode is not here either: it takes over the whole screen.

function icon(name: React.ComponentProps<typeof Feather>["name"]) {
  const TabIcon = ({ color }: { color: string }) => <Feather name={name} size={24} color={color} />;
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
}

// A real tab route rather than a modal, for now: piece B turns this into the camera flow. Drawn as
// the filled pill either way, so the bar never changes shape underneath her.
function ListButton({ onPress }: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="List a piece"
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 52,
          height: 34,
          borderRadius: 10,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="plus" size={22} color={colors.accentText} />
      </View>
    </Pressable>
  );
}

export default function SellerTabsLayout() {
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
      <Tabs.Screen name="inventory" options={{ tabBarIcon: icon("box") }} />
      <Tabs.Screen name="list" options={{ tabBarButton: (props) => <ListButton {...props} /> }} />
      <Tabs.Screen name="inbox" options={{ tabBarIcon: icon("mail") }} />
      <Tabs.Screen name="store" options={{ tabBarIcon: icon("shopping-bag") }} />

      {/* Everything below is href: null — reachable, but NOT a tab.
       *
       * Every file in this folder becomes a tab button unless it says otherwise, so without these
       * the bar grows a nameless icon per screen. Orders comes off the Home tile; Piece and Message
       * come off a list; the rest come off the ☰ menu on the Store tab. Five tabs is the design. */}
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="discounts" options={{ href: null }} />
      <Tabs.Screen name="payouts" options={{ href: null }} />
      <Tabs.Screen name="billing" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="consignment" options={{ href: null }} />
      <Tabs.Screen name="new/details" options={{ href: null }} />
      <Tabs.Screen name="new/bulk" options={{ href: null }} />
      <Tabs.Screen name="new/loading" options={{ href: null }} />
      <Tabs.Screen name="new/review" options={{ href: null }} />
      <Tabs.Screen name="piece/[id]" options={{ href: null }} />
      <Tabs.Screen name="message/[id]" options={{ href: null }} />
    </Tabs>
  );
}
