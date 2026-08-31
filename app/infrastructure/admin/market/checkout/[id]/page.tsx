"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { B, ActionBar, BigButton, BigLink, MarketPage, Notice, Thumb, api, href, money, usePoll, celebrateSold, type MarketItem } from "../../ui";
import { changeDue } from "@/app/lib/market/sale-core";
import { writeCart } from "../../cart";

type Line = { itemId: string; listCents: number; saleCents: number; item: MarketItem | null };
type Checkout = { id: string; itemId: string; amountCents: number; listCents: number; currency: string; tender: string; status: string; payUrl: string | null; stripePaymentIntent: string | null; expiresAt: string; failureReason: string | null; orderId: string | null; tenderedCents: number | null; changeCents: number | null; receiptEmail: string | null; items: { itemId: string; listCents: number; saleCents: number }[] };
type Resp = { checkout: Checkout; item: MarketItem | null; items: Line[] };
const stillOpen = (d: Resp) => d.checkout.status === "awaiting_payment";

// The Checkout screen is driven ENTIRELY by server state: refresh, back, a second tab, a dead
// battery — none of them can lose or duplicate a sale. It polls while the checkout is open.
function CheckoutInner() {
 const { id } = useParams<{ id: string }>();
 const router = useRouter();
 const [busy, setBusy] = useState<null | "cash" | "cancel" | "keyed">(null);
 const [err, setErr] = useState<string | null>(null);
 const [qr, setQr] = useState<string | null>(null);
 const [tendered, setTendered] = useState<string>(""); // cash handed over, dollars
 const [changeShown, setChangeShown] = useState<number | null>(null);
 const soldOnce = useRef(false);
 const [keyed, setKeyed] = useState<{ clientSecret: string; stripe: Promise<StripeJs | null> } | null>(null);
 const poll = usePoll<Resp>(`/api/store/market/checkout/${id}`, 2500, stillOpen);
 const data = poll.data;
 const open = data?.checkout.status === "awaiting_payment";

 // Render the pay URL as a QR the customer's camera can read from across the table.
 const payUrl = data?.checkout.payUrl ?? null;
 useEffect(() => {
 if (!payUrl) return;
 QRCode.toDataURL(payUrl, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null));
 }, [payUrl]);

 async function share() {
 if (!payUrl) return;
 const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
 if (nav.share) { try { await nav.share({ url: payUrl, title: "Pay" }); } catch { /* dismissed */ } }
 else { await navigator.clipboard?.writeText(payUrl).catch(() => {}); setErr("Link copied."); }
 }

 async function startKeyed() {
 setBusy("keyed"); setErr(null);
 const r = await api<{ clientSecret: string; publishableKey: string | null; stripeAccount: string }>(`/api/store/market/checkout/${id}/keyed`, { method: "POST" });
 setBusy(null);
 if (!r.ok || !r.data.clientSecret || !r.data.publishableKey) { setErr(r.data.error || "Couldn't start card entry"); poll.reload(); return; }
 setKeyed({ clientSecret: r.data.clientSecret, stripe: loadStripe(r.data.publishableKey, { stripeAccount: r.data.stripeAccount }) });
 }

 // The moment it flips to paid: buzz + chime, once.
 useEffect(() => {
 if (data?.checkout.status === "paid" && !soldOnce.current) { soldOnce.current = true; celebrateSold(); }
 }, [data?.checkout.status]);

 // Keep the screen awake while the customer is paying.
 useEffect(() => {
 let lock: { release: () => Promise<void> } | null = null;
 const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
 if (open && nav.wakeLock) nav.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
 return () => { lock?.release().catch(() => {}); };
 }, [open]);

 const tenderedCents = tendered.trim() ? Math.round(Number(tendered) * 100) : null;
 const liveChange = data ? changeDue(data.checkout.amountCents, tenderedCents) : null;
 async function cash() {
 setBusy("cash"); setErr(null);
 if (tenderedCents != null && liveChange == null) { setBusy(null); setErr("That's short of the total."); return; }
 const r = await api<{ changeCents: number | null }>(`/api/store/market/checkout/${id}/cash`, { method: "POST", body: JSON.stringify({ tenderedCents }) });
 setBusy(null);
 if (!r.ok) setErr(r.data.error || "Couldn't record the sale"); else setChangeShown(r.data.changeCents ?? null);
 poll.reload();
 }
 // Forgot something? Release this checkout, keep its lines (and discounts) in the basket, pick more.
 async function addAnother() {
 if (!data) return;
 setBusy("cancel"); setErr(null);
 const r = await api(`/api/store/market/checkout/${id}/cancel`, { method: "POST" });
 setBusy(null);
 if (!r.ok) { setErr(r.data.error || "Couldn't reopen the basket"); return; }
 writeCart(data.items.map((l) => ({ itemId: l.itemId, title: l.item?.title || "Item", image: l.item?.image ?? null, size: l.item?.size ?? null, listCents: l.listCents, saleCents: l.saleCents, discount: l.saleCents === l.listCents ? null : { type: "price", value: l.saleCents } })));
 router.push(href(`${B}/find?add=1`));
 }

 async function cancel() {
 setBusy("cancel"); setErr(null);
 const r = await api<Resp>(`/api/store/market/checkout/${id}/cancel`, { method: "POST" });
 setBusy(null);
 if (!r.ok) setErr(r.data.error || "Couldn't cancel");
 poll.reload();
 }

 const c = data?.checkout; const item = data?.item;
 const WINE = "#5D0F17";
 const bandLabel = !c ? "" : c.status === "awaiting_payment" ? (c.tender === "cash" ? "Checkout · collecting cash" : "Checkout · waiting for payment") : c.status === "paid" ? "Sold" : c.status === "paid_conflict" ? "Needs attention" : c.status === "canceled" ? "Checkout canceled" : c.status === "expired" ? "Hold expired" : "Payment unsuccessful";
 const bandBg = c?.status === "paid" ? "#0b7a5c" : c?.status === "paid_conflict" ? "#b42318" : WINE;
 return (
 <MarketPage className="!pt-0 sm:!pt-0">
 {poll.error && !data && <div className="pt-4"><Notice tone="danger">{poll.error}</Notice></div>}
 {!c && !poll.error && <p className="pt-6 text-center text-[13px] text-stone-400">Loading…</p>}
 {c && (
 <>
 {/* Band: state, amount, item. Colour carries the state — wine while live, green once sold. */}
 <div className="-mx-4 px-5 pb-12 pt-6 text-white transition-colors sm:-mx-6 sm:rounded-b-[28px] sm:px-7 sm:pt-8" style={{ background: bandBg }}>
 <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/70">{bandLabel}</p>
 <p className="mt-2 text-[40px] font-medium leading-none tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{money(c.amountCents, c.currency)}</p>
 {data && data.items.length > 1
 ? <p className="mt-2 text-[13.5px] text-white/85">{data.items.length} items{c.listCents > c.amountCents ? ` · ${money(c.listCents - c.amountCents, c.currency)} off` : ""}</p>
 : <p className="mt-2 text-[13.5px] text-white/85">{item?.title}{item?.size ? ` · ${item.size}` : ""}{c.listCents > c.amountCents ? ` · was ${money(c.listCents, c.currency)}` : ""}</p>}
 </div>

 {/* Sheet */}
 <div className="-mt-6 rounded-[22px] border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.25)]">
 {c.status === "awaiting_payment" && c.tender === "cash" && (
 <div className="py-2">
 <p className="text-center text-[18px] font-semibold text-stone-900">Collect {money(c.amountCents, c.currency)} in cash</p>
 <p className="mt-1 text-center text-[12.5px] text-stone-500">Optional: what did they hand you? We’ll do the change.</p>
 <button onClick={addAnother} disabled={busy !== null} className="mt-1 w-full text-center text-[13px] font-semibold" style={{ color: "#5D0F17" }}>+ Add another item to this sale</button>
 <div className="mt-3 flex items-center gap-2 rounded-2xl border border-stone-200 px-3 focus-within:border-stone-400"><span className="text-[22px] font-semibold text-stone-400">$</span><input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={(c.amountCents / 100).toFixed(2)} className="min-h-[52px] w-full bg-transparent text-[24px] font-semibold outline-none" /></div>
 <div className="mt-2 flex flex-wrap gap-1.5">
 {[c.amountCents, ...[500, 1000, 2000, 5000, 10000].map((n) => Math.ceil(c.amountCents / n) * n)].filter((v, i, a) => v >= c.amountCents && a.indexOf(v) === i).slice(0, 5).map((v) => (
 <button key={v} onClick={() => setTendered((v / 100).toFixed(v % 100 ? 2 : 0))} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-stone-700">{v === c.amountCents ? "Exact" : money(v, c.currency)}</button>
 ))}
 </div>
 {tenderedCents != null && (liveChange != null
 ? <p className="mt-3 text-center text-[15px] text-stone-700">Change due: <b className="text-[20px]" style={{ fontFamily: "var(--font-display)" }}>{money(liveChange, c.currency)}</b></p>
 : <p className="mt-3 text-center text-[13px] text-red-700">That’s {money(c.amountCents - tenderedCents, c.currency)} short.</p>)}
 </div>
 )}
 {c.status === "awaiting_payment" && c.tender !== "cash" && (keyed ? (
 <>
 <p className="text-[16px] font-semibold text-stone-900">Enter the customer’s card</p>
 <div className="mt-3">
 <Elements stripe={keyed.stripe} options={{ clientSecret: keyed.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#1c1917", borderRadius: "12px" } } }}>
 <KeyedForm amountLabel={money(c.amountCents, c.currency)} onDone={() => poll.reload()} />
 </Elements>
 </div>
 <button onClick={() => setKeyed(null)} className="mt-3 w-full text-center text-[13px] text-stone-500 underline">Back to QR</button>
 </>
 ) : (
 <>
 <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
 {qr ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} alt="Scan to pay" className="h-full w-full" /> : <div className="grid h-full place-items-center text-[13px] text-stone-400">{payUrl ? "Drawing code…" : "Starting payment…"}</div>}
 </div>
 <p className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-stone-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400" />Customer scans · Apple Pay · Google Pay · any card</p>
 <button onClick={addAnother} disabled={busy !== null} className="mt-2 w-full text-center text-[13px] font-semibold" style={{ color: "#5D0F17" }}>+ Add another item to this sale</button>
 {poll.error && <div className="mt-3"><Notice tone="warn">{poll.error}</Notice></div>}
 <div className="mt-3 grid grid-cols-2 gap-2">
 <button onClick={share} disabled={!payUrl} className="min-h-[48px] rounded-2xl border border-stone-200 bg-white text-[14px] font-medium text-stone-800">Share link</button>
 <button onClick={startKeyed} disabled={busy !== null} className="min-h-[48px] rounded-2xl border border-stone-200 bg-white text-[14px] font-medium text-stone-800">{busy === "keyed" ? "…" : "Type card"}</button>
 </div>
 </>
 ))}

 {c.status === "paid" && (
 <div className="py-4 text-center">
 <p className="text-[34px]">✓</p>
 <p className="text-[26px] font-medium text-stone-900" style={{ fontFamily: "var(--font-display)" }}>SOLD</p>
 <p className="mt-1 text-[14px] text-stone-600">{c.tender === "cash" ? "Cash" : "Card"} · {money(c.amountCents, c.currency)}{data && data.items.length > 1 ? ` · ${data.items.length} items` : ""}</p>
 {(changeShown ?? c.changeCents) != null && (changeShown ?? c.changeCents)! > 0 && <p className="mt-2 text-[16px] text-stone-900">Change due: <b className="text-[22px]" style={{ fontFamily: "var(--font-display)" }}>{money((changeShown ?? c.changeCents)!, c.currency)}</b></p>}
 {c.receiptEmail && <p className="mt-2 text-[12.5px] text-stone-500">Receipt sent to {c.receiptEmail}</p>}
 {data && data.items.length > 1 && (
 <ul className="mx-auto mt-3 max-w-[320px] divide-y divide-stone-100 text-left text-[13px]">
 {data.items.map((l) => <li key={l.itemId} className="flex items-center gap-2 py-1.5"><Thumb src={l.item?.image ?? null} alt="" size={28} /><span className="min-w-0 flex-1 truncate">{l.item?.title}</span><span className="font-medium">{money(l.saleCents, c.currency)}</span></li>)}
 </ul>
 )}
 <p className="mt-3 text-[15px] font-medium text-stone-900">Hand {data && data.items.length > 1 ? "the items" : "the item"} to the customer.</p>
 </div>
 )}
 {c.status === "paid_conflict" && <Notice tone="danger">Payment received but this item had already sold elsewhere. No sale was recorded here — the payment is being refunded; check Sales today.</Notice>}
 {(c.status === "canceled" || c.status === "expired" || c.status === "failed") && (
 <div className="py-4 text-center">
 <p className="text-[18px] font-semibold text-stone-900">{c.status === "canceled" ? "Nothing was charged" : c.status === "expired" ? "The hold ran out" : "Payment unsuccessful"}</p>
 <p className="mt-1 text-[13.5px] text-stone-500">No inventory changes were made. The item is available again.</p>
 </div>
 )}
 {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
 </div>

 <ActionBar>
 {c.status === "awaiting_payment" && (c.tender === "cash" ? (
 <>
 <BigButton onClick={cash} disabled={busy !== null} className="min-h-[64px] text-[17px]">{busy === "cash" ? "Recording…" : "Cash received — mark sold"}</BigButton>
 <BigButton variant="ghost" onClick={cancel} disabled={busy !== null}>{busy === "cancel" ? "…" : "Cancel"}</BigButton>
 </>
 ) : (
 <div className="grid grid-cols-2 gap-2">
 <BigButton variant="secondary" onClick={cash} disabled={busy !== null}>{busy === "cash" ? "…" : "Paid in cash"}</BigButton>
 <BigButton variant="ghost" onClick={cancel} disabled={busy !== null}>{busy === "cancel" ? "…" : "Cancel"}</BigButton>
 </div>
 ))}
 {c.status === "paid" && <BigLink href={href(`${B}/find`)} className="min-h-[64px] text-[17px]">Done — next customer</BigLink>}
 {(c.status === "canceled" || c.status === "expired" || c.status === "failed") && (
 <div className="grid grid-cols-2 gap-2">
 <BigButton onClick={() => router.push(href(`${B}/item/${c.itemId}`))}>Try again</BigButton>
 <BigLink variant="secondary" href={href(B)}>Home</BigLink>
 </div>
 )}
 {c.status === "paid_conflict" && <BigLink variant="secondary" href={href(`${B}/sales`)}>Go to Sales today</BigLink>}
 </ActionBar>
 </>
 )}
 </MarketPage>
 );
}

// The seller types the customer's card. Confirms on the connected account; the same webhook / poll
// finalizes the sale — this form never marks anything sold itself.
function KeyedForm({ amountLabel, onDone }: { amountLabel: string; onDone: () => void }) {
 const stripe = useStripe();
 const elements = useElements();
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 async function submit(e: React.FormEvent) {
 e.preventDefault();
 if (!stripe || !elements) return;
 setBusy(true); setErr(null);
 const { error } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
 setBusy(false);
 if (error) { setErr(error.message || "Card declined."); return; }
 onDone();
 }
 return (
 <form onSubmit={submit}>
 <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }} />
 {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
 <button type="submit" disabled={!stripe || busy} className="mt-4 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-stone-900 text-[16px] font-semibold text-white disabled:bg-stone-300">{busy ? "Charging…" : `Charge ${amountLabel}`}</button>
 </form>
 );
}

export default function CheckoutPage() {
 return <Suspense fallback={null}><CheckoutInner /></Suspense>;
}
