import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listSellerOrders } from "@/app/lib/db/orders";
import { listSellerItems } from "@/app/lib/db/inventory";
import { listCustomerProfiles } from "@/app/lib/store-customers-db";
import { listConsignors } from "@/app/lib/consignment-db";

export const dynamic = "force-dynamic";

// GET ?q= — the global ⌘K lookup. Searches orders, inventory, customers and consignors at once and
// returns grouped, jump-to-detail results. Each entity is flattened to one searchable string so a
// single query matches order #, SKU, name, email, item title, brand, status, etc. — "look up anything".
const B = "/infrastructure/admin";
type Hit = { id: string; label: string; sub: string; href: string };

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
 if (q.length < 1) return NextResponse.json({ ok: true, groups: [] });

 const seller = await getSellerBySlug(slug).catch(() => null);
 const [orders, items, customers, consignors] = await Promise.all([
 seller ? listSellerOrders(seller.id).catch(() => []) : [],
 seller ? listSellerItems(seller.id).catch(() => []) : [],
 listCustomerProfiles(slug).catch(() => []),
 listConsignors(slug).catch(() => []),
 ]);

 const has = (s: string) => s.toLowerCase().includes(q);
 const money = (c: number) => `$${(c / 100).toFixed(0)}`;

 const orderHits: Hit[] = orders
 .filter((o) => has(`#${1000 + o.orderNo} ${o.itemTitle || ""} ${o.buyerEmail || ""} ${o.status}`))
 .slice(0, 6)
 .map((o) => ({ id: String(o.id), label: `#${1000 + o.orderNo} · ${o.itemTitle || "Item"}`, sub: `${o.buyerEmail || "—"} · ${money(o.amountCents)} · ${o.status}`, href: `${B}/orders/${o.id}` }));

 const itemHits: Hit[] = items
 .filter((it) => has(`SKU-${1000 + it.sku} ${it.title} ${it.brand || ""} ${it.category || ""} ${it.size || ""} ${it.status}`))
 .slice(0, 6)
 .map((it) => ({ id: it.id, label: `${it.title}`, sub: `SKU-${1000 + it.sku} · ${money(it.priceCents)} · ${it.status}`, href: `${B}/inventory?item=${it.id}` }));

 const custHits: Hit[] = customers
 .filter((c) => has(`${c.name || ""} ${c.email} ${c.phone || ""} ${c.location || ""}`))
 .slice(0, 6)
 .map((c) => ({ id: c.email, label: c.name || c.email, sub: `${c.email}${c.orders ? ` · ${c.orders} orders` : ""}`, href: `${B}/customers/${encodeURIComponent(c.email)}` }));

 const consHits: Hit[] = consignors
 .filter((c) => has(`${c.name} ${c.email || ""} ${c.phone || ""}`))
 .slice(0, 6)
 .map((c) => ({ id: String(c.id), label: c.name, sub: [c.email, c.status].filter(Boolean).join(" · "), href: `${B}/consignment/consignors` }));

 const groups = [
 { group: "Orders", hits: orderHits },
 { group: "Inventory", hits: itemHits },
 { group: "Customers", hits: custHits },
 { group: "Consignors", hits: consHits },
 ].filter((g) => g.hits.length > 0);

 return NextResponse.json({ ok: true, groups });
}
