"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { B, ActionBar, BigButton, MarketPage, Notice, StatusChip, Thumb, api, href, money, type MarketItem } from "../../ui";
import { readCart, writeCart, addToCart, getActiveCartId, setActiveCartId } from "../../cart";
import { applyDiscount } from "@/app/lib/market/sale-core";

type Resp = { item: MarketItem; openCheckout: { id: string; createdAt: string; deviceLabel: string | null } | null };
const WINE = "#5D0F17";

// Confirm: one item, its photo and price, and a single decision — put it in the cart. Payment happens
// once, on the cart, for everything the customer is buying.
function ItemInner() {
 const { id } = useParams<{ id: string }>();
 const router = useRouter();
 const [data, setData] = useState<Resp | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [inCart, setInCart] = useState(false);
 const [adding, setAdding] = useState(false);

 const load = async () => {
 const r = await api<Resp>(`/api/store/market/item/${id}`);
 if (!r.ok) { setErr(r.data.error || "Not found"); return; }
 setData(r.data);
 setInCart(readCart().some((l) => l.itemId === r.data.item.id));
 };
 useEffect(() => { (async () => { await load(); })(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

 const item = data?.item;
 const sellable = item ? item.status === "active" || item.status === "draft" : false;

 async function openCart(): Promise<string | null> {
 const r = await api<{ cart: { id: string } }>("/api/store/market/carts", { method: "POST" });
 if (!r.ok) { setErr(r.data.error || "Couldn't open a cart"); return null; }
 setActiveCartId(r.data.cart.id);
 return r.data.cart.id;
 }

 // Drops this item into the cart this device is serving, opening one if there isn't a live cart yet.
 // Keeps any per-sale discount already chosen for it; the cart screen is where prices get changed.
 async function add() {
 if (!item) return;
 setAdding(true); setErr(null);
 const discount = readCart().find((l) => l.itemId === item.id)?.discount ?? null;
 const line = { itemId: item.id, title: item.title, image: item.image, size: item.size, listCents: item.priceCents, saleCents: applyDiscount(item.priceCents, discount), discount };
 const next = addToCart(line);
 let cartId = getActiveCartId() ?? (await openCart());
 if (!cartId) { setAdding(false); return; }
 let save = await api(`/api/store/market/carts/${cartId}`, { method: "PATCH", body: JSON.stringify({ lines: next }) });
 if (!save.ok && save.status === 404) {
 // That cart was paid off or cleared somewhere else — start a fresh one holding just this item.
 writeCart([line]);
 cartId = await openCart();
 if (!cartId) { setAdding(false); return; }
 save = await api(`/api/store/market/carts/${cartId}`, { method: "PATCH", body: JSON.stringify({ lines: [line] }) });
 }
 setAdding(false);
 if (!save.ok) { setErr(save.data.error || "Couldn't add to the cart"); return; }
 router.push(href(`${B}/cart`));
 }

 return (
 <MarketPage title="Confirm item" back={`${B}/find`}>
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 {!item && !err && <p className="text-[13px] text-stone-400">Loading…</p>}
 {item && (
 <>
 <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
 <div className="flex max-h-[36vh] items-center justify-center overflow-hidden bg-stone-100"><Thumb src={item.image} alt={item.title} fill className="!max-h-[36vh]" /></div>
 <div className="p-4">
 <div className="flex items-start justify-between gap-3">
 <h2 className="text-[18px] font-semibold leading-snug text-stone-900">{item.title}</h2>
 <StatusChip status={item.status} />
 </div>
 <p className="mt-1 flex items-center gap-2 text-[13px] text-stone-500">
 {[item.brand, item.size && `Size ${item.size}`, item.category].filter(Boolean).length > 0 && <span className="min-w-0 truncate">{[item.brand, item.size && `Size ${item.size}`, item.category].filter(Boolean).join(" · ")}</span>}
 <a href={href(`${B}/item/${item.id}/edit`)} className="shrink-0 font-semibold underline underline-offset-2" style={{ color: WINE }}>Edit listing</a>
 </p>
 <p className="mt-3 text-[30px] font-medium tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)" }}>{money(item.priceCents, item.currency)}</p>
 </div>
 </div>

 {item.status === "sold" && <div className="mt-4"><Notice tone="warn">Sold {item.soldAt ? new Date(item.soldAt).toLocaleString([], { timeStyle: "short", dateStyle: "medium" }) : ""} — this piece is no longer available.</Notice></div>}
 {item.status === "reserved" && data?.openCheckout && <div className="mt-4"><Notice tone="info">A checkout is in progress{data.openCheckout.deviceLabel ? ` on ${data.openCheckout.deviceLabel}` : ""}. <a className="font-semibold underline" href={href(`${B}/checkout/${data.openCheckout.id}`)}>Resume it</a></Notice></div>}
 {item.status === "reserved" && !data?.openCheckout && <div className="mt-4"><Notice tone="warn">Reserved by an online checkout — it frees up automatically if they don’t pay within 10 minutes.</Notice></div>}
 {item.status === "removed" && <div className="mt-4"><Notice tone="warn">This item was removed from sale.</Notice></div>}

 <ActionBar>
 {sellable ? (
 <>
 <BigButton onClick={add} disabled={adding} className="min-h-[64px] text-[17px]"><ShoppingBag size={20} /> {adding ? "Adding…" : `${inCart ? "Update cart" : "Add to cart"} · ${money(item.priceCents, item.currency)}`}</BigButton>
 <BigButton variant="ghost" onClick={() => router.push(href(`${B}/find`))}>Not this item</BigButton>
 </>
 ) : (
 <BigButton onClick={() => router.push(href(`${B}/find`))} className="min-h-[60px]">Find another item</BigButton>
 )}
 </ActionBar>
 </>
 )}
 </MarketPage>
 );
}

export default function ItemPage() {
 return <Suspense fallback={null}><ItemInner /></Suspense>;
}
