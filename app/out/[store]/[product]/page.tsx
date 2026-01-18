import { redirect } from "next/navigation";
import { stores } from "@/app/stores/storeData";
import { track } from "@/app/lib/track";

export default async function OutPage({
  params,
}: {
  params: Promise<{ store: string; product: string }>;
}) {
  const { store: storeSlug, product } = await params;

  const store = stores.find((s) => s.slug === storeSlug);

  if (!store) {
    redirect("/");
  }

  // 🔍 TRACK CLICK
  track("product_click", {
    store: store.slug,
    product,
  });

  const destination = `${store.baseUrl}/products/${product}?utm_source=via&utm_medium=referral`;

  redirect(destination);
}
