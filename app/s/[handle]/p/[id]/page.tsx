/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getItem } from "@/app/lib/db/inventory";
import { getInboxSettings } from "@/app/lib/storefront-settings-db";
import { formatPrice } from "@/app/lib/formatPrice";
import AskAboutItem from "@/app/s/AskAboutItem";
import MakeOffer from "@/app/components/MakeOffer";

export const dynamic = "force-dynamic";

const SERIFS = new Set(["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces"]);
const ff = (n?: string) => (n ? `'${n}', ${SERIFS.has(n) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

type Props = { params: Promise<{ handle: string; id: string }>; searchParams: Promise<{ preview?: string }> };

export default async function ProductPage({ params, searchParams }: Props) {
 const { handle, id } = await params;
 const { preview } = await searchParams;
 const sf = await getStorefrontByHandleAny(handle).catch(() => null);
 if (!sf) return notFound();
 const seller = await getSellerBySlug(sf.storeSlug).catch(() => null);
 const item = await getItem(id).catch(() => null);
 if (!item || !seller || item.sellerId !== seller.id || item.status === "removed") return notFound();

 const c = { bg: sf.theme?.colors?.bg || "#FFFDF8", text: sf.theme?.colors?.text || "#1a1a1a", accent: sf.theme?.colors?.accent || "#5D0F17" };
 const heading = ff(sf.theme?.fonts?.heading || "Playfair Display");
 const body = ff(sf.theme?.fonts?.body || "Inter");
 const fams = [sf.theme?.fonts?.heading, sf.theme?.fonts?.body].filter(Boolean).map((f) => `family=${(f as string).replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
 const storeName = sf.theme?.storeName || seller.name || handle.replace(/-/g, " ");
 const images = (item.images || []).filter(Boolean);
 const sold = item.status === "sold" || item.status === "reserved";
 const price = formatPrice(item.priceCents / 100, item.currency);
 const link = (p: string) => (preview ? `${p}?preview=1` : p);
 // Honor the store's Buyer-messaging toggle (defaults on if settings are unavailable).
 const inbox = await getInboxSettings(sf.storeSlug).catch(() => null);

 return (
 <main style={{ background: c.bg, color: c.text, fontFamily: body }} className="min-h-screen">
 {fams && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fams}&display=swap`} />}

 <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-black/[0.07] px-6 sm:px-8 py-5" style={{ background: c.bg }}>
 <a href={link(`/s/${handle}`)} className="text-lg tracking-[0.14em]" style={{ fontFamily: heading }}>{storeName}</a>
 <div className="flex gap-6 text-[11px] uppercase tracking-[0.16em] opacity-70">
 <a href={link(`/s/${handle}`)} className="hover:opacity-100">Home</a>
 <a href={link(`/s/${handle}/shop`)} className="hover:opacity-100">Shop</a>
 </div>
 </nav>

 <div className="mx-auto max-w-6xl px-6 sm:px-8 py-10 sm:py-16 grid gap-10 sm:gap-16 md:grid-cols-2">
 {/* Gallery */}
 <div className="space-y-3">
 <div className="overflow-hidden bg-black/5">
 {images[0] ? <img src={images[0]} alt={item.title} className="w-full object-cover" /> : <div className="aspect-[4/5]" />}
 </div>
 {images.length > 1 && (
 <div className="grid grid-cols-4 gap-3">
 {images.slice(1, 5).map((src, i) => (
 <div key={i} className="aspect-square overflow-hidden bg-black/5"><img src={src} alt="" className="h-full w-full object-cover" /></div>
 ))}
 </div>
 )}
 </div>

 {/* Details */}
 <div className="md:pt-4">
 <a href={link(`/s/${handle}/shop`)} className="text-[10px] uppercase tracking-[0.25em] opacity-40 hover:opacity-70">← Back to shop</a>
 <h1 className="mt-5 text-3xl sm:text-[2.5rem] leading-[1.1]" style={{ fontFamily: heading }}>{item.title}</h1>
 <p className="mt-4 text-xl" style={{ color: sold ? "inherit" : c.accent, opacity: sold ? 0.5 : 1 }}>{price}{sold ? " · Sold" : ""}</p>
 {item.size && <p className="mt-4 text-[11px] uppercase tracking-[0.18em] opacity-50">Size {item.size}</p>}
 {item.description && <p className="mt-7 text-sm leading-[1.9] opacity-75 whitespace-pre-wrap">{item.description}</p>}

 <div className="mt-9 max-w-sm">
 {sold ? (
 <p className="border border-current/20 py-4 text-center text-[11px] uppercase tracking-[0.2em] opacity-45">Sold</p>
 ) : (
 <a href={`/checkout?item=${item.id}`} className="block w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition hover:opacity-90" style={{ background: c.accent }}>Buy now — {price}</a>
 )}
 {!sold && (
 <div className="mt-3 flex flex-col gap-1">
 {inbox?.messagingEnabled !== false && <AskAboutItem storeSlug={sf.storeSlug} itemTitle={item.title} accent={c.accent} />}
 <MakeOffer storeSlug={sf.storeSlug} itemId={item.id} itemTitle={item.title} listPriceCents={item.priceCents} accent={c.accent} />
 </div>
 )}
 <p className="mt-5 text-[11px] leading-relaxed opacity-45">One-of-one vintage — once it’s gone, it’s gone. Secure checkout by Stripe.</p>
 </div>
 </div>
 </div>

 <footer className="mt-10 border-t border-black/[0.08] py-10 text-center text-[10px] uppercase tracking-[0.22em] opacity-35">
 Powered by <span style={{ color: c.accent }}>VYA</span>
 </footer>
 </main>
 );
}
