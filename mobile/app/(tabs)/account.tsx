import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "../../lib/theme";

export default function AccountScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.subtitle}>Sign in coming next session.</Text>
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
});
