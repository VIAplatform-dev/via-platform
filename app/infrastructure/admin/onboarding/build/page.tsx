"use client";

// Guided "build from scratch" onboarding — a Squarespace-style flow with a fully INTERACTIVE preview
// (VYA's real Blocks renderer — scroll it, click the nav to move between pages) on the left and one
// decision per step on the right: look → pages → colours → fonts. In VYA a "look" IS the personality
// (layout + colours + type as one kit), so there's a single look step. On finish it writes the theme +
// pages and hands off to the Canva-style studio.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Blocks from "@/app/s/Blocks";
import { StoreHeader, StoreFooter, type ChromeNav } from "@/app/s/StoreChrome";
import { STOREFRONT_TEMPLATES, STOREFRONT_PALETTES, templateBlocks, templateShopBlocks, templatePages, getTemplate, storefrontFontsHref, SERIF_FONTS } from "@/app/lib/storefront-templates";
import { CATEGORY_PRESET, TAILOR_FONT_PAIRS, tailorBlocks } from "@/app/lib/storefront-tailoring";
import { makeBlock, type Block } from "@/app/lib/storefront-blocks";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const ACCENT = "#5D0F17";

// In VYA the "personality" and the "template" are the same choice — each look IS a curated kit
// (layout + colours + type + the pages that come with it). So there's ONE look step, not two.
//
// The personality word IS the template's name, read from storefront-templates. This page used to
// keep its own map of them — a second set of words for the same eight looks, which is precisely the
// drift the note below warns about: a seller met "Collector" here and "Heirloom" in the gallery for
// the same template. One name, one place.

// The font pairings, the sell-categories and their presets all live in storefront-tailoring so the
// signup wizard, this build wizard and the one-shot auto-build can't drift apart — this page carried
// its own copy of all three until the eight-template rewrite, and every one of them went stale.
const FONT_PAIRS = TAILOR_FONT_PAIRS.map((f) => ({ ...f, name: `${f.heading} / ${f.body}` }));


// The pages on offer come from the CHOSEN TEMPLATE, because each one ships its own set: Corner Shop
// offers Visit and Consign With Us, Provenance offers Authentication and Sell To Us. A fixed
// about/faq/shipping list was the same four pages whichever look you picked.
const templatePageOptions = (templateId: string) =>
 templatePages(templateId).map((p) => ({ slug: p.slug, label: p.title }));

const SAMPLE = [
 { title: "Silk slip dress", price: "$185", image: "" },
 { title: "Wool overcoat", price: "$240", image: "" },
 { title: "Leather satchel", price: "$160", image: "" },
 { title: "Cashmere knit", price: "$95", image: "" },
];

// The look IS the first decision. "What do you sell" used to lead, but it asks a seller to
// describe their inventory before they've seen anything — and signup already asked. Categories
// still arrive from signup via the URL and still pick the recommended template; they're just not
// a question here any more.
const STEPS = ["Look", "Pages", "Colours", "Fonts"];
const ff = (name: string) => `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;

// Every font any picker or the preview might show — loaded once so previews render in the real face.
const ALL_WIZARD_FONTS = Array.from(new Set([
 ...FONT_PAIRS.flatMap((f) => [f.heading, f.body]),
 ...STOREFRONT_TEMPLATES.flatMap((t) => [t.fonts.heading, t.fonts.body]),
]));

function BuildWizardInner() {
 const router = useRouter();
 const [step, setStep] = useState(0);
 const [name, setName] = useState("Your store");
 const [cats, setCats] = useState<string[]>([]); // what they sell (ordered — first pick leads the look)
 // Free-typed categories from signup. Nothing adds to them here — the look, not the inventory,
 // is what this wizard asks about — but they still shape the starting content.
 const [customs] = useState<string[]>([]);
 // A live id, not a retired one. "editorial-luxe" only resolved because getTemplate falls through
 // the legacy map — a default should name something that exists.
 const [templateId, setTemplateId] = useState("elegant");
 const [pages, setPages] = useState<Set<string>>(new Set(["about", "faq"]));
 const [paletteId, setPaletteId] = useState<string | null>(null);
 const [fontIdx, setFontIdx] = useState<number | null>(null);
 const [previewPage, setPreviewPage] = useState("home"); // which page the live preview is showing
 const [busy, setBusy] = useState(false);
 // The storefront already supports a logo — StoreHeader draws it in place of the store name — so
 // this only needs somewhere to put one. Same upload path the studio uses.
 const [logo, setLogo] = useState("");
 const [uploadingLogo, setUploadingLogo] = useState(false);

 async function uploadLogo(file: File | null | undefined) {
  if (!file || !file.type.startsWith("image/")) return;
  setUploadingLogo(true);
  try {
   const fd = new FormData(); fd.append("file", file);
   const r = await fetch("/api/store/assets", { method: "POST", body: fd });
   const d = r.ok ? await r.json().catch(() => null) : null;
   if (d?.url) setLogo(d.url);
  } finally { setUploadingLogo(false); }
 }

 // Signup hands over what it already asked — the store name and what they sell — so the seller
 // isn't asked the same questions twice on the way into the builder.
 const params = useSearchParams();
 useEffect(() => {
 const handed = params.get("cats");
 if (handed) setCats(handed.split(",").filter(Boolean));
 const handedName = params.get("name");
 if (handedName) setName(handedName);
 // Look is step 0 now, so there is nothing to skip past.
 }, [params]);

 useEffect(() => {
 (async () => {
 const d = await fetch("/api/store/storefront/design").then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d?.storeName && !params.get("name")) setName(d.storeName);
 })();
 }, [params]);

 // The first selected category with a known preset leads the look; falling back to the raw first pick.
 const primary = cats.map((k) => CATEGORY_PRESET[k]).find(Boolean) || null;
 // Selecting categories tailors the whole kit — the look (template/palette/fonts) + content. This runs
 // when the picks change; the seller can still override every choice in the later steps.
 useEffect(() => {
 if (!primary) return;
 setTemplateId(primary.template);
 setPaletteId(primary.palette);
 setFontIdx(primary.font);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [cats]);
 // Tiles and marquee words merge across every pick (and any custom ones); the hero copy is the first
 // pick's. That merge lives in tailorBlocks, which is what makes "streetwear + vintage" a materially
 // different starting store than "designer".
 const tmpl = getTemplate(templateId) || STOREFRONT_TEMPLATES[0];
 const colors = (paletteId && STOREFRONT_PALETTES.find((p) => p.id === paletteId)?.colors) || tmpl.colors;
 const fonts = fontIdx != null ? { heading: FONT_PAIRS[fontIdx].heading, body: FONT_PAIRS[fontIdx].body } : tmpl.fonts;
 const fontHref = useMemo(() => storefrontFontsHref(ALL_WIZARD_FONTS), []);
 // Every page the store will actually get, tailored to what they sell. Built once per template so the
 // preview and the store written on finish come from the same call — they used to be assembled
 // separately, which is how the preview could show a page the finished store didn't have.
 const tailored = useMemo(() => ({
 home: tailorBlocks(templateBlocks(templateId), cats, customs),
 shop: tailorBlocks(templateShopBlocks(templateId), cats, customs),
 pages: templatePages(templateId).map((p) => ({ ...p, blocks: tailorBlocks(p.blocks, cats, customs) })),
 }), [templateId, cats, customs]);

 const pageOptions = useMemo(() => templatePageOptions(templateId), [templateId]);

 // The interactive preview renders the real thing: the Shop page shows the template's intro above a
 // product grid, and every other page is the template's own content.
 const pageBlocks = (slug: string): Block[] => {
 if (slug === "home") return tailored.home;
 if (slug === "shop") return [...tailored.shop, makeBlock("featured", { heading: "Shop all", limit: "8", cols: String(tmpl.grid.cols) })];
 return tailored.pages.find((p) => p.slug === slug)?.blocks ?? tailored.home;
 };
 const previewBlocks = pageBlocks(previewPage);
 const navItems: ChromeNav[] = [
 { label: "Home", slug: "home", active: previewPage === "home" },
 { label: "Shop", slug: "shop", active: previewPage === "shop" },
 ...pageOptions.filter((p) => pages.has(p.slug)).map((p) => ({ label: p.label, slug: p.slug, active: previewPage === p.slug })),
 ];
 const goPreview = (item: ChromeNav) => item.slug && setPreviewPage(item.slug);

 const canNext = step !== 1 || name.trim().length >= 2; // the name lives on the Look step (step 1)
 const isLast = step === STEPS.length - 1;

 async function finish() {
 setBusy(true);
 // Only the pages the seller kept ticked. Everything else — sections, palette, type, corners,
 // header, catalogue density — is the template as previewed, so the store they land in is the
 // store they just spent four steps looking at.
 const extraPages = tailored.pages.filter((p) => pages.has(p.slug));
 await fetch("/api/store/storefront/design", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 template: templateId, applyContent: false,
 colors, fonts, radius: tmpl.radius, headerLayout: tmpl.headerLayout, shopGrid: tmpl.grid, productLayout: tmpl.productLayout,
 blocks: tailored.home, shopBlocks: tailored.shop, extraPages,
 }),
 }).catch(() => {});
 router.replace("/admin/storefront");
 }

 return (
 <div className="fixed inset-0 z-[60] flex flex-col bg-[#e7e3db] text-stone-800" style={{ fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
 <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
 <link href={fontHref} rel="stylesheet" />

 <div className="flex min-h-0 flex-1">
 {/* ── Live preview ─────────────────────────────────────────────── */}
 <div className="hidden min-w-0 flex-1 items-start justify-center overflow-hidden p-8 lg:flex">
 <div className="w-full max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-24px_rgba(43,36,29,0.5)]">
 <div className="flex h-8 items-center gap-1.5 border-b border-black/[0.06] bg-[#f4f1ec] px-3">
 <span className="h-2.5 w-2.5 rounded-full bg-stone-300" /><span className="h-2.5 w-2.5 rounded-full bg-stone-300" /><span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
 <span className="ml-2 truncate text-[10px] text-stone-400">{(name || "your-store").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.vyaplatform.com</span>
 </div>
 {/* Interactive: `zoom` (not transform) scales AND resizes the box, so it scrolls and clicks map
 correctly — you can scroll the page and click the nav to move between pages, like a real site. */}
 <div className="h-[70vh] overflow-y-auto overscroll-contain">
 <div style={{ width: 1180, zoom: 0.64 } as React.CSSProperties}>
 <div style={{ background: colors.bg, color: colors.text, fontFamily: ff(fonts.body) }}>
 {/* The store name lands here as the wordmark — the branding shows on the page, not just the URL. */}
 <StoreHeader storeName={name || "Your store"} logo={logo || null} nav={navItems} colors={colors} headingFontFamily={ff(fonts.heading)} onNav={goPreview} />
 <Blocks blocks={previewBlocks} colors={colors} fonts={fonts} radius="sharp" products={SAMPLE} shopHref="#" />
 <StoreFooter storeName={name || "Your store"} logo={logo || null} nav={navItems} colors={colors} headingFontFamily={ff(fonts.heading)} year={2026} onNav={goPreview} newsletter={<div className="mx-auto flex max-w-sm items-center gap-2"><input disabled placeholder="Email address" className="h-10 flex-1 rounded-md border border-current/20 bg-transparent px-3 text-[13px] opacity-60" /><span className="grid h-10 place-items-center rounded-md px-4 text-[12px] font-medium uppercase tracking-wide text-white" style={{ background: colors.accent }}>Subscribe</span></div>} />
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* ── Step panel ───────────────────────────────────────────────── */}
 <div className="flex w-full shrink-0 flex-col border-l border-black/10 bg-white lg:w-[440px]">
 <div className="flex items-center gap-2 border-b border-black/[0.06] px-6 py-4">
 <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: ACCENT }}><span className="text-[13px] font-bold text-white">V</span></span>
 <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Build your storefront</p>
 </div>

 <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
 {step === 0 && (
 <Step title="Name & look" sub="Your store name and its overall look — each is a curated kit: layout, colours and type in one.">
 <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Store name</label>
 <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#5D0F17]/50" />

 {/* Optional. With no logo the store name shows in the template's own type, which for most of
     these is the better answer — so this never blocks getting to the look. */}
 <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Logo <span className="font-normal text-stone-400">— optional</span></label>
 <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-black/15 px-3.5 py-3 transition hover:border-[#5D0F17]/50">
  <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.currentTarget.value = ""; }} />
  {logo ? (
   <>
    <img src={logo} alt="" className="max-h-8 w-auto object-contain" />
    <span className="text-[13px] text-stone-500">Replace</span>
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLogo(""); }} className="ml-auto text-[12px] text-stone-400 underline underline-offset-2 hover:text-stone-700">Remove</button>
   </>
  ) : (
   <span className="text-[13px] text-stone-500">{uploadingLogo ? "Uploading…" : "Drop an image or click to upload"}</span>
  )}
 </label>

 <label className="mb-2 block text-[12px] font-medium text-stone-500">Choose a look</label>
 <div className="space-y-2">
 {STOREFRONT_TEMPLATES.map((t) => (
 <button key={t.id} type="button" onClick={() => setTemplateId(t.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${templateId === t.id ? "border-[#5D0F17] ring-1 ring-[#5D0F17]/20" : "border-black/10 hover:border-black/25"}`}>
 <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
 <span className="h-full flex-1" style={{ background: t.colors.bg }} /><span className="h-full flex-1" style={{ background: t.colors.text }} /><span className="h-full flex-1" style={{ background: t.colors.accent }} />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-[14px] font-medium text-stone-800" style={{ fontFamily: ff(t.fonts.heading) }}>{t.name}</span>
 <span className="block truncate text-[12px] text-stone-400">{t.description}</span>
 </span>
 {templateId === t.id && <Check size={16} className="shrink-0 text-[#5D0F17]" />}
 </button>
 ))}
 </div>
 </Step>
 )}

 {step === 1 && (
 <Step title="Add pages" sub="Home and Shop come standard. Add anything else — you can change it later.">
 <div className="space-y-2">
 <PageRow label="Home" locked />
 <PageRow label="Shop" locked />
 {pageOptions.map((p) => (
 <PageRow key={p.slug} label={p.label} checked={pages.has(p.slug)} onToggle={() => setPages((s) => { const n = new Set(s); if (n.has(p.slug)) n.delete(p.slug); else n.add(p.slug); return n; })} />
 ))}
 </div>
 </Step>
 )}

 {step === 2 && (
 <Step title="Choose a colour palette" sub="Curated palettes. Change any colour later in the studio.">
 <div className="grid grid-cols-2 gap-2.5">
 {STOREFRONT_PALETTES.map((p) => {
 const on = paletteId === p.id || (!paletteId && p.colors.bg === tmpl.colors.bg && p.colors.accent === tmpl.colors.accent);
 return (
 <button key={p.id} type="button" onClick={() => setPaletteId(p.id)} className={`overflow-hidden rounded-xl border text-left transition ${on ? "border-[#5D0F17] ring-1 ring-[#5D0F17]/20" : "border-black/10 hover:border-black/25"}`}>
 <span className="flex h-10 w-full">
 <span className="h-full flex-1" style={{ background: p.colors.bg }} /><span className="h-full flex-1" style={{ background: p.colors.text }} /><span className="h-full flex-1" style={{ background: p.colors.accent }} />
 </span>
 <span className="block px-2.5 py-1.5 text-[12px] text-stone-600">{p.name}</span>
 </button>
 );
 })}
 </div>
 </Step>
 )}

 {step === 3 && (
 <Step title="Choose your fonts" sub="Curated pairings. Explore more fonts anytime in the studio.">
 <div className="grid gap-2.5">
 {FONT_PAIRS.map((fp, i) => {
 const on = fontIdx === i || (fontIdx == null && fp.heading === tmpl.fonts.heading && fp.body === tmpl.fonts.body);
 return (
 <button key={fp.name} type="button" onClick={() => setFontIdx(i)} className={`rounded-xl border px-4 py-3 text-left transition ${on ? "border-[#5D0F17] ring-1 ring-[#5D0F17]/20" : "border-black/10 hover:border-black/25"}`}>
 <span className="block text-[22px] leading-tight text-stone-900" style={{ fontFamily: ff(fp.heading) }}>Heading</span>
 <span className="block text-[13px] text-stone-500" style={{ fontFamily: ff(fp.body) }}>This is your paragraph text.</span>
 </button>
 );
 })}
 </div>
 </Step>
 )}
 </div>

 {/* ── Stepper + nav ────────────────────────────────────────────── */}
 <div className="border-t border-black/[0.06] px-6 py-4">
 <div className="mb-3 flex items-center gap-1.5">
 {STEPS.map((s, i) => (
 <button key={s} type="button" onClick={() => i < step && setStep(i)} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "" : "bg-stone-200"}`} style={{ background: i <= step ? ACCENT : undefined }} aria-label={s} />
 ))}
 </div>
 <div className="flex items-center justify-between">
 <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy} className="flex items-center gap-1.5 text-[13px] text-stone-500 transition hover:text-stone-800 disabled:opacity-0"><ArrowLeft size={15} /> Back</button>
 <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{STEPS[step]}</span>
 <button type="button" disabled={!canNext || busy} onClick={() => (isLast ? finish() : setStep((s) => s + 1))} className="flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold text-white transition disabled:opacity-40" style={{ background: ACCENT }}>
 {busy ? "Building…" : isLast ? "Create my store" : "Next"} {!busy && (isLast ? <Check size={15} /> : <ArrowRight size={15} />)}
 </button>
 </div>
 <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">Nothing here is final — you can change your look, colours, fonts, pages, and every word later in the studio.</p>
 </div>
 </div>
 </div>
 </div>
 );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
 return (
 <div>
 <h1 className="text-[22px] leading-tight text-stone-900" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{title}</h1>
 <p className="mb-5 mt-1 text-[13px] leading-relaxed text-stone-500">{sub}</p>
 {children}
 </div>
 );
}

function PageRow({ label, checked, onToggle, locked }: { label: string; checked?: boolean; onToggle?: () => void; locked?: boolean }) {
 return (
 <div className={`flex items-center justify-between rounded-xl border px-3.5 py-3 ${locked ? "border-black/[0.06] bg-stone-50" : "border-black/10"}`}>
 <span className="text-[14px] text-stone-700">{label}</span>
 {locked ? (
 <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Standard</span>
 ) : (
 <button type="button" onClick={onToggle} className={`grid h-5 w-5 place-items-center rounded-md border transition ${checked ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-black/20"}`}>{checked && <Check size={13} />}</button>
 )}
 </div>
 );
}

// `useSearchParams` opts the tree into client rendering, and Next refuses to prerender a page that
// does so without a boundary — it fails the production BUILD, not just the request. The wizard is
// behind a login and renders instantly, so a plain tinted ground is a truthful fallback rather than
// a spinner that would flash for a frame.
export default function BuildWizard() {
 return (
  <Suspense fallback={<div className="min-h-screen bg-[#f7f6f3]" />}>
   <BuildWizardInner />
  </Suspense>
 );
}
