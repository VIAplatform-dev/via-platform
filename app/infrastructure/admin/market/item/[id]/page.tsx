"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { B, ActionBar, BigButton, MarketPage, Notice, StatusChip, Thumb, api, href, money, newClientKey, type MarketItem } from "../../ui";
import { readCart, writeCart, addToCart, clearCart, enqueueCash, type UiLine } from "../../cart";
import { applyDiscount, cartTotals, type Discount } from "@/app/lib/market/sale-core";

type Resp = { item: MarketItem; openCheckout: { id: string; createdAt: string; deviceLabel: string | null } | null };
const WINE = "#5D0F17";

// Confirm = the basket. The item in the URL is added to it; more can be added from Find. Each line
// can take a per-sale discount that never touches the listing. One payment for everything.
function ItemInner() {
 const { id } = useParams<{ id: string }>();
 const router = useRouter();
 const [data, setData] = useState<Resp | null>(null);
 const [err, setErr] = useState<string | null>(null);
 const [cart, setCart] = useState<UiLine[]>([]);
 const [editing, setEditing] = useState<string | null>(null); // itemId whose price is being edited
 const [saleFor, setSaleFor] = useState<string | null>(null); // itemId getting a custom sale price (bottom sheet)
 const [saleDraft, setSaleDraft] = useState("");
 const [priceDraft, setPriceDraft] = useState("");
 const [busy, setBusy] = useState<null | "cash" | "card" | "price">(null);
 const [savedOffline, setSavedOffline] = useState<{ amountCents: number; count: number } | null>(null);

 const load = async () => {
 const r = await api<Resp>(`/api/store/market/item/${id}`);
 if (!r.ok) { setErr(r.data.error || "Not found"); return; }
 setData(r.data);
 const it = r.data.item;
 // Put (or refresh) this item in the basket, keeping any discount already chosen for it.
 const prev = readCart().find((l) => l.itemId === it.id);
 const discount = prev?.discount ?? null;
 if (it.status === "active" || it.status === "draft") {
 setCart(addToCart({ itemId: it.id, title: it.title, image: it.image, size: it.size, listCents: it.priceCents, saleCents: applyDiscount(it.priceCents, discount), discount }));
 } else setCart(readCart());
 };
 useEffect(() => { (async () => { await load(); })(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

 const item = data?.item;
 const inBasket = cart.some((l) => l.itemId === id); // false when this item can't be sold (sold/reserved/removed)
 const totals = cartTotals(cart);
 const setDiscount = (itemId: string, d: Discount) => {
 const next = cart.map((l) => (l.itemId === itemId ? { ...l, discount: d, saleCents: applyDiscount(l.listCents, d) } : l));
 setCart(next); writeCart(next);
 };
 const remove = (itemId: string) => { const next = cart.filter((l) => l.itemId !== itemId); setCart(next); writeCart(next); if (itemId === id && next.length) router.push(href(`${B}/item/${next[0].itemId}`)); };

 async function saveListPrice(itemId: string) {
 const cents = Math.round(Number(priceDraft) * 100);
 if (!(cents > 0)) { setErr("Enter a price."); return; }
 setBusy("price"); setErr(null);
 const r = await api(`/api/store/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ price: cents / 100 }) });
 setBusy(null);
 if (!r.ok) { setErr(r.data.error || "Couldn't save price"); return; }
 const next = cart.map((l) => (l.itemId === itemId ? { ...l, listCents: cents, saleCents: applyDiscount(cents, l.discount) } : l));
 setCart(next); writeCart(next); setEditing(null); await load();
 }

 // No signal? A cash sale is still a sale: keep it on the phone and replay it the moment we're back.
 function stashOffline(clientKey: string) {
 enqueueCash({ clientKey, lines: cart.map((l) => ({ itemId: l.itemId, saleCents: l.saleCents, title: l.title })), amountCents: totals.saleCents, tenderedCents: null, at: new Date().toISOString() });
 setSavedOffline({ amountCents: totals.saleCents, count: cart.length });
 clearCart();
 }

 async function start(tender: "cash" | "qr") {
 if (!cart.length) return;
 setBusy(tender === "cash" ? "cash" : "card"); setErr(null);
 const lines = cart.map((l) => ({ itemId: l.itemId, saleCents: l.saleCents }));
 const clientKey = newClientKey();
 if (tender === "cash" && typeof navigator !== "undefined" && !navigator.onLine) { setBusy(null); stashOffline(clientKey); return; }
 let r: Awaited<ReturnType<typeof api<{ checkout: { id: string } }>>>;
 try { r = await api<{ checkout: { id: string } }>("/api/store/market/checkout", { method: "POST", body: JSON.stringify({ lines, clientKey, tender }) }); }
 catch { setBusy(null); if (tender === "cash") { stashOffline(clientKey); return; } setErr("No connection — card payments need signal. Take cash, or try again."); return; }
 setBusy(null);
 if (!r.ok) {
 const holder = (r.data as unknown as { holder?: string | null }).holder;
 if (r.data.code === "in_progress" && holder) { router.push(href(`${B}/checkout/${holder}`)); return; }
 setErr(r.data.code === "payments_disabled" ? "Card payments are off — finish Stripe setup in Payments, or take cash." : r.data.error || "Couldn't start checkout"); await load(); return;
 }
 clearCart();
 router.push(href(`${B}/checkout/${r.data.checkout.id}`));
 }

 const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${on ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-700"}`;
 return (
 <MarketPage title={cart.length > 1 ? `Confirm ${cart.length} items` : "Confirm item"} back={`${B}/find`}>
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 {savedOffline && (
 <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
 <p className="text-[26px] font-medium text-emerald-900" style={{ fontFamily: "var(--font-display)" }}>Saved offline</p>
 <p className="mt-1 text-[15px] text-emerald-900">Cash · {money(savedOffline.amountCents)}{savedOffline.count > 1 ? ` · ${savedOffline.count} items` : ""}</p>
 <p className="mt-3 text-[13.5px] text-emerald-900/80">No signal right now. Hand over the item — this sale is stored on your phone and records itself as soon as you’re back online.</p>
 <a href={href(`${B}/find`)} className="mt-4 inline-block rounded-2xl bg-stone-900 px-6 py-3 text-[15px] font-semibold text-white">Next customer</a>
 </div>
 )}
 {!item && !err && !savedOffline && <p className="text-[13px] text-stone-400">Loading…</p>}
 {item && !savedOffline && (
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
 </div>
 </div>

 {item.status === "sold" && <div className="mt-4"><Notice tone="warn">Sold {item.soldAt ? new Date(item.soldAt).toLocaleString([], { timeStyle: "short", dateStyle: "medium" }) : ""} — this piece is no longer available.</Notice></div>}
 {item.status === "reserved" && data?.openCheckout && <div className="mt-4"><Notice tone="info">A checkout is in progress{data.openCheckout.deviceLabel ? ` on ${data.openCheckout.deviceLabel}` : ""}. <a className="font-semibold underline" href={href(`${B}/checkout/${data.openCheckout.id}`)}>Resume it</a></Notice></div>}
 {item.status === "reserved" && !data?.openCheckout && <div className="mt-4"><Notice tone="warn">Reserved by an online checkout — it frees up automatically if they don’t pay within 10 minutes.</Notice></div>}
 {item.status === "removed" && <div className="mt-4"><Notice tone="warn">This item was removed from sale.</Notice></div>}

 {/* Basket: every line with its price and a per-sale discount. Hidden when THIS item isn't in it —
 a sold item's page must never look like it can be checked out. */}
 {inBasket && cart.length > 0 && (
 <div className="mt-4 rounded-3xl border border-stone-200 bg-white">
 {cart.map((l, i) => (
 <div key={l.itemId} className={`p-4 ${i > 0 ? "border-t border-stone-100" : ""}`}>
 <div className="flex items-center gap-3">
 <Thumb src={l.image} alt={l.title} size={44} />
 <div className="min-w-0 flex-1">
 <p className="truncate text-[14px] font-medium text-stone-900">{l.title}</p>
 <p className="text-[12px] text-stone-500">{l.size ? `Size ${l.size}` : ""}</p>
 </div>
 <div className="text-right">
 {editing === l.itemId ? (
 <span className="flex items-center gap-1"><span className="text-stone-400">$</span><input autoFocus inputMode="decimal" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-[16px] font-semibold outline-none" /><button onClick={() => saveListPrice(l.itemId)} disabled={busy === "price"} className="rounded-lg bg-stone-900 px-2 py-1.5 text-[12px] font-semibold text-white">Save</button></span>
 ) : (
 <button onClick={() => { setEditing(l.itemId); setPriceDraft((l.listCents / 100).toFixed(l.listCents % 100 ? 2 : 0)); }} className="text-right">
 {l.saleCents !== l.listCents && <span className="mr-1.5 text-[13px] text-stone-400 line-through">{money(l.listCents)}</span>}
 <span className="text-[20px] font-semibold text-stone-900" style={{ fontFamily: "var(--font-display)" }}>{money(l.saleCents)}</span>
 <span className="block text-[10.5px] text-stone-400">list price · tap to change</span>
 </button>
 )}
 </div>
 {cart.length > 1 && <button onClick={() => remove(l.itemId)} aria-label="Remove" className="ml-1 grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100"><X size={16} /></button>}
 </div>
 {/* Per-sale discount — this checkout only; the listing keeps its price. */}
 <div className="mt-2.5 flex flex-wrap gap-1.5">
 <button onClick={() => setDiscount(l.itemId, null)} className={chip(!l.discount)} style={!l.discount ? { background: "#1c1917" } : undefined}>Full price</button>
 {[10, 20, 30].map((p) => <button key={p} onClick={() => setDiscount(l.itemId, { type: "percent", value: p })} className={chip(l.discount?.type === "percent" && l.discount.value === p)} style={l.discount?.type === "percent" && l.discount.value === p ? { background: WINE } : undefined}>−{p}%</button>)}
 <button onClick={() => { setSaleFor(l.itemId); setSaleDraft((l.saleCents / 100).toFixed(l.saleCents % 100 ? 2 : 0)); }} className={chip(l.discount?.type === "price")} style={l.discount?.type === "price" ? { background: WINE } : undefined}>{l.discount?.type === "price" ? `Sale ${money(l.saleCents)}` : "Sale price…"}</button>
 </div>
 </div>
 ))}
 <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3">
 <a href={href(`${B}/find?add=1`)} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: WINE }}><Plus size={16} /> Add another item</a>
 <div className="text-right">
 {totals.discountCents > 0 && <p className="text-[11.5px] text-stone-400">{money(totals.listCents)} − {money(totals.discountCents)} off</p>}
 <p className="text-[22px] font-semibold text-stone-900" style={{ fontFamily: "var(--font-display)" }}>{money(totals.saleCents)}</p>
 </div>
 </div>
 </div>
 )}

 {/* Custom sale price — an in-page sheet (browser prompt() doesn't exist on phones). */}
 {saleFor && (() => { const l = cart.find((x) => x.itemId === saleFor); if (!l) return null; const cents = Math.round(Number(saleDraft) * 100); const valid = Number.isFinite(cents) && cents >= 0 && cents <= l.listCents; return (
 <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={() => setSaleFor(null)}>
 <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Sale price · this customer only</p>
 <p className="mt-1 truncate text-[15px] font-medium text-stone-900">{l.title}</p>
 <p className="text-[12.5px] text-stone-500">Listed at {money(l.listCents)} — the listing keeps its price.</p>
 <div className="mt-3 flex items-center gap-2 rounded-2xl border border-stone-300 px-3 focus-within:border-stone-900"><span className="text-[26px] font-semibold text-stone-400">$</span><input autoFocus inputMode="decimal" value={saleDraft} onChange={(e) => setSaleDraft(e.target.value)} className="min-h-[60px] w-full bg-transparent text-[30px] font-semibold outline-none" placeholder="0" /></div>
 {!valid && saleDraft.trim() && <p className="mt-1.5 text-[12.5px] text-red-700">{cents > l.listCents ? "That’s above the list price." : "Enter a valid amount."}</p>}
 <div className="mt-3 flex flex-wrap gap-1.5">
 {[5, 10, 20].map((d) => l.listCents - d * 100 > 0 && <button key={d} onClick={() => setSaleDraft(((l.listCents - d * 100) / 100).toFixed(l.listCents % 100 ? 2 : 0))} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-stone-700">−${d}</button>)}
 <button onClick={() => setSaleDraft((Math.floor(l.listCents / 1000) * 10).toFixed(0))} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-stone-700">Round down</button>
 </div>
 <div className="mt-4 grid grid-cols-2 gap-2">
 <BigButton variant="secondary" onClick={() => setSaleFor(null)}>Cancel</BigButton>
 <BigButton disabled={!valid} onClick={() => { setDiscount(l.itemId, cents === l.listCents ? null : { type: "price", value: cents }); setSaleFor(null); }}>Set {valid ? money(cents) : "price"}</BigButton>
 </div>
 </div>
 </div>
 ); })()}

 <ActionBar>
 {!inBasket ? (
 <>
 <BigButton onClick={() => router.push(href(`${B}/find`))} className="min-h-[60px]">Find another item</BigButton>
 {cart.length > 0 && <BigButton variant="secondary" onClick={() => router.push(href(`${B}/item/${cart[0].itemId}`))}>Go to basket ({cart.length})</BigButton>}
 </>
 ) : (<>
 <BigButton onClick={() => start("qr")} disabled={!cart.length || totals.saleCents <= 0 || busy !== null || editing !== null} className="min-h-[64px] text-[17px]">{busy === "card" ? "Starting…" : cart.length > 1 ? `Card · ${cart.length} items · ${money(totals.saleCents)}` : "Card"}</BigButton>
 <div className="grid grid-cols-2 gap-2">
 <BigButton variant="secondary" onClick={() => start("cash")} disabled={!cart.length || totals.saleCents <= 0 || busy !== null || editing !== null}>{busy === "cash" ? "…" : "Cash"}</BigButton>
 <BigButton variant="ghost" onClick={() => { clearCart(); setCart([]); router.push(href(`${B}/find`)); }}>{cart.length > 1 ? "Clear basket" : "Not this item"}</BigButton>
 </div>
 </>)}
 </ActionBar>
 </>
 )}
 </MarketPage>
 );
}

export default function ItemPage() {
 return <Suspense fallback={null}><ItemInner /></Suspense>;
}
