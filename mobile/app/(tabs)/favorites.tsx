import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";

export default function FavoritesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Saved</Text>
      <Text style={styles.subtitle}>Sign in to save and revisit pieces you love.</Text>
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
    lineHeight: 20,
  },
});
