import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { colors, spacing } from "../../lib/theme";

export default function AccountScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.subtitle}>Sign in coming next session.</Text>

      {/* Depop connect — a diagnostic spike for now. It logs into Depop on this device to see what
          the session looks like; the finished cross-listing flow is built on what it finds. */}
      <Pressable style={styles.connect} onPress={() => router.push("/connect-depop")}>
        <Text style={styles.connectText}>Connect Depop (test)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 28,
    color: colors.text,
    marginBottom: 12,
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 14,
  },
  connect: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
  },
  connectText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
});
