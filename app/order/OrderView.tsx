/* eslint-disable @next/next/no-img-element */
import { SERIF_FONTS } from "@/app/lib/storefront-templates";
import { formatPrice } from "@/app/lib/formatPrice";
import type { BuyerOrderView } from "@/app/lib/buyer-order";

const ff = (n?: string) => (n ? `'${n}', ${SERIF_FONTS.has(n) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);
const STOREFRONT_BASE = "https://vyaplatform.com";

function fontsHref(fams: (string | undefined)[]): string | null {
 const q = Array.from(new Set(fams.filter(Boolean))).map((f) => `family=${(f as string).replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
 return q ? `https://fonts.googleapis.com/css2?${q}&display=swap` : null;
}

/**
 * The buyer's order card — store-branded, no third-party app. Shown on the checkout success page
 * (mode="confirmation") and on the persistent, revisitable status page (mode="status"). Deliberately
 * keeps the shopper with the STORE — "Continue shopping" points back to their storefront, never a
 * competing marketplace app.
 */
export default function OrderView({ v, mode }: { v: BuyerOrderView; mode: "confirmation" | "status" }) {
 const heading = ff(v.fonts.heading);
 const body = ff(v.fonts.body);
 const c = v.colors;
 // `amountCents` is the ITEM total, with shipping held separately — the refund path proves it:
 // it charges back `amountCents + shippingPaidCents` as the full amount. Subtracting shipping OUT of
 // it made the confirmation page under-report both lines: a buyer who paid $333 for a $325 bag plus
 // $8 shipping was shown "Subtotal $317 · Shipping $8 · Total $325".
 const subtotal = v.amountCents;
 const total = v.amountCents + v.shippingPaidCents;
 const price = (cents: number) => formatPrice(cents / 100, v.currency);

 const cancelled = v.status === "cancelled" || v.status === "refunded";
 const shipped = ["shipped", "delivered", "fulfilled"].includes(v.status) || !!v.trackingNumber;
 const delivered = v.status === "delivered";
 const activeIdx = delivered ? 2 : shipped ? 1 : 0;
 // Collecting in store: nothing is posted, so "shipped / on its way / tracking" would be a lie.
 const collecting = !!v.collect;
 const steps = collecting
 ? [
 { label: "Confirmed", note: "We're setting your piece aside for you." },
 { label: "Ready to collect", note: `Come by ${v.storeName} and ask for it.` },
 { label: "Collected", note: "Enjoy your piece." },
 ]
 : [
 { label: "Confirmed", note: "We're preparing your order for shipping." },
 { label: "Shipped", note: v.trackingNumber ? `Tracking ${v.trackingNumber}` : "On its way to you." },
 { label: "Delivered", note: "Enjoy your piece." },
 ];

 // Soft ETA ~10 days from payment — labelled "estimated", not a promise. Meaningless for a
 // collection: it's ready when the store says so, not ten days from now.
 const eta = !collecting && v.paidAt ? new Date(v.paidAt.getTime() + 10 * 86_400_000) : null;
 const etaStr = eta ? eta.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : null;

 const shopHref = v.handle ? `${STOREFRONT_BASE}/s/${v.handle}` : "#";
 const border = `${c.text}1f`;
 const faint = `${c.text}0a`;

 return (
 <main style={{ background: c.bg, color: c.text, fontFamily: body }} className="min-h-screen">
 {fontsHref([v.fonts.heading, v.fonts.body]) && <link rel="stylesheet" href={fontsHref([v.fonts.heading, v.fonts.body])!} />}

 <header className="border-b px-6 py-5 text-center sm:py-6" style={{ borderColor: border }}>
 <a href={shopHref} className="text-lg tracking-[0.14em]" style={{ fontFamily: heading }}>{v.storeName}</a>
 </header>

 <div className="mx-auto max-w-xl px-5 py-10 sm:px-6 sm:py-14">
 {/* Heading */}
 <div className="text-center">
 {mode === "confirmation" && (
 <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full text-white" style={{ background: c.accent }} aria-hidden>✓</div>
 )}
 <h1 className="text-2xl sm:text-[2rem] leading-tight" style={{ fontFamily: heading }}>
 {mode === "confirmation" ? "Thank you for your order" : `Order #${v.orderNo}`}
 </h1>
 <p className="mt-2 text-sm opacity-65">
 {mode === "confirmation" ? <>Order #{v.orderNo}{v.buyerEmail ? <> · confirmation sent to {v.buyerEmail}</> : null}</> : (cancelled ? `This order was ${v.status}.` : "Here's the latest on your order.")}
 </p>
 </div>

 {/* Status */}
 <section className="mt-9 rounded-2xl border p-5 sm:p-6" style={{ borderColor: border }}>
 {cancelled ? (
 <p className="text-sm">This order was <span className="font-semibold capitalize">{v.status}</span>. If you have questions, just reply to your confirmation email.</p>
 ) : (
 <>
 {etaStr && !delivered && <p className="mb-4 text-[15px] font-semibold" style={{ fontFamily: heading }}>Estimated delivery · {etaStr}</p>}
 <ol className="space-y-4">
 {steps.map((s, i) => {
 const done = i <= activeIdx;
 const current = i === activeIdx;
 return (
 <li key={s.label} className="flex gap-3">
 <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] text-white" style={{ background: done ? c.accent : "transparent", border: done ? "none" : `1.5px solid ${c.text}33`, color: done ? "#fff" : "transparent" }}>{done ? "✓" : ""}</span>
 <div className="min-w-0" style={{ opacity: done ? 1 : 0.4 }}>
 <p className="text-sm font-semibold">{s.label}</p>
 {current && <p className="mt-0.5 text-[13px] opacity-70">{s.note}</p>}
 </div>
 </li>
 );
 })}
 </ol>
 {v.trackingUrl && (
 <a href={v.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block rounded-lg px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition hover:opacity-90" style={{ background: c.accent }}>Track your package →</a>
 )}
 </>
 )}
 </section>

 {/* Item + totals */}
 <section className="mt-4 rounded-2xl border p-5 sm:p-6" style={{ borderColor: border }}>
 <div className="flex items-center gap-4">
 <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ background: faint }}>
 {v.itemImage && <img src={v.itemImage} alt="" className="h-full w-full object-cover" />}
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium leading-snug">{v.itemTitle}</p>
 </div>
 <p className="text-sm">{price(subtotal)}</p>
 </div>
 <div className="mt-5 space-y-1.5 border-t pt-4 text-sm" style={{ borderColor: border }}>
 <div className="flex justify-between opacity-70"><span>Subtotal</span><span>{price(subtotal)}</span></div>
 <div className="flex justify-between opacity-70"><span>Shipping</span><span>{collecting ? "Collecting in store" : v.shippingPaidCents > 0 ? price(v.shippingPaidCents) : "Free"}</span></div>
 <div className="flex justify-between pt-1.5 text-base font-semibold"><span>Total</span><span>{price(total)}</span></div>
 </div>
 </section>

 {/* Where it's going — or where to go and get it */}
 {collecting ? (
 <section className="mt-4 rounded-2xl border p-5 sm:p-6 text-sm" style={{ borderColor: border }}>
 <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">Collect from</p>
 <div className="mt-2 leading-relaxed opacity-80">
 <p className="font-medium" style={{ opacity: 1 }}>{v.collect?.address || v.storeName}</p>
 {v.collect?.instructions && <p className="mt-1.5">{v.collect.instructions}</p>}
 </div>
 </section>
 ) : (v.ship.line1 || v.buyerName) && (
 <section className="mt-4 rounded-2xl border p-5 sm:p-6 text-sm" style={{ borderColor: border }}>
 <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">Ship to</p>
 <div className="mt-2 leading-relaxed opacity-80">
 {v.buyerName && <p className="font-medium" style={{ opacity: 1 }}>{v.buyerName}</p>}
 {v.ship.line1 && <p>{v.ship.line1}</p>}
 {v.ship.line2 && <p>{v.ship.line2}</p>}
 <p>{[v.ship.city, v.ship.state, v.ship.postal].filter(Boolean).join(", ")}</p>
 {v.ship.country && <p>{v.ship.country}</p>}
 </div>
 </section>
 )}

 {/* Actions — always back to the STORE, never a third-party app */}
 <div className="mt-8 flex flex-col items-center gap-3">
 <a href={shopHref} className="w-full rounded-lg border py-3.5 text-center text-[12px] font-semibold uppercase tracking-[0.16em] transition hover:opacity-80" style={{ borderColor: c.accent, color: c.accent }}>Continue shopping at {v.storeName}</a>
 {mode === "confirmation" && v.token && (
 <a href={`${STOREFRONT_BASE}/order/${v.token}`} className="text-[13px] underline opacity-60 hover:opacity-100">View or track this order anytime →</a>
 )}
 </div>

 <p className="mt-10 text-center text-[10px] uppercase tracking-[0.22em] opacity-30">Powered by <span style={{ color: c.accent }}>VYA</span></p>
 </div>
 </main>
 );
}
