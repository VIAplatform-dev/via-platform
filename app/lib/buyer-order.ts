import { getOrderDetail } from "@/app/lib/db/orders";
import { getSellerById } from "@/app/lib/db/sellers";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { makeOrderToken } from "@/app/lib/orderToken";

export type BuyerOrderView = {
 orderId: string;
 orderNo: number;
 token: string;
 status: string;
 storeName: string;
 storeSlug: string;
 handle: string | null;
 colors: { bg: string; text: string; accent: string };
 fonts: { heading?: string; body?: string };
 itemTitle: string;
 itemImage: string | null;
 amountCents: number;
 shippingPaidCents: number;
 currency: string;
 buyerName: string | null;
 buyerEmail: string | null;
 ship: { line1: string | null; line2: string | null; city: string | null; state: string | null; postal: string | null; country: string | null };
 trackingNumber: string | null;
 trackingUrl: string | null;
 paidAt: Date | null;
};

/** Everything a buyer-facing order page needs — order details + the store's brand (colours, fonts,
 * name, handle) — in one call. Used by both /checkout/success and /order/[token]. Null if not found. */
export async function loadBuyerOrder(orderId: string): Promise<BuyerOrderView | null> {
 const o = await getOrderDetail(orderId).catch(() => null);
 if (!o) return null;
 const seller = await getSellerById(o.sellerId).catch(() => null);
 const slug = seller?.slug || "";
 const sf = slug ? await getStorefrontBySlug(slug).catch(() => null) : null;
 const theme = sf?.theme ?? {};
 const images = Array.isArray(o.itemImages) ? (o.itemImages as string[]) : [];
 return {
 orderId: o.id,
 orderNo: o.orderNo,
 token: makeOrderToken(o.id) || "",
 status: String(o.status),
 storeName: theme.storeName || seller?.name || slug.replace(/-/g, " ") || "the store",
 storeSlug: slug,
 handle: sf?.handle || slug || null,
 colors: {
 bg: theme.colors?.bg || "#FFFDF8",
 text: theme.colors?.text || "#1a1a1a",
 accent: theme.colors?.accent || theme.colors?.text || "#5D0F17",
 },
 fonts: { heading: theme.fonts?.heading, body: theme.fonts?.body },
 itemTitle: o.itemTitle || "your item",
 itemImage: images.filter(Boolean)[0] || null,
 amountCents: o.amountCents,
 shippingPaidCents: o.shippingPaidCents || 0,
 currency: o.currency || "USD",
 buyerName: o.buyerName,
 buyerEmail: o.buyerEmail,
 ship: { line1: o.shipLine1, line2: o.shipLine2, city: o.shipCity, state: o.shipState, postal: o.shipPostal, country: o.shipCountry },
 trackingNumber: o.trackingNumber,
 trackingUrl: o.trackingUrl,
 paidAt: o.paidAt ? new Date(o.paidAt as unknown as string) : null,
 };
}
