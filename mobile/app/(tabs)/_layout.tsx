import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../lib/theme";

// Rendered through tabBarIcon rather than tabBarLabel so the type can stay
// letter-spaced uppercase. The icon slot is sized for a glyph, not a word, so it
// has to be told explicitly not to wrap — without this, "Account" breaks as
// "ACC / OUNT" and "Shop" as "SHO / P".
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      numberOfLines={1}
      style={{
        fontSize: 10,
        letterSpacing: 1.5,
        color: focused ? colors.text : colors.textDim,
        fontWeight: focused ? "600" : "400",
        textTransform: "uppercase",
        width: TAB_LABEL_WIDTH,
        textAlign: "center",
      }}
    >
      {label}
    </Text>
  );
}

// Wide enough for "ACCOUNT" at 10pt with 1.5 tracking, which is the longest label.
const TAB_LABEL_WIDTH = 76;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: "Georgia", fontWeight: "400", fontSize: 22 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "VYA",
          tabBarIcon: ({ focused }) => <TabIcon label="Shop" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ focused }) => <TabIcon label="Browse" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favorites",
          tabBarIcon: ({ focused }) => <TabIcon label="Saved" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ focused }) => <TabIcon label="Account" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
