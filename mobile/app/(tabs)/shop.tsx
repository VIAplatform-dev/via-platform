import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import AppHeader from "../../components/AppHeader";
import SectionHeading from "../../components/SectionHeading";
import CollectionRail, { type CollectionCard } from "../../components/CollectionRail";
import { imageUrl } from "../../lib/imageUrl";
import { colors, fonts, spacing } from "../../lib/theme";

// Shop is browsing by curation: one store held up for the day, the collections, the categories, and
// then every store on VYA. Search lives in the header, for when someone already knows what they want.

type StoreOfDay = { store: { slug: string; name: string; location: string | null; image: string | null } | null };
type StoreRow = { slug: string; name: string; location?: string | null; image?: string | null; logo?: string | null };

// The same commissioned category art the web homepage uses (app/page.tsx). These are shot for the
// purpose, unlike a first-product photo, which is whatever happened to be listed most recently.
const CATEGORIES: { label: string; slug: string; image: string }[] = [
  { label: "Clothing", slug: "clothing", image: "/categories/clothes.jpg" },
  { label: "Bags", slug: "bags", image: "/categories/bags-v2.jpg" },
  { label: "Shoes", slug: "shoes", image: "/categories/shoes-v2.jpg" },
  { label: "Accessories", slug: "accessories", image: "/categories/accessories-v3.jpg" },
  { label: "Home", slug: "home", image: "/categories/home.jpg" },
];

export default function ShopScreen() {
  const { user, loading } = useAuth();

  const sotd = useQuery({ queryKey: ["store-of-the-day"], queryFn: () => apiGet<StoreOfDay>("/api/public/store-of-the-day"), enabled: Boolean(user) });
  const collections = useQuery({ queryKey: ["collections"], queryFn: () => apiGet<{ collections: CollectionCard[] }>("/api/public/collections"), enabled: Boolean(user) });
  const stores = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreRow[] }>("/api/public/stores"), enabled: Boolean(user) });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;

  const store = sotd.data?.store;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Shop" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {store ? (
          <View>
            <SectionHeading eyebrow="Featured today" title="Store of the Day" />
            <Link href={`/store/${store.slug}`} asChild>
              <Pressable style={{ marginHorizontal: spacing.lg }}>
                <View style={{ height: 300, backgroundColor: colors.bgAlt, overflow: "hidden" }}>
                  {store.image ? (
                    <Image source={{ uri: imageUrl(store.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={180} />
                  ) : null}
                  <View style={{ position: "absolute", left: spacing.lg, bottom: spacing.lg }}>
                    <Text style={{ fontFamily: fonts.serif, fontSize: 32, color: "#FFFFFF" }}>{store.name}</Text>
                    {store.location ? (
                      <Text style={{ marginTop: 2, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "#FFFFFF" }}>{store.location}</Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </Link>
          </View>
        ) : null}

        {(collections.data?.collections ?? []).length ? (
          <View style={{ marginTop: spacing.xxl }}>
            <SectionHeading eyebrow="Shop by" title="Collection" />
            <CollectionRail collections={collections.data!.collections} />
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xxl }}>
          <SectionHeading eyebrow="Shop by" title="Category" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {CATEGORIES.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} asChild>
                <Pressable style={{ width: 190 }}>
                  <View style={{ width: 190, height: 260, backgroundColor: colors.bgCard, overflow: "hidden" }}>
                    <Image source={{ uri: imageUrl(c.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={180} />
                  </View>
                  <Text style={{ marginTop: spacing.md, textAlign: "center", fontFamily: fonts.serif, fontSize: 19, color: colors.text }}>{c.label}</Text>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        </View>

        <View style={{ marginTop: spacing.xxl }}>
          <SectionHeading eyebrow="All" title="Stores" />
          <View style={{ paddingHorizontal: spacing.lg }}>
            {(stores.data?.stores ?? []).map((s) => (
              <Link key={s.slug} href={`/store/${s.slug}`} asChild>
                <Pressable style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingVertical: spacing.md }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgAlt, overflow: "hidden" }}>
                    {s.image || s.logo ? (
                      <Image source={{ uri: imageUrl(s.image || s.logo) }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={180} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>{s.name}</Text>
                    {s.location ? (
                      <Text style={{ marginTop: 2, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase", color: colors.textMuted }}>{s.location}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
