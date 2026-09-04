"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readCart } from "../cart";
import { Camera, Sparkles, PenLine } from "lucide-react";
import { B, ActionBar, BigButton, MarketPage, Notice, api, href, newClientKey } from "../ui";

type Draft = { title: string; description: string; brand: string | null; brandConfidence: number; era: string | null; material: string | null; condition: string | null; category: string | null; size: string | null; priceHint: number | null };

async function downscale(file: File, max = 1600): Promise<string> {
 const url = URL.createObjectURL(file);
 try {
 const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
 const scale = Math.min(1, max / Math.max(img.width, img.height));
 const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
 c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
 return c.toDataURL("image/jpeg", 0.86);
 } finally { URL.revokeObjectURL(url); }
}

// Photo → AI → price → checkout. Everything but the price is optional; the seller can fix fields later.
function QuickInner() {
 const router = useRouter();
 const camRef = useRef<HTMLInputElement>(null);
 // Mid-sale (came from the basket's "Add another item"): the only outcome that makes sense is
 // "add this new item to the sale" — no separate checkout/cash/just-list choice.
 const adding = useSearchParams().get("add") === "1" || readCart().length > 0;
 const [photo, setPhoto] = useState<string | null>(null);
 const [imageUrl, setImageUrl] = useState<string | null>(null);
 const [phase, setPhase] = useState<"start" | "reading" | "form">("start");
 const [mode, setMode] = useState<"ai" | "manual">("ai");
 const [uploading, setUploading] = useState(false);
 const [f, setF] = useState({ title: "", brand: "", price: "", size: "", category: "", condition: "", era: "", material: "", description: "" });
 const [hint, setHint] = useState<number | null>(null);
 const [more, setMore] = useState(false);
 const [busy, setBusy] = useState<null | "qr" | "cash" | "list">(null);
 const [err, setErr] = useState<string | null>(null);
 const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }));

 // Arrived from Find item's "List it now": the photo the seller just took comes along, already attached.
 // Opens the manual form (name + price) with the photo saved; "Let AI fill it in" runs the draft on it.
 const [carried, setCarried] = useState<string | null>(null);
 useEffect(() => {
 let dataUrl: string | null = null;
 try { dataUrl = sessionStorage.getItem("market:quick:photo"); sessionStorage.removeItem("market:quick:photo"); } catch { /* storage off */ }
 if (!dataUrl) return;
 (async () => {
 setMode("manual"); setPhase("form"); setPhoto(dataUrl); setCarried(dataUrl); setUploading(true);
 const r = await api<{ imageUrl: string }>("/api/store/market/quick-list", { method: "POST", body: JSON.stringify({ image: dataUrl, ai: false }) });
 if (r.ok) setImageUrl(r.data.imageUrl); else setErr(r.data.error || "Couldn't save the photo");
 setUploading(false);
 })();
 }, []);

 async function aiFromCarried() {
 if (!carried) return;
 setErr(null); setPhase("reading"); setMode("ai");
 const r = await api<{ imageUrl: string; draft: Draft | null; notConfigured?: boolean }>("/api/store/market/quick-list", { method: "POST", body: JSON.stringify({ image: carried }) });
 if (!r.ok) { setErr(r.data.error || "Couldn't read the photo"); setPhase("form"); setMode("manual"); return; }
 setImageUrl(r.data.imageUrl);
 const d = r.data.draft;
 if (d) { setF((o) => ({ ...o, title: d.title || o.title, brand: d.brandConfidence >= 0.75 ? (d.brand || "") : o.brand, size: d.size || o.size, category: d.category || o.category, condition: d.condition || o.condition, era: d.era || o.era, material: d.material || o.material, description: d.description || o.description })); setHint(d.priceHint); }
 else if (r.data.notConfigured) setErr("AI isn't set up on this server — fill in the fields by hand.");
 setPhase("form");
 }

 // Manual mode: the photo is optional and never goes to the AI — just stored for the listing.
 async function onManualPhoto(files: FileList | null) {
 const file = files?.[0]; if (!file) return;
 setErr(null); setUploading(true);
 try {
 const dataUrl = await downscale(file);
 setPhoto(dataUrl);
 const r = await api<{ imageUrl: string }>("/api/store/market/quick-list", { method: "POST", body: JSON.stringify({ image: dataUrl, ai: false }) });
 if (r.ok) setImageUrl(r.data.imageUrl); else setErr(r.data.error || "Couldn't save the photo");
 } catch { setErr("Couldn't read that photo."); }
 setUploading(false);
 }

 async function onPhoto(files: FileList | null) {
 if (mode === "manual") return onManualPhoto(files);
 const file = files?.[0]; if (!file) return;
 setErr(null); setPhase("reading");
 try {
 const dataUrl = await downscale(file);
 setPhoto(dataUrl);
 const r = await api<{ imageUrl: string; draft: Draft | null; notConfigured?: boolean }>("/api/store/market/quick-list", { method: "POST", body: JSON.stringify({ image: dataUrl }) });
 if (!r.ok) { setErr(r.data.error || "Couldn't read the photo"); setPhase("start"); return; }
 setImageUrl(r.data.imageUrl);
 const d = r.data.draft;
 if (d) {
 setF({ title: d.title || "", brand: d.brandConfidence >= 0.75 ? (d.brand || "") : "", price: "", size: d.size || "", category: d.category || "", condition: d.condition || "", era: d.era || "", material: d.material || "", description: d.description || "" });
 setHint(d.priceHint);
 } else if (r.data.notConfigured) setErr("AI isn't set up on this server — fill in the fields by hand.");
 setPhase("form");
 } catch { setErr("Couldn't read that photo."); setPhase("start"); }
 }

 async function create(startCheckout: "qr" | "cash" | null) {
 if (mode === "manual" && !f.title.trim()) { setErr("Give it a name."); return; }
 if (!(Number(f.price) > 0)) { setErr("Enter a price."); return; }
 if (uploading) { setErr("Photo is still saving — one second."); return; }
 setBusy(startCheckout ?? "list"); setErr(null);
 const r = await api<{ item: { id: string }; checkout: { id: string; tender: string } | null }>("/api/store/market/quick-list/create", { method: "POST", body: JSON.stringify({ ...f, price: Number(f.price), imageUrl, startCheckout, clientKey: newClientKey() }) });
 setBusy(null);
 if (!r.ok) { setErr(r.data.error || "Couldn't create the listing"); return; }
 if (adding) { router.push(href(`${B}/item/${r.data.item.id}`)); return; } // Confirm adds it to the basket
 if (startCheckout === "cash" && r.data.checkout) router.push(href(`${B}/checkout/${r.data.checkout.id}`));
 else if (startCheckout === "qr") router.push(href(`${B}/item/${r.data.item.id}`)); // Confirm shows the basket; one tap to pay
 else router.push(href(`${B}/item/${r.data.item.id}`));
 }

 const input = "min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 text-[15px] outline-none focus:border-stone-400";
 return (
 <MarketPage title={adding ? "Add a new item to cart" : "Quick list"} back={adding ? `${B}/find?add=1` : B}>
 <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files); e.target.value = ""; }} />
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}

 {phase === "start" && (
 <>
 <p className="mb-4 text-[14px] text-stone-500">Item isn’t listed yet? Pick the fast way for right now.</p>
 <div className="space-y-3">
 <button type="button" onClick={() => { setMode("manual"); setPhase("form"); }} className="flex w-full items-center gap-4 rounded-3xl bg-stone-900 p-5 text-left text-white active:scale-[0.99]">
 <PenLine size={28} className="shrink-0" />
 <span><span className="block text-[18px] font-semibold">Quick manual listing</span><span className="block text-[13px] text-stone-300">Just a name and a price. Photo optional.</span></span>
 </button>
 <button type="button" onClick={() => { setMode("ai"); camRef.current?.click(); }} className="flex w-full items-center gap-4 rounded-3xl border border-stone-200 bg-white p-5 text-left text-stone-900 active:scale-[0.99]">
 <Sparkles size={28} className="shrink-0 text-[#5D0F17]" />
 <span><span className="block text-[18px] font-semibold">AI listing from a photo</span><span className="block text-[13px] text-stone-500">Snap it — brand, title and details get drafted. You set the price.</span></span>
 </button>
 </div>
 </>
 )}
 {phase === "reading" && (
 <div className="flex flex-col items-center gap-4 py-10">
 {photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="" className="h-40 w-40 rounded-2xl object-cover ring-1 ring-stone-200" />}
 <p className="animate-pulse text-[15px] font-medium text-stone-700">Reading the piece…</p>
 </div>
 )}
 {phase === "form" && (
 <div className="space-y-3">
 <div className="flex items-center gap-3">
 {photo
 ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo} alt="" className="h-20 w-20 rounded-2xl object-cover ring-1 ring-stone-200" />
 : <button type="button" onClick={() => camRef.current?.click()} disabled={uploading} className="grid h-20 w-20 place-items-center rounded-2xl border border-dashed border-stone-300 text-stone-400"><Camera size={22} /></button>}
 <div className="text-[13px] text-stone-500">
 {uploading ? "Saving photo…" : photo ? <button onClick={() => camRef.current?.click()} className="underline">{mode === "ai" ? "Retake" : "Change photo"}</button> : "Add a photo (optional)"}
 {mode === "manual" && (carried
 ? <p className="mt-1 text-[12px] text-stone-400">Photo from your search is attached. <button onClick={aiFromCarried} disabled={uploading} className="font-semibold text-[#5D0F17] underline">Let AI fill it in</button></p>
 : <p className="mt-1 text-[12px] text-stone-400">Manual listing — you can fill in details later.</p>)}
 </div>
 </div>
 {mode === "manual" && <label className="block"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Name</span><input autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Levi's 501 jeans, 32" className={`mt-1 ${input}`} /></label>}
 <label className="block"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Price</span>
 <div className="mt-1 flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 focus-within:border-stone-900"><span className="text-[24px] font-semibold text-stone-400">$</span><input autoFocus={mode === "ai"} inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder={hint ? String(hint) : "0"} className="min-h-[56px] w-full bg-transparent text-[28px] font-semibold outline-none" /></div>
 {hint && !f.price && <button onClick={() => set("price", String(hint))} className="mt-1 text-[12px] text-stone-500">AI suggests ${hint} — tap to use</button>}
 </label>
 {mode === "ai" && <label className="block"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Title</span><input value={f.title} onChange={(e) => set("title", e.target.value)} className={`mt-1 ${input}`} /></label>}
 {mode === "ai" && <label className="block"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Brand</span><input value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Unbranded" className={`mt-1 ${input}`} /></label>}
 <button onClick={() => setMore((m) => !m)} className="text-[13px] text-stone-500 underline">{more ? "Less" : mode === "manual" ? "Add details (brand, size, condition…)" : "More details (size, condition, era…)"}</button>
 {more && (
 <div className="grid grid-cols-2 gap-2">
 {mode === "manual" && <input value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Brand" className={`col-span-2 ${input}`} />}
 <input value={f.size} onChange={(e) => set("size", e.target.value)} placeholder="Size" className={input} />
 <input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Category" className={input} />
 <input value={f.condition} onChange={(e) => set("condition", e.target.value)} placeholder="Condition" className={input} />
 <input value={f.era} onChange={(e) => set("era", e.target.value)} placeholder="Era" className={input} />
 <input value={f.material} onChange={(e) => set("material", e.target.value)} placeholder="Material" className={`col-span-2 ${input}`} />
 <textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Description" className={`col-span-2 min-h-[80px] rounded-xl border border-stone-200 bg-white p-3 text-[14px] outline-none focus:border-stone-400`} />
 </div>
 )}
 <ActionBar>
 {adding ? (
 <BigButton onClick={() => create(null)} disabled={busy !== null} className="min-h-[64px] text-[17px]">{busy ? "Adding…" : "Add to sale"}</BigButton>
 ) : (
 <>
 <BigButton onClick={() => create("qr")} disabled={busy !== null} className="min-h-[64px] text-[17px]">{busy === "qr" ? "…" : "Card"}</BigButton>
 <div className="grid grid-cols-2 gap-2">
 <BigButton variant="secondary" onClick={() => create("cash")} disabled={busy !== null}>{busy === "cash" ? "…" : "Cash"}</BigButton>
 <BigButton variant="ghost" onClick={() => create(null)} disabled={busy !== null}>{busy === "list" ? "…" : "Just list"}</BigButton>
 </div>
 </>
 )}
 </ActionBar>
 </div>
 )}
 </MarketPage>
 );
}

export default function QuickPage() {
 return <Suspense fallback={null}><QuickInner /></Suspense>;
}
