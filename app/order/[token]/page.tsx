import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyOrderToken } from "@/app/lib/orderToken";
import { loadBuyerOrder } from "@/app/lib/buyer-order";
import OrderView from "@/app/order/OrderView";

export const dynamic = "force-dynamic";

// Persistent, revisitable order-status page — the link buyers get in their confirmation + shipping
// emails. Store-branded, live status + tracking, and every action points back to the store (never a
// third-party app). Access is via an unguessable HMAC token, so no login and no order-id enumeration.
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
 const { token } = await params;
 const orderId = verifyOrderToken(token);
 const v = orderId ? await loadBuyerOrder(orderId).catch(() => null) : null;
 return { title: v ? `Order #${v.orderNo} · ${v.storeName}` : "Order", robots: { index: false, follow: false } };
}

export default async function OrderStatusPage({ params }: Props) {
 const { token } = await params;
 const orderId = verifyOrderToken(token);
 if (!orderId) return notFound();
 const v = await loadBuyerOrder(orderId).catch(() => null);
 if (!v) return notFound();
 return <OrderView v={v} mode="status" />;
}
