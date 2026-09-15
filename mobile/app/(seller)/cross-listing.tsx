import { Image, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, radius, radiusSm, pill } from "../../lib/portal-theme";
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
      {/* What this screen is, before the list. A row on Home that says "3 pieces failed to post"
          and then a bare list of three pieces leaves the seller to work out what failed, why, and
          which half of it she can do anything about. */}
      {failed.length > 0 ? (
        <Text style={{ fontSize: 14.5, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 21 }}>
          These didn&apos;t reach the marketplace they were queued for. Your storefront is unaffected: they
          are live there.
        </Text>
      ) : null}

      {q.isError ? (
        <Empty>Couldn&apos;t load these. Pull to try again.</Empty>
      ) : q.isPending ? (
        <Empty> </Empty>
      ) : failed.length === 0 ? (
        <Empty>Nothing failed. Every piece posted where you sent it.</Empty>
      ) : (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          {failed.map((p) => {
            const apiChannels = p.platforms.filter((k) => platforms.find((pl) => pl.key === k)?.mode === "api");
            const desktopOnly = needsDesktop(p.platforms, platforms);
            const busy = retry.isPending && retry.variables?.itemId === p.itemId;
            const named = (k: string) => platforms.find((pl) => pl.key === k)?.name ?? k;
            return (
              // ONE CARD PER PIECE. It was a run of hairline rows with the advice floating full
              // width underneath and a grey word for a button: three pieces read as one paragraph.
              <View key={p.itemId} style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.md }}>
                <Link href={{ pathname: "/(seller)/piece/[id]", params: { id: p.itemId } }} asChild>
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <Image source={{ uri: p.image ?? undefined }} style={{ width: 52, height: 62, borderRadius: radiusSm, backgroundColor: colors.bgAlt }} />
                    <View style={{ flex: 1 }}>
                      {p.brand ? <Text style={{ fontSize: 12, color: colors.textDim }} numberOfLines={1}>{p.brand}</Text> : null}
                      <Text style={{ fontSize: 15.5, color: colors.text, fontWeight: "500" }} numberOfLines={2}>{p.title}</Text>
                      {/* WHICH marketplace, as a pill. "eBay can be retried from here" buried the
                          only word that identifies the failure inside a sentence. */}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                        {p.platforms.map((k) => (
                          <View key={k} style={{ backgroundColor: colors.negativeSoft, borderRadius: pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11.5, color: colors.negative, fontWeight: "500" }}>{named(k)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textDim} />
                  </Pressable>
                </Link>

                {/* WHAT THE PLATFORM ACTUALLY SAID, where it said anything. A seller cannot fix
                    "it failed"; she can fix "Item specifics missing: Brand". */}
                {Object.entries(p.reasons).map(([k, why]) => (
                  <Text key={k} style={{ fontSize: 13.5, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 }}>
                    {named(k)} said: {why}
                  </Text>
                ))}

                <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 }}>
                  {failureAdvice(p.platforms, platforms)}
                </Text>

                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md }}>
                  {apiChannels.length > 0 ? (
                    <Pressable
                      disabled={busy}
                      onPress={() => retry.mutate({ itemId: p.itemId, channels: apiChannels })}
                      style={{ borderRadius: pill, backgroundColor: colors.accent, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, opacity: busy ? 0.6 : 1 }}
                    >
                      <Text style={{ fontSize: 13.5, fontWeight: "500", color: colors.accentText }}>
                        {busy ? "Retrying…" : `Retry ${apiChannels.map(named).join(" & ")}`}
                      </Text>
                    </Pressable>
                  ) : null}
                  {/* Said per piece rather than once at the top: a list where some rows have a
                      button and some don't has to say why on the rows that don't. */}
                  {desktopOnly ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="monitor" size={14} color={colors.textDim} />
                      <Text style={{ fontSize: 13, color: colors.textDim }}>Finish this one on your computer</Text>
                    </View>
                  ) : null}
                </View>
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
