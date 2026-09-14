import { ScrollView, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors, fonts, spacing } from "../lib/theme";

// The seller's front door, reached from "Get started as a store" on the sign-in screen.
//
// WHY THIS EXISTS AS A SCREEN rather than opening the website immediately. Creating a store is a
// long form — shipping, tax, policies, a domain — and it genuinely belongs on a desktop. But
// sending someone straight from a sign-in screen into a browser gives them no idea what they are
// signing up for, and it strands the people who ALREADY have a store and just want into the app.
// So this screen does two jobs: it says what a VYA store gets, and it splits those two audiences.
//
// The claims below are the seller product as it actually exists in the web app today — camera
// listing with comparable-sales pricing, cross-listing to Depop/eBay/Vestiaire, Market Mode on
// Stripe Connect, and Friday consignor payouts. Nothing here is aspirational; if a line stops
// being true, delete it rather than softening it.

type Capability = {
 icon: React.ComponentProps<typeof Feather>["name"];
 title: string;
 body: string;
};

const CAPABILITIES: Capability[] = [
 {
  icon: "camera",
  title: "List from the camera",
  body: "Photograph a piece and VYA reads the brand, writes the description and prices it against real comparable sales.",
 },
 {
  icon: "share-2",
  title: "Sell where they're looking",
  body: "Cross-post the same piece to Depop, eBay and Vestiaire without listing it three times.",
 },
 {
  icon: "credit-card",
  title: "Take payment at a market",
  body: "Market Mode turns the phone into a till — card or cash, straight into your own Stripe account.",
 },
 {
  icon: "users",
  title: "Pay consignors on Friday",
  body: "Splits tracked per piece, what's owed shown before who's owed it, and one button to settle.",
 },
 {
  icon: "home",
  title: "A storefront that stays yours",
  body: "Your own domain, your own name. VYA hosts it; shoppers buy from you, not from us.",
 },
];

export default function BecomeAStoreScreen() {
 const insets = useSafeAreaInsets();
 const { storeSlug } = useAuth();

 // NEITHER OF THESE OPENS A BROWSER ANY MORE.
 //
 // The workspace is in this app — that is the whole seller half of it — and creating a store is
 // now a screen here too. Sending someone to Safari left their session in Safari, so they came back
 // to an app that still didn't know who they were.
 const openWorkspace = () => router.push("/(seller)");

 return (
  <View style={{ flex: 1, backgroundColor: colors.bg }}>
   <View
    style={{
     paddingTop: insets.top + spacing.sm,
     paddingHorizontal: spacing.lg,
     paddingBottom: spacing.sm,
     flexDirection: "row",
     alignItems: "center",
    }}
   >
    <Pressable
     onPress={() => router.back()}
     hitSlop={12}
     accessibilityRole="button"
     accessibilityLabel="Back"
    >
     <Feather name="chevron-left" size={24} color={colors.text} />
    </Pressable>
   </View>

   <ScrollView
    contentContainerStyle={{
     paddingHorizontal: spacing.xl,
     paddingBottom: insets.bottom + spacing.xxl,
    }}
   >
    <Text
     style={{
      fontFamily: fonts.serif, fontSize: 13, letterSpacing: 4,
      textTransform: "uppercase", color: colors.textDim, marginBottom: spacing.md,
     }}
    >
     For stores
    </Text>

    <Text style={{ fontFamily: fonts.serif, fontSize: 34, lineHeight: 38, color: colors.text }}>
     Your shop.{"\n"}Still your name.
    </Text>

    <Text
     style={{
      marginTop: spacing.md, fontSize: 15, lineHeight: 22, color: colors.textMuted,
     }}
    >
     Forty-five independent vintage and archive stores sell on VYA. You keep your own storefront,
     your own customers and your own payment account — we handle everything around it.
    </Text>

    <View style={{ marginTop: spacing.xxl, gap: spacing.xl }}>
     {CAPABILITIES.map((c) => (
      <View key={c.title} style={{ flexDirection: "row", gap: spacing.lg }}>
       <View
        style={{
         width: 38, height: 38, borderRadius: 19, flexShrink: 0,
         alignItems: "center", justifyContent: "center",
         backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
        }}
       >
        <Feather name={c.icon} size={17} color={colors.text} />
       </View>
       <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 22, color: colors.text }}>
         {c.title}
        </Text>
        <Text style={{ marginTop: 3, fontSize: 14, lineHeight: 20, color: colors.textMuted }}>
         {c.body}
        </Text>
       </View>
      </View>
     ))}
    </View>

    <View style={{ marginTop: spacing.xxl + spacing.md, gap: spacing.sm }}>
     {storeSlug ? (
      // Already a store on this account — no pitch, just the way in.
      <Pressable
       onPress={openWorkspace}
       accessibilityRole="button"
       style={{
        backgroundColor: colors.accent, borderRadius: 999,
        paddingVertical: spacing.lg, alignItems: "center",
       }}
      >
       <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "500" }}>
        Open your workspace
       </Text>
      </Pressable>
     ) : (
      // SETTING UP A SHOP IS A LAPTOP JOB, and saying so is better than either of the two things
      // this did before: opening Safari (where the sign-in then stranded itself) or offering a
      // phone-sized version of a wizard that wants a catalogue, photographs and a bank account.
      //
      // No button, because there is nothing here to press — the address is the instruction, and a
      // seller reading this on her phone will do it later at a desk. Signing IN to a shop she
      // already has is on the sign-in screen and needs no laptop.
      <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
       <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>
        Setting up a shop is done on a computer.
       </Text>
       <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs }}>
        Go to getvya.ai on a laptop — it takes about ten minutes, and you&apos;ll want your photographs
        and bank details to hand. Once it&apos;s set up, sign in here and your shop is in your pocket.
       </Text>
      </View>
     )}

     <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      style={{
       borderWidth: 1, borderColor: colors.border, borderRadius: 999,
       paddingVertical: spacing.lg, alignItems: "center", backgroundColor: colors.bgCard,
      }}
     >
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
       I already sell on VYA
      </Text>
     </Pressable>
    </View>

    {/* Straight from the design notes: naming what deliberately is NOT on the phone, so nobody
        hunts for it. Shipping zones, tax registrations, policies and domains are set once and are
        genuinely better on a desktop. */}
    <Text
     style={{
      marginTop: spacing.xl, fontSize: 12.5, lineHeight: 18,
      color: colors.textDim, textAlign: "center",
     }}
    >
     Setting up takes about ten minutes on a computer — shipping, tax and your domain are easier
     with a keyboard. Everything after that lives here.
    </Text>
   </ScrollView>
  </View>
 );
}
