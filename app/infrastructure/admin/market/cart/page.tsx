"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { B, ActionBar, BigButton, MarketPage, Notice, Thumb, api, href, money, newClientKey } from "../ui";
import { writeCart, clearCart, enqueueCash, getActiveCartId, setActiveCartId, type UiLine } from "../cart";
import { applyDiscount, cartTotals, type Discount } from "@/app/lib/market/sale-core";

const WINE = "#5D0F17";

type ServerCart = { id: string; number: number; status: string; lines: UiLine[]; createdAt: string; updatedAt: string };
type OpenCheckout = { id: string; itemId: string; amountCents: number; createdAt: string };

// Carts: one per customer being served. They live on the server, so three people at the stall means
// three carts that survive a closed tab and follow you to another device. Each line keeps its own
// per-sale discount; ONE payment closes ONE cart.
function CartInner() {
 const router = useRouter();
 const [carts, setCarts] = useState<ServerCart[]>([]);
 const [activeId, setActiveId] = useState<string | null>(null);
 const [cart, setCart] = useState<UiLine[]>([]);
 const [ready, setReady] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [editing, setEditing] = useState<string | null>(null); // itemId whose price is being edited
 const [saleFor, setSaleFor] = useState<string | null>(null); // itemId getting a custom sale price
 const [saleDraft, setSaleDraft] = useState("");
 const [priceDraft, setPriceDraft] = useState("");
 const [busy, setBusy] = useState<null | "cash" | "card" | "price" | "new">(null);
 const [savedOffline, setSavedOffline] = useState<{ amountCents: number; count: number } | null>(null);
 const [open, setOpen] = useState<OpenCheckout[]>([]);
 // Writes in flight. A refresh that lands mid-save would show the server's older copy and wipe what
 // the seller just added, so we simply don't apply server data while a save is outstanding.
 const pending = useRef(0);

 // Point this device at a cart: it becomes the one "Add to cart" fills, and the one the pill counts.
 const select = useCallback((c: ServerCart | null) => {
 setActiveId(c?.id ?? null);
 setActiveCartId(c?.id ?? null);
 setCart(c?.lines ?? []);
 writeCart(c?.lines ?? []); // local mirror keeps the header pill instant
 }, []);

 const loadCarts = useCallback(async () => {
 if (pending.current > 0) return; // a save is still on its way up — don't overwrite it
 const r = await api<{ carts: ServerCart[] }>("/api/store/market/carts");
 if (!r.ok) { setReady(true); return; }
 if (pending.current > 0) return; // ...or landed while we were waiting
 const list = r.data.carts;
 setCarts(list);
 const wanted = getActiveCartId();
 select(list.find((c) => c.id === wanted) ?? list[0] ?? null);
 setReady(true);
 }, [select]);

 // Poll: a cart opened on another phone shows up here, and a save that landed after our first read
 // (a cold API route can take seconds) still arrives instead of leaving the screen looking empty.
 useEffect(() => {
 void Promise.resolve().then(() => { void loadCarts(); });
 const t = setInterval(() => { void loadCarts(); }, 4000);
 return () => clearInterval(t);
 }, [loadCarts]);

 // Checkouts already handed to the server and waiting on payment — they outlive this tab entirely.
 useEffect(() => {
 const load = () => { api<{ inProgress: OpenCheckout[] }>("/api/store/market/home").then((r) => { if (r.ok) setOpen(r.data.inProgress); }); };
 load();
 const t = setInterval(load, 5000);
 return () => clearInterval(t);
 }, []);

 const totals = cartTotals(cart);

 // Every line change writes through: local mirror for instant UI, server so the cart survives.
 const persist = (next: UiLine[]) => {
 setCart(next); writeCart(next);
 setCarts((cs) => cs.map((c) => (c.id === activeId ? { ...c, lines: next } : c)));
 if (activeId) {
 pending.current += 1;
 void api(`/api/store/market/carts/${activeId}`, { method: "PATCH", body: JSON.stringify({ lines: next }) }).finally(() => { pending.current -= 1; });
 }
 };
 const setDiscount = (itemId: string, d: Discount) => persist(cart.map((l) => (l.itemId === itemId ? { ...l, discount: d, saleCents: applyDiscount(l.listCents, d) } : l)));
 const remove = (itemId: string) => persist(cart.filter((l) => l.itemId !== itemId));

 async function newCart() {
 setBusy("new"); setErr(null);
 const r = await api<{ cart: ServerCart }>("/api/store/market/carts", { method: "POST" });
 setBusy(null);
 if (!r.ok) { setErr(r.data.error || "Couldn't open a cart"); return; }
 setCarts((cs) => [...cs, r.data.cart]);
 select(r.data.cart);
 }

 async function saveListPrice(itemId: string) {
 const cents = Math.round(Number(priceDraft) * 100);
 if (!(cents > 0)) { setErr("Enter a price."); return; }
 setBusy("price"); setErr(null);
 const r = await api(`/api/store/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ price: cents / 100 }) });
 setBusy(null);
 if (!r.ok) { setErr(r.data.error || "Couldn't save price"); return; }
 persist(cart.map((l) => (l.itemId === itemId ? { ...l, listCents: cents, saleCents: applyDiscount(cents, l.discount) } : l)));
 setEditing(null);
 }

 // This cart is done with — paid off, or cleared by the seller. Drop it and fall back to the next.
 async function finish(id: string, status: "paid" | "dropped") {
 await api(`/api/store/market/carts/${id}?status=${status}`, { method: "DELETE" });
 const rest = carts.filter((c) => c.id !== id);
 setCarts(rest);
 clearCart();
 select(rest[0] ?? null);
 }

 // No signal? A cash sale is still a sale: keep it on the phone and replay it the moment we're back.
 function stashOffline(clientKey: string) {
 enqueueCash({ clientKey, lines: cart.map((l) => ({ itemId: l.itemId, saleCents: l.saleCents, title: l.title })), amountCents: totals.saleCents, tenderedCents: null, at: new Date().toISOString() });
 setSavedOffline({ amountCents: totals.saleCents, count: cart.length });
 if (activeId) void finish(activeId, "paid");
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
 setErr(r.data.code === "payments_disabled" ? "Card payments are off — finish Stripe setup in Payments, or take cash." : r.data.error || "Couldn't start checkout"); return;
 }
 const checkoutId = r.data.checkout.id;
 if (activeId) await finish(activeId, "paid");
 router.push(href(`${B}/checkout/${checkoutId}`));
 }

 const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${on ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-700"}`;
 const active = carts.find((c) => c.id === activeId) ?? null;
 return (
 <MarketPage title={active ? `Cart ${active.number}` : "Cart"} back={`${B}/find`}>
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 {savedOffline && (
 <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
 <p className="text-[26px] font-medium text-emerald-900" style={{ fontFamily: "var(--font-display)" }}>Saved offline</p>
 <p className="mt-1 text-[15px] text-emerald-900">Cash · {money(savedOffline.amountCents)}{savedOffline.count > 1 ? ` · ${savedOffline.count} items` : ""}</p>
 <p className="mt-3 text-[13.5px] text-emerald-900/80">No signal right now. Hand over the item — this sale is stored on your phone and records itself as soon as you’re back online.</p>
 <a href={href(`${B}/find`)} className="mt-4 inline-block rounded-2xl bg-stone-900 px-6 py-3 text-[15px] font-semibold text-white">Next customer</a>
 </div>
 )}

 {!savedOffline && (
 <>
 {/* Cart switcher — one chip per customer you're serving, plus a door to a fresh one. */}
 <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
 {carts.map((c) => {
 const on = c.id === activeId;
 return (
 <button key={c.id} onClick={() => select(c)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[13.5px] font-semibold ${on ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-700"}`} style={on ? { background: WINE } : undefined}>
 Cart {c.number}
 <span className={`rounded-full px-2 text-[11.5px] ${on ? "bg-white/20" : "bg-stone-100 text-stone-500"}`}>{c.lines.length ? money(cartTotals(c.lines).saleCents) : "empty"}</span>
 </button>
 );
 })}
 <button onClick={newCart} disabled={busy === "new"} className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-stone-300 bg-white px-4 py-2 text-[13.5px] font-semibold text-stone-600">
 <Plus size={15} /> {busy === "new" ? "…" : "New"}
 </button>
 </div>

 {open.length > 0 && (
 <section className="mb-4">
 <p className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Awaiting payment</p>
 <div className="space-y-2">
 {open.map((k) => (
 <a key={k.id} href={href(`${B}/checkout/${k.id}`)} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px]" style={{ background: "rgba(93,15,23,.08)", color: "#1c1917" }}>
 <span>
 <b className="font-semibold">{money(k.amountCents)}</b> awaiting payment
 <span className="block text-[11.5px] text-stone-500">Started {new Date(k.createdAt).toLocaleTimeString([], { timeStyle: "short" })}</span>
 </span>
 <span className="ml-auto shrink-0 font-semibold" style={{ color: WINE }}>Resume ›</span>
 </a>
 ))}
 </div>
 </section>
 )}

 {ready && carts.length === 0 && (
 <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center">
 <p className="text-[17px] font-semibold text-stone-900">No carts open</p>
 <p className="mt-1 text-[13.5px] text-stone-500">Start one for the customer you’re serving, then add their items.</p>
 <button onClick={newCart} disabled={busy === "new"} className="mt-4 inline-block rounded-2xl bg-stone-900 px-6 py-3 text-[15px] font-semibold text-white">{busy === "new" ? "…" : "New cart"}</button>
 </div>
 )}

 {ready && active && cart.length === 0 && (
 <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center">
 <p className="text-[17px] font-semibold text-stone-900">Cart {active.number} is empty</p>
 <p className="mt-1 text-[13.5px] text-stone-500">Find an item and add it to this cart.</p>
 <a href={href(`${B}/find`)} className="mt-4 inline-block rounded-2xl bg-stone-900 px-6 py-3 text-[15px] font-semibold text-white">Find item</a>
 </div>
 )}

 {cart.length > 0 && (
 <>
 <div className="rounded-3xl border border-stone-200 bg-white">
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
 <button onClick={() => remove(l.itemId)} aria-label="Remove" className="ml-1 grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100"><X size={16} /></button>
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
 <BigButton onClick={() => start("qr")} disabled={totals.saleCents <= 0 || busy !== null || editing !== null} className="min-h-[64px] text-[17px]">{busy === "card" ? "Starting…" : `Card · ${money(totals.saleCents)}`}</BigButton>
 <div className="grid grid-cols-2 gap-2">
 <BigButton variant="secondary" onClick={() => start("cash")} disabled={totals.saleCents <= 0 || busy !== null || editing !== null}>{busy === "cash" ? "…" : "Cash"}</BigButton>
 <BigButton variant="ghost" onClick={() => { if (activeId) void finish(activeId, "dropped"); }}>Clear cart</BigButton>
 </div>
 </ActionBar>
 </>
 )}
 </>
 )}
 </MarketPage>
 );
}

export default function CartPage() {
 return <Suspense fallback={null}><CartInner /></Suspense>;
}
