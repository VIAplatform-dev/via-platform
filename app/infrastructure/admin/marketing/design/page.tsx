"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Undo2, Upload, Type as TypeIcon, Sparkles } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, SectionLabel, Toggle, SegmentedControl } from "../../ui";
import { Input } from "@/app/store/ui";

type Brand = {
 accent: string; text: string; bg: string;
 headingFont?: string; bodyFont?: string; logo?: string | null;
 buttonLabel?: string; footerText?: string; showAccentBar?: boolean;
 buttonStyle?: "rounded" | "pill" | "square"; headerAlign?: "center" | "left";
};

// One-click looks — each sets colours + type + layout together so a store never has to touch a
// hex value unless they want to. Content (logo, button label, footer) is preserved when applied.
type Preset = { name: string; b: Partial<Brand> };
const PRESETS: Preset[] = [
 { name: "Classic", b: { accent: "#5D0F17", text: "#1c1917", bg: "#ffffff", headingFont: "Playfair Display", bodyFont: undefined, showAccentBar: true, buttonStyle: "rounded", headerAlign: "center" } },
 { name: "Editorial", b: { accent: "#1c1917", text: "#1c1917", bg: "#ffffff", headingFont: "Newsreader", bodyFont: undefined, showAccentBar: false, buttonStyle: "square", headerAlign: "left" } },
 { name: "Warm", b: { accent: "#b5533b", text: "#3d2b23", bg: "#fbf7f1", headingFont: "Cormorant Garamond", bodyFont: undefined, showAccentBar: true, buttonStyle: "pill", headerAlign: "center" } },
 { name: "Minimal", b: { accent: "#292524", text: "#292524", bg: "#ffffff", headingFont: "Fraunces", bodyFont: "Inter", showAccentBar: false, buttonStyle: "square", headerAlign: "left" } },
 { name: "Bold", b: { accent: "#0e6b52", text: "#1c1917", bg: "#ffffff", headingFont: "Bodoni Moda", bodyFont: "Work Sans", showAccentBar: true, buttonStyle: "pill", headerAlign: "center" } },
 { name: "Noir", b: { accent: "#c9a35b", text: "#e7e5e4", bg: "#171412", headingFont: "Bodoni Moda", bodyFont: undefined, showAccentBar: false, buttonStyle: "square", headerAlign: "center" } },
];
// A curated vintage palette for quick accent picks (still fully custom below).
const PALETTE = ["#5D0F17", "#1c1917", "#b5533b", "#0e6b52", "#1f3a5f", "#a9744f", "#9c6b7d", "#5c6b3f", "#8a3324", "#4c3b52"];

// Serif display faces for headings + the store wordmark; sans faces for body copy. "" = the
// classic default (Georgia / system sans). Values are Google font family names the renderer loads.
const HEADING_FONTS = ["", "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces", "EB Garamond", "Lora", "DM Serif Display", "Libre Baskerville", "Prata", "Spectral"];
const BODY_FONTS = ["", "Inter", "Work Sans", "DM Sans", "Nunito Sans", "Mulish", "Karla", "Lato"];

// A representative email so the store sees headings, body, a list, the button and the footer at once.
const SAMPLE = `# Just landed

A few new favourites, hand-picked for you — we don't think they'll last long.

- Vintage Levi's 501s
- 1990s silk slip dress
- Camel wool car coat

Take a look before they're gone.`;

export default function EmailDesignPage() {
 const [brand, setBrand] = useState<Brand | null>(null);
 const [custom, setCustom] = useState(false);
 const [canUndo, setCanUndo] = useState(false);
 const [storeName, setStoreName] = useState<string>("your store");
 const [previewHtml, setPreviewHtml] = useState("");
 const [savedSnap, setSavedSnap] = useState("");
 const [busy, setBusy] = useState(false);
 const [note, setNote] = useState<string | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 const load = () => fetch("/api/store/email-brand").then((r) => (r.ok ? r.json() : null)).then((d) => {
 if (!d?.brand) return;
 setBrand(d.brand); setCustom(!!d.custom); setCanUndo(!!d.canUndo);
 if (d.storeName) setStoreName(d.storeName);
 setSavedSnap(JSON.stringify(d.brand));
 }).catch(() => {});
 load();
 // When VYA (the assistant) changes the email design, reflect it here live.
 const onUpd = () => { load(); setNote("Updated by VYA."); };
 window.addEventListener("vya:store-updated", onUpd);
 return () => window.removeEventListener("vya:store-updated", onUpd);
 }, []);

 // Live preview through the real renderer — exactly what will send.
 useEffect(() => {
 if (!brand) return;
 const id = setTimeout(() => {
 fetch("/api/store/email-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: SAMPLE, brand }) })
 .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.html) setPreviewHtml(d.html); }).catch(() => {});
 }, 300);
 return () => clearTimeout(id);
 }, [brand]);

 const set = (patch: Partial<Brand>) => { setBrand((b) => (b ? { ...b, ...patch } : b)); setNote(null); };
 const applyPreset = (p: Preset) => set(p.b); // theme fields only — logo/label/footer are kept
 const dirty = brand != null && JSON.stringify(brand) !== savedSnap;

 async function save() {
 if (!brand) return;
 setBusy(true); setNote(null);
 try {
 const r = await fetch("/api/store/email-brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand }) });
 const d = await r.json();
 if (r.ok) { setBrand(d.brand); setSavedSnap(JSON.stringify(d.brand)); setCustom(true); setCanUndo(!!d.canUndo); setNote("Saved — every campaign uses this look now."); }
 else setNote(d.error || "Couldn’t save.");
 } catch { setNote("Couldn’t save."); }
 setBusy(false);
 }

 async function matchStorefront() {
 setBusy(true); setNote(null);
 try {
 const r = await fetch("/api/store/email-brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) });
 const d = await r.json();
 if (r.ok) { setBrand(d.brand); setSavedSnap(JSON.stringify(d.brand)); setCustom(false); setCanUndo(!!d.canUndo); setNote("Reset to match your storefront."); }
 } catch { setNote("Couldn’t reset."); }
 setBusy(false);
 }

 async function undo() {
 setBusy(true); setNote(null);
 try {
 const r = await fetch("/api/store/email-brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: true }) });
 const d = await r.json();
 if (r.ok && d.reverted) { setBrand(d.brand); setSavedSnap(JSON.stringify(d.brand)); setCustom(!!d.custom); setCanUndo(true); setNote("Reverted the last change."); }
 else setNote("Nothing to revert.");
 } catch { setNote("Couldn’t revert."); }
 setBusy(false);
 }

 async function uploadLogo(file: File) {
 const fd = new FormData(); fd.append("file", file);
 try { const r = await fetch("/api/store/assets", { method: "POST", body: fd }); if (r.ok) { const { url } = await r.json(); if (url) set({ logo: url }); } } catch { /* ignore */ }
 }

 if (!brand) return <AdminPage className="max-w-6xl"><AdminHeader eyebrow="Store · Marketing" title="Email design" subtitle="Loading…" /></AdminPage>;

 return (
 <AdminPage className="max-w-6xl">
 <AdminHeader
 eyebrow="Store · Marketing"
 title="Email design"
 subtitle="Set the look every campaign and automation sends with — logo, colours, type, and the details. Same idea as your storefront: change it once, and every email matches."
 actions={
 <div className="flex items-center gap-2">
 {canUndo && <TechButton variant="ghost" onClick={undo} disabled={busy}><Undo2 size={13} /> Revert last change</TechButton>}
 <TechButton variant="secondary" onClick={matchStorefront} disabled={busy}><RotateCcw size={13} /> Match my storefront</TechButton>
 <TechButton onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</TechButton>
 </div>
 }
 />

 <div className="mb-4 flex flex-wrap items-center gap-3">
 <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ${custom ? "bg-[var(--accent-soft,#eafaf3)] text-[var(--accent-ink,#0b7a5c)] ring-[var(--accent,#0e9f76)]/20" : "bg-stone-100 text-stone-500 ring-stone-200"}`}>
 {custom ? "Custom email design" : "Inheriting your storefront brand"}
 </span>
 {note && <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-ink,#0b7a5c)]"><Check size={14} />{note}</span>}
 </div>

 <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
 {/* Live preview */}
 <div className="lg:sticky lg:top-6 lg:self-start">
 <SectionLabel className="mb-2">Preview</SectionLabel>
 <div className="overflow-hidden rounded-xl border border-stone-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
 <iframe srcDoc={previewHtml} title="Email preview" className="h-[620px] w-full border-0 bg-[#f1efeb]" sandbox="" />
 </div>
 </div>

 {/* Controls */}
 <div className="space-y-5">
 {/* Start from a theme — the easy path: one tap sets colours, type & layout at once. */}
 <TechCard className="p-4">
 <SectionLabel className="mb-2.5 flex items-center gap-1.5"><Sparkles size={12} /> Start from a theme</SectionLabel>
 <div className="grid grid-cols-3 gap-2">
 {PRESETS.map((p) => (
 <button key={p.name} type="button" onClick={() => applyPreset(p)} className="group flex flex-col gap-1.5 rounded-lg border border-stone-200 p-2 text-left transition hover:border-[var(--accent,#0e9f76)] hover:shadow-sm">
 <div className="flex h-11 items-center justify-center gap-1 rounded-md ring-1 ring-black/5" style={{ background: p.b.bg }}>
 <span style={{ color: p.b.text, fontFamily: "Georgia, serif" }} className="text-[15px] leading-none">Aa</span>
 <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.b.accent }} />
 </div>
 <span className="text-[11px] font-medium text-stone-600 group-hover:text-stone-900">{p.name}</span>
 </button>
 ))}
 </div>
 <p className="mt-2 text-[11px] text-stone-400">Tap one to apply, then fine-tune anything below. Your logo &amp; text stay put.</p>
 </TechCard>

 {/* Logo */}
 <TechCard className="p-4">
 <SectionLabel className="mb-2.5">Logo</SectionLabel>
 <div className="flex items-center gap-3">
 <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
 {brand.logo ? <img src={brand.logo} alt="" className="max-h-full max-w-full object-contain" /> : <span className="px-1 text-center text-[9px] font-semibold leading-tight text-stone-500">{storeName}</span>}
 </div>
 <div className="flex flex-1 flex-wrap gap-2">
 <TechButton variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={13} /> Upload logo</TechButton>
 <TechButton variant="ghost" onClick={() => set({ logo: null })} disabled={!brand.logo}>Use store name</TechButton>
 <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]); e.target.value = ""; }} />
 </div>
 </div>
 <p className="mt-2 text-[11px] text-stone-400">A transparent PNG reads best. Leave it off to show your store name in your heading font.</p>
 </TechCard>

 {/* Colours */}
 <TechCard className="p-4">
 <SectionLabel className="mb-2.5">Colours</SectionLabel>
 <div className="mb-3 flex flex-wrap gap-1.5">
 {PALETTE.map((c) => (
 <button key={c} type="button" title={c} onClick={() => set({ accent: c })} style={{ background: c }}
 className={`h-6 w-6 rounded-full ring-1 ring-black/10 transition hover:scale-110 ${brand.accent.toLowerCase() === c.toLowerCase() ? "ring-2 ring-offset-2 ring-stone-900" : ""}`} />
 ))}
 </div>
 <div className="space-y-2.5">
 <ColorRow label="Accent" hint="Button, links & top bar" value={brand.accent} onChange={(v) => set({ accent: v })} />
 <ColorRow label="Background" hint="The email card" value={brand.bg} onChange={(v) => set({ bg: v })} />
 <ColorRow label="Text" hint="Body copy" value={brand.text} onChange={(v) => set({ text: v })} />
 </div>
 </TechCard>

 {/* Typography */}
 <TechCard className="p-4">
 <SectionLabel className="mb-2.5 flex items-center gap-1.5"><TypeIcon size={12} /> Typography</SectionLabel>
 <div className="space-y-3">
 <FontRow label="Headings" value={brand.headingFont || ""} fonts={HEADING_FONTS} onChange={(v) => set({ headingFont: v || undefined })} />
 <FontRow label="Body" value={brand.bodyFont || ""} fonts={BODY_FONTS} onChange={(v) => set({ bodyFont: v || undefined })} />
 </div>
 </TechCard>

 {/* Layout */}
 <TechCard className="p-4">
 <SectionLabel className="mb-2.5">Layout</SectionLabel>
 <div className="space-y-3">
 <div className="flex items-center justify-between gap-3">
 <span className="text-[13px] text-stone-700">Alignment</span>
 <SegmentedControl options={["Center", "Left"]} value={brand.headerAlign === "left" ? "Left" : "Center"} onChange={(v) => set({ headerAlign: v === "Left" ? "left" : "center" })} />
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="text-[13px] text-stone-700">Button shape</span>
 <SegmentedControl options={["Rounded", "Pill", "Square"]} value={(brand.buttonStyle || "rounded").replace(/^\w/, (c) => c.toUpperCase())} onChange={(v) => set({ buttonStyle: v.toLowerCase() as Brand["buttonStyle"] })} />
 </div>
 <label className="flex items-center justify-between gap-3">
 <span className="text-[13px] text-stone-700">Coloured bar across the top</span>
 <Toggle on={brand.showAccentBar !== false} onClick={() => set({ showAccentBar: !(brand.showAccentBar !== false) })} />
 </label>
 </div>
 </TechCard>

 {/* Content details */}
 <TechCard className="p-4">
 <SectionLabel className="mb-2.5">Button & footer</SectionLabel>
 <div className="space-y-3">
 <label className="block">
 <span className="mb-1 block text-[12px] font-medium text-stone-700">Button label</span>
 <Input value={brand.buttonLabel || ""} onChange={(e) => set({ buttonLabel: e.target.value })} placeholder="Shop now" maxLength={40} />
 </label>
 <label className="block">
 <span className="mb-1 block text-[12px] font-medium text-stone-700">Footer note</span>
 <textarea
 value={brand.footerText || ""}
 onChange={(e) => set({ footerText: e.target.value })}
 rows={3}
 maxLength={400}
 placeholder={`You're receiving this because you shopped with {store}.\nReply to this email to reach us.`}
 className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-[13px] leading-relaxed text-stone-800 outline-none focus:border-[var(--accent,#0e9f76)]"
 />
 <span className="mt-1 block text-[11px] text-stone-400">Use <code className="rounded bg-stone-100 px-1">{"{store}"}</code> for your store name.</span>
 </label>
 </div>
 </TechCard>
 </div>
 </div>
 </AdminPage>
 );
}

function ColorRow({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
 const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
 return (
 <div className="flex items-center gap-3">
 <label className="relative grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-stone-200" style={{ background: value }} title={`${label} colour`}>
 <input type="color" value={swatch} onChange={(e) => onChange(e.target.value)} className="absolute h-0 w-0 opacity-0" />
 </label>
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-medium text-stone-800">{label}</p>
 <p className="text-[11px] text-stone-400">{hint}</p>
 </div>
 <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className="w-[92px] rounded-md border border-stone-200 px-2 py-1 text-right font-mono text-[12px] text-stone-700 outline-none focus:border-[var(--accent,#0e9f76)]" />
 </div>
 );
}

function FontRow({ label, value, fonts, onChange }: { label: string; value: string; fonts: string[]; onChange: (v: string) => void }) {
 return (
 <label className="flex items-center justify-between gap-3">
 <span className="text-[13px] text-stone-700">{label}</span>
 <select value={value} onChange={(e) => onChange(e.target.value)} className="w-[190px] rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[13px] text-stone-800 outline-none focus:border-[var(--accent,#0e9f76)]">
 {fonts.map((f) => <option key={f || "default"} value={f}>{f || "Default"}</option>)}
 </select>
 </label>
 );
}
