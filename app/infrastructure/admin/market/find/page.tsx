"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { readCart } from "../cart";
import { Camera, Search, Plus } from "lucide-react";
import { B, ItemCard, MarketPage, Notice, StatusChip, Thumb, api, href, money, type MarketItem } from "../ui";

type MatchResp = { level: "high" | "medium" | "none"; candidates: { score: number; item: MarketItem }[]; notConfigured?: boolean; unindexed?: boolean; error?: string };

/** Shrink a camera photo to ≤1024px JPEG in the browser (~100–200 KB) so the match request is fast on
 *  market Wi-Fi. HEIC from iPhones decodes via <img> in Safari; other browsers hand us JPEG already. */
async function downscale(file: File, max = 1024): Promise<string> {
 const url = URL.createObjectURL(file);
 try {
 const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
 const scale = Math.min(1, max / Math.max(img.width, img.height));
 const canvas = document.createElement("canvas");
 canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
 canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
 return canvas.toDataURL("image/jpeg", 0.82);
 } finally { URL.revokeObjectURL(url); }
}

function FindInner() {
 const [q, setQ] = useState("");
 const [items, setItems] = useState<MarketItem[] | null>(null);
 const [all, setAll] = useState<MarketItem[] | null>(null);
 const [busy, setBusy] = useState(false);
 const [photo, setPhoto] = useState<string | null>(null);
 const [match, setMatch] = useState<MatchResp | null>(null);
 const [matching, setMatching] = useState<null | string>(null);
 const [err, setErr] = useState<string | null>(null);
 const inputRef = useRef<HTMLInputElement>(null);
 const camRef = useRef<HTMLInputElement>(null);
 const adding = useSearchParams().get("add") === "1";
 const basket = adding ? readCart() : [];

 useEffect(() => {
 api<{ items: MarketItem[] }>("/api/store/market/inventory?view=available").then((r) => { if (r.ok) setAll(r.data.items); });
 }, []);

 useEffect(() => {
 const t = setTimeout(async () => {
 if (!q.trim()) { setItems(null); return; }
 setBusy(true);
 const r = await api<{ items: MarketItem[] }>(`/api/store/market/search?q=${encodeURIComponent(q.trim())}`);
 setBusy(false);
 setItems(r.ok ? r.data.items : []);
 }, 180);
 return () => clearTimeout(t);
 }, [q]);

 async function onPhoto(files: FileList | null) {
 const f = files?.[0];
 if (!f) return;
 setErr(null); setMatch(null); setMatching("Reading photo…");
 let dataUrl: string;
 try { dataUrl = await downscale(f); } catch { setMatching(null); setErr("Couldn't read that photo. Try again."); return; }
 setPhoto(dataUrl);
 setMatching("Comparing to your inventory…");
 const r = await api<MatchResp>("/api/store/market/match", { method: "POST", body: JSON.stringify({ image: dataUrl }) });
 setMatching(null);
 if (!r.ok) { setErr(r.data.error || "Match failed — search instead."); return; }
 setMatch(r.data);
 }

 const top = match?.candidates[0];
 return (
 <MarketPage title={adding ? "Add to cart" : "Find item"} back={adding && basket.length > 0 ? `${B}/cart` : B}>
 {adding && basket.length > 0 && <div className="mb-3 rounded-2xl px-4 py-2.5 text-[13px]" style={{ background: "rgba(93,15,23,.08)", color: "#1c1917" }}>{basket.length} item{basket.length === 1 ? "" : "s"} in cart · pick the next one</div>}
 {/* Camera first: opens the rear camera directly on phones; a file picker on desktop. */}
 <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files); e.target.value = ""; }} />
 <button type="button" onClick={() => camRef.current?.click()} disabled={!!matching} className="flex min-h-[76px] w-full items-center justify-center gap-3 rounded-2xl bg-stone-900 text-[18px] font-semibold text-white active:scale-[0.99] disabled:bg-stone-400">
 <Camera size={26} /> {matching ?? (photo ? "Take another photo" : "Take a photo")}
 </button>

 <label className="mt-3 flex min-h-[52px] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 focus-within:border-stone-400">
 <Search size={20} className="text-stone-400" />
 <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="or search: title, brand, size…" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" inputMode="search" enterKeyHint="search" />
 {q && <button onClick={() => { setQ(""); inputRef.current?.focus(); }} className="text-[13px] text-stone-400">Clear</button>}
 </label>

 {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}

 {/* Photo result states — the seller always confirms on the next screen; nothing auto-selects. */}
 {match && !q.trim() && (
 <div className="mt-5 space-y-3">

 {(match.level === "high" || match.level === "medium") && top && (
 <>
 <div className="flex items-baseline justify-between">
 <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: match.level === "high" ? "#0b7a5c" : "#5D0F17" }}>{match.level === "high" ? "We found it" : "We think it's this"}</p>
 <button onClick={() => camRef.current?.click()} className="text-[12.5px] text-stone-500 underline">Retake</button>
 </div>
 {/* Top match as one big card: photo, confidence, and Checkout right on it. Tapping the card itself opens the item. */}
 <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
 <a href={href(`${B}/item/${top.item.id}`)} className="relative block bg-stone-100">
 <Thumb src={top.item.image} alt={top.item.title} fill className="!max-h-[260px]" />
 <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-stone-900 shadow-sm">{Math.round(top.score * 100)}% alike</span>
 </a>
 <div className="p-4">
 <a href={href(`${B}/item/${top.item.id}`)} className="block text-[17px] font-semibold leading-snug text-stone-900">{top.item.title}</a>
 <p className="mt-1 flex items-center gap-2 text-[12.5px] text-stone-500">{[top.item.brand, top.item.size && `Size ${top.item.size}`].filter(Boolean).join(" · ")}<StatusChip status={top.item.status} /></p>
 <div className="mt-3 flex items-center justify-between">
 <span className="text-[28px] font-medium tracking-tight text-stone-900" style={{ fontFamily: "var(--font-display)" }}>{money(top.item.priceCents, top.item.currency)}</span>
 {top.item.status === "active" || top.item.status === "draft"
 ? <a href={href(`${B}/item/${top.item.id}`)} className="flex min-h-[48px] items-center gap-1 rounded-2xl bg-stone-900 px-5 text-[15px] font-semibold text-white">Confirm →</a>
 : <a href={href(`${B}/item/${top.item.id}`)} className="text-[13px] font-semibold text-stone-500">View item ›</a>}
 </div>
 </div>
 </div>
 {match.candidates.length > 1 && (
 <>
 <p className="pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Not it? Also close</p>
 <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
 {match.candidates.slice(1).map((c) => (
 <a key={c.item.id} href={href(`${B}/item/${c.item.id}`)} className="w-[84px] shrink-0">
 <Thumb src={c.item.image} alt={c.item.title} size={84} className={c.item.status === "sold" ? "opacity-50" : ""} />
 <span className="mt-1 block truncate text-[11px] text-stone-700">{c.item.title}</span>
 <span className="block text-[10.5px] text-stone-400">{money(c.item.priceCents, c.item.currency)} · {Math.round(c.score * 100)}%</span>
 </a>
 ))}
 </div>
 </>
 )}
 <p className="pt-1 text-center text-[12.5px] text-stone-400">None of these? Search above, or <a className="underline" href={href(`${B}/quick`)}>Quick list</a>.</p>
 </>
 )}
 {match.level === "none" && (
 <>
 {/* N1 + N3: say it plainly, show the nearest anyway, then two doors. Never a dead end. */}
 <div className="flex items-center gap-3">
 {photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="Your photo" className="h-11 w-11 rounded-xl object-cover ring-1 ring-stone-200" />}
 <div>
 <p className="text-[15px] font-semibold text-stone-900">{match.notConfigured ? "Photo search isn't set up" : match.unindexed ? "Photos not indexed yet" : "Not in your inventory"}</p>
 <p className="text-[12px] text-stone-500">{match.notConfigured ? "Search or list it below." : match.unindexed ? "Run Index in Setup, or search below." : "Nothing close enough"} · <button onClick={() => camRef.current?.click()} className="underline">Retake</button></p>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-2 pt-1">
 <a href={href(`${B}/quick?from=photo${adding ? "&add=1" : ""}`)} onClick={() => { try { if (photo) sessionStorage.setItem("market:quick:photo", photo); } catch { /* storage off → Quick list opens without the photo */ } }} className="flex min-h-[112px] flex-col justify-between rounded-2xl p-4 text-white" style={{ background: "#5D0F17" }}>
 <Plus size={24} />
 <span><span className="block text-[15px] font-semibold">List it now</span><span className="block text-[11.5px] text-white/75">Name + price, then sell</span></span>
 </a>
 <button onClick={() => { setMatch(null); inputRef.current?.focus(); }} className="flex min-h-[112px] flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left text-stone-900">
 <Search size={24} />
 <span><span className="block text-[15px] font-semibold">Search by name</span><span className="block text-[11.5px] text-stone-500">Title, brand, size</span></span>
 </button>
 </div>
 </>
 )}
 </div>
 )}

 <div className="mt-5 space-y-2">
 {/* Nothing typed and no photo result — the whole rack is right here, no search needed. */}
 {!q.trim() && !match && (
 <>
 {all === null && <p className="text-center text-[13px] text-stone-400">Loading…</p>}
 {all && all.length > 0 && <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{all.length} item{all.length === 1 ? "" : "s"} at this market</p>}
 {all?.map((it) => <ItemCard key={it.id} item={it} to={`${B}/item/${it.id}`} />)}
 </>
 )}
 {busy && items === null && <p className="text-center text-[13px] text-stone-400">Searching…</p>}
 {items && items.length === 0 && (
 <div className="space-y-3">
 <Notice tone="info">No item matches “{q}”.</Notice>
 <a href={href(`${B}/quick${adding ? "?add=1" : ""}`)} className="block text-center text-[14px] font-semibold text-stone-900 underline">{adding ? "Not listed? Add it to cart →" : "Can’t find it? Quick list →"}</a>
 </div>
 )}
 {items && items.length > 0 && <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{items.length} match{items.length === 1 ? "" : "es"}</p>}
 {items?.map((it) => <ItemCard key={it.id} item={it} to={`${B}/item/${it.id}`} highlight={q} dim={it.status === "sold" || it.status === "removed"} />)}
 </div>
 </MarketPage>
 );
}

export default function FindPage() {
 return <Suspense fallback={null}><FindInner /></Suspense>;
}
