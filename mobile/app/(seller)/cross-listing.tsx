import { Image, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, radius } from "../../lib/portal-theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import {
  failedPieces, failureAdvice, liveCrossListPlatforms, needsDesktop,
  type BoardRow, type CrossListPlatform,
} from "../../lib/seller/cross-listing";

// "3 pieces failed to post", answered in the app.
//
// That row on Home had no in-app screen, so it fell through to opening /admin/cross-listing in a
// browser sheet. Which is the one thing the seller app is not allowed to do, and a particularly
// poor version of it: a board laid out as a wide table, on a phone, to tell her something that
// fits in a sentence.
//
// WHAT SHE CAN ACTUALLY DO IS THE WHOLE POINT. Two kinds of failure hide behind one number and
// they are not alike. eBay has a listing API, so a failure there is VYA's to retry and the button
// is right here. Depop and Vestiaire have no API at all: the extension fills their own logged-in
// form in a real browser, so the honest answer is to name the piece, say so, and stop pretending a
// phone can finish it.

type Board = { board: BoardRow[]; platforms: CrossListPlatform[] };

export default function CrossListingScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["store", "cross-listing"],
    queryFn: () => apiGet<Board>("/api/store/cross-listing"),
    enabled: !!storeSlug,
  });

  const platforms = liveCrossListPlatforms(q.data?.platforms ?? []);
  const failed = failedPieces(q.data?.board ?? [], platforms);

  const retry = useMutation({
    mutationFn: ({ itemId, channels }: { itemId: string; channels: string[] }) =>
      apiPost("/api/store/cross-listing/retry", { itemId, channels }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["store", "cross-listing"] }),
  });

  return (
    <SellerScreen title="Failed to post" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load these. Pull to try again.</Empty>
      ) : failed.length === 0 && !q.isPending ? (
        <Empty>Nothing failed. Every piece posted where you sent it.</Empty>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          {failed.map((p) => {
            const apiChannels = p.platforms.filter((k) => platforms.find((pl) => pl.key === k)?.mode === "api");
            const desktopOnly = needsDesktop(p.platforms, platforms);
            const busy = retry.isPending && retry.variables?.itemId === p.itemId;
            return (
              <View key={p.itemId} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.lg }}>
                {/* The piece itself opens its editor: a failure is often a missing field, and the
                    place to fix that is the piece, not a board about the piece. */}
                <Link href={{ pathname: "/(seller)/piece/[id]", params: { id: p.itemId } }} asChild>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <Image source={{ uri: p.image ?? undefined }} style={{ width: 48, height: 48, borderRadius: radius, backgroundColor: colors.chip }} />
                    <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{p.title}</Text>
                    <Feather name="chevron-right" size={18} color={colors.textDim} />
                  </Pressable>
                </Link>

                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 }}>
                  {failureAdvice(p.platforms, platforms)}
                </Text>

                {apiChannels.length > 0 ? (
                  <Pressable
                    disabled={busy}
                    onPress={() => retry.mutate({ itemId: p.itemId, channels: apiChannels })}
                    style={{ alignSelf: "flex-start", marginTop: spacing.sm, borderRadius: radius, backgroundColor: colors.chip, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{busy ? "Retrying…" : "Retry"}</Text>
                  </Pressable>
                ) : null}

                {/* Said per piece rather than once at the top: a list where some rows have a button
                    and some don't needs to say WHY on the rows that don't. */}
                {desktopOnly ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
                    <Feather name="monitor" size={13} color={colors.textDim} />
                    <Text style={{ fontSize: 12, color: colors.textDim }}>Needs your computer</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {retry.isError ? (
        <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>That retry didn&apos;t go through. Try again.</Text>
      ) : null}
    </SellerScreen>
  );
}
