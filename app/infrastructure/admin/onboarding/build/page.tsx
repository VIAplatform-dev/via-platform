"use client";

// Guided "build from scratch" onboarding — a Squarespace-style flow with a fully INTERACTIVE preview
// (VYA's real Blocks renderer — scroll it, click the nav to move between pages) on the left and one
// decision per step on the right: look → pages → colours → fonts. In VYA a "look" IS the personality
// (layout + colours + type as one kit), so there's a single look step. On finish it writes the theme +
// pages and hands off to the Canva-style studio.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Exported so /admin/onboarding can render this INLINE once the store exists, rather than
 * navigating to it. Onboarding asks one question first — bring a site, or build one — and a
 * full page navigation there meant a white flash between the fork and the builder.
 *
 * Props win over the URL when given; the search-param path stays for direct visits to
 * /admin/onboarding/build.
 */
export function BuildWizardInner({ initialName, initialCats, onBeforeFinish }: {
 initialName?: string;
 initialCats?: string[];
 /**
  * Runs before anything is written, with the name the seller typed on the Look step.
  * Onboarding uses it to CREATE the store at that moment — the slug is derived from the
  * name, so the store cannot be created earlier with a placeholder without locking in a
  * wrong address. Return false to abort (the error is shown by the caller).
  */
 onBeforeFinish?: (name: string) => Promise<boolean>;
} = {}) {
 const router = useRouter();
 const [step, setStep] = useState(0);
 // Which way the last move went, so the incoming step slides in from the side it came from —
 // Next enters from the right, Back from the left. Without this every step animates the same
 // way and going Back feels like going forward.
 const [dir, setDir] = useState<1 | -1>(1);
 const goStep = (n: number) => {
  setDir(n > step ? 1 : -1);
  setStep(n);
  // Arriving at Pages, show one of the pages being discussed rather than the home page —
  // otherwise the step talks about pages while the preview shows a hero.
  if (n === 1) setPreviewPage((cur) => (cur === "home" || cur === "shop" ? (firstSelectedPage() ?? cur) : cur));
  // Leaving Pages, come back to Home so Colours and Fonts are judged on the page that matters.
  if (n !== 1 && step === 1) setPreviewPage("home");
 };
 // Empty, not "Your store": a prefilled default is something to delete before you can type,
 // and it shows up in the preview as if it were a real decision the seller had made.
 const [name, setName] = useState(initialName || "");
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
 // Replaying an animation needs a NEW key, not a class swap — so a counter drives the remount and
 // `animKind` picks how big the move is. A whole template is a real change and gets the full
 // fade-up; a palette, a font pairing or a page change is a smaller one and gets a quick fade,
 // otherwise clicking through swatches feels sluggish.
 const [pulse, setPulse] = useState(0);
 const [animKind, setAnimKind] = useState<"template" | "tone">("template");
 const prevTemplate = useRef(templateId);
 const [busy, setBusy] = useState(false);
 // The storefront already supports a logo — StoreHeader draws it in place of the store name — so
 // this only needs somewhere to put one. Same upload path the studio uses.
 const [logo, setLogo] = useState("");            // preview src: an object URL until uploaded
 const [logoFile, setLogoFile] = useState<File | null>(null);
 const [uploadingLogo, setUploadingLogo] = useState(false);

 /**
  * Preview immediately from an object URL and defer the real upload to finish().
  *
  * When onboarding runs this wizard the STORE DOES NOT EXIST YET — it is created from the name
  * typed on this very step — so /api/store/assets would 401 and the logo would silently vanish.
  * Holding the File and uploading once the store exists works in both cases; standalone visits
  * just upload a few seconds later than they used to.
  */
 function stageLogo(file: File | null | undefined) {
  if (!file || !file.type.startsWith("image/")) return;
  setLogoFile(file);
  setLogo(URL.createObjectURL(file));
 }

 /** Upload the staged logo now that a store definitely exists. Returns the stored URL, or "". */
 async function commitLogo(): Promise<string> {
  if (!logoFile) return "";
  setUploadingLogo(true);
  try {
   const fd = new FormData(); fd.append("file", logoFile);
   const r = await fetch("/api/store/assets", { method: "POST", body: fd });
   const d = r.ok ? await r.json().catch(() => null) : null;
   return typeof d?.url === "string" ? d.url : "";
  } catch { return ""; }
  finally { setUploadingLogo(false); }
 }

 // Signup hands over what it already asked — the store name and what they sell — so the seller
 // isn't asked the same questions twice on the way into the builder.
 const params = useSearchParams();
 useEffect(() => {
 // Props first (rendered inline by onboarding), then the URL (direct visit).
 if (initialCats?.length) setCats(initialCats);
 else { const handed = params.get("cats"); if (handed) setCats(handed.split(",").filter(Boolean)); }
 if (initialName) setName(initialName);
 else { const handedName = params.get("name"); if (handedName) setName(handedName); }
 // Look is step 0 now, so there is nothing to skip past.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [params]);

 // The store's CURRENT name is deliberately NOT prefilled here any more. It put "VYA Test Store"
 // into an empty-looking field as though the seller had chosen it, and on the onboarding path
 // there is no store to read from anyway. A blank name is ignored by the design POST, so leaving
 // it empty can never wipe the name off a store that already has one.

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

 /**
  * The first page the seller has ticked, for the preview to land on when the Pages step opens.
  * A function declaration (not a const) so goStep — defined above — can call it; it only ever
  * runs on a click, by which point pageOptions and pages are initialised.
  */
 function firstSelectedPage(): string | null {
  return pageOptions.find((p) => pages.has(p.slug))?.slug ?? null;
 }

 // The interactive preview renders the real thing: the Shop page shows the template's intro above a
 // product grid, and every other page is the template's own content.
 const pageBlocks = (slug: string): Block[] => {
 if (slug === "home") return tailored.home;
 if (slug === "shop") return [...tailored.shop, makeBlock("featured", { heading: "Shop all", limit: "8", cols: String(tmpl.grid.cols) })];
 return tailored.pages.find((p) => p.slug === slug)?.blocks ?? tailored.home;
 };
 useEffect(() => {
  setAnimKind(prevTemplate.current !== templateId ? "template" : "tone");
  prevTemplate.current = templateId;
  setPulse((n) => n + 1);
 }, [templateId, paletteId, fontIdx, previewPage]);

 const previewBlocks = pageBlocks(previewPage);
 const navItems: ChromeNav[] = [
 { label: "Home", slug: "home", active: previewPage === "home" },
 { label: "Shop", slug: "shop", active: previewPage === "shop" },
 ...pageOptions.filter((p) => pages.has(p.slug)).map((p) => ({ label: p.label, slug: p.slug, active: previewPage === p.slug })),
 ];
 const goPreview = (item: ChromeNav) => item.slug && setPreviewPage(item.slug);

 // The name field is on step 0 ("Name & look"), not step 1 ("Pages") — the old guard blocked the
 // wrong step. It went unnoticed while the name defaulted to "Your store", because that always
 // satisfied the length check; the moment the default became empty it locked Next on Pages while
 // leaving the step that actually asks for a name unguarded.
 const canNext = step !== 0 || name.trim().length >= 2;
 const isLast = step === STEPS.length - 1;

 async function finish() {
 setBusy(true);
 // Create the store first when the caller needs it (onboarding). Everything below writes to a
 // store, so there is nothing useful to do if this fails.
 if (onBeforeFinish && !(await onBeforeFinish(name.trim()))) { setBusy(false); return; }
 const logoUrl = await commitLogo();
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
 // The name typed on the Look step was previously preview-only — nothing ever persisted it,
 // so it was discarded the moment the wizard closed. It is the store's wordmark; send it.
 storeName: name.trim() || undefined,
 ...(logoUrl ? { logo: logoUrl } : {}),
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
 <span className="ml-2 truncate text-[10px] text-stone-400">{name.trim() ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.vyaplatform.com` : "your-store.vyaplatform.com"}</span>
 </div>
 {/* Interactive: `zoom` (not transform) scales AND resizes the box, so it scrolls and clicks map
 correctly — you can scroll the page and click the nav to move between pages, like a real site. */}
 <div className="h-[70vh] overflow-y-auto overscroll-contain">
 <div style={{ width: 1180, zoom: 0.64 } as React.CSSProperties}>
 {/* Keyed by a counter so EVERY change replays — template, palette, type, or moving to
     another page. The class decides how much movement that change deserves. */}
 <div key={pulse} className={animKind === "template" ? "vya-preview-in" : "vya-preview-tone"} style={{ background: colors.bg, color: colors.text, fontFamily: ff(fonts.body) }}>
 {/* The store name lands here as the wordmark — the branding shows on the page, not just the URL. */}
 <StoreHeader storeName={name} logo={logo || null} nav={navItems} colors={colors} headingFontFamily={ff(fonts.heading)} onNav={goPreview} />
 <Blocks blocks={previewBlocks} colors={colors} fonts={fonts} radius="sharp" products={SAMPLE} shopHref="#" />
 <StoreFooter storeName={name} logo={logo || null} nav={navItems} colors={colors} headingFontFamily={ff(fonts.heading)} year={2026} onNav={goPreview} newsletter={<div className="mx-auto flex max-w-sm items-center gap-2"><input disabled placeholder="Email address" className="h-10 flex-1 rounded-md border border-current/20 bg-transparent px-3 text-[13px] opacity-60" /><span className="grid h-10 place-items-center rounded-md px-4 text-[12px] font-medium uppercase tracking-wide text-white" style={{ background: colors.accent }}>Subscribe</span></div>} />
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* ── Step panel ───────────────────────────────────────────────── */}
 <div className="flex w-full shrink-0 flex-col border-l border-black/10 bg-white lg:w-[440px]">
 <div className="flex items-center gap-2 border-b border-black/[0.06] px-6 py-4">
 <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: ACCENT }}><span className="text-[13px] font-bold text-white">V</span></span>
 <div className="min-w-0">
 <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Build your storefront</p>
 {/* Sellers hesitate here because it reads as permanent. It isn't — every one of these is a
     token they can change in the editor afterwards, so say so before they stall. */}
 <p className="mt-0.5 text-[11px] text-stone-400">You can change all of this later.</p>
 </div>
 </div>

 <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
 {/* Keyed by step so React remounts on every change and the animation actually replays —
     a class swap alone would only fire the first time. */}
 <div key={step} className={dir === 1 ? "vya-step-in-right" : "vya-step-in-left"}>
 {step === 0 && (
 <Step title="Name & look" sub="Your store name and its overall look — each is a curated kit: layout, colours and type in one.">
 <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Store name</label>
 <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aurora Vintage" className="mb-4 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[14px] outline-none placeholder:text-stone-300 focus:border-[#5D0F17]/50" />

 {/* Optional. With no logo the store name shows in the template's own type, which for most of
     these is the better answer — so this never blocks getting to the look. */}
 <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Logo <span className="font-normal text-stone-400">— optional</span></label>
 <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-black/15 px-3.5 py-3 transition hover:border-[#5D0F17]/50">
  <input type="file" accept="image/*" className="hidden" onChange={(e) => { stageLogo(e.target.files?.[0]); e.currentTarget.value = ""; }} />
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
 <PageRow
 key={p.slug}
 label={p.label}
 checked={pages.has(p.slug)}
 onToggle={() => {
 const adding = !pages.has(p.slug);
 setPages((s) => { const n = new Set(s); if (adding) n.add(p.slug); else n.delete(p.slug); return n; });
 // Adding a page JUMPS the preview to it, so you see what you just added rather than
 // a word appearing in the nav of the home page. Removing the page you're looking at
 // falls back to Home, which would otherwise render an empty preview.
 if (adding) setPreviewPage(p.slug);
 else if (previewPage === p.slug) setPreviewPage("home");
 }}
 />
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
 </div>

 {/* ── Stepper + nav ────────────────────────────────────────────── */}
 <div className="border-t border-black/[0.06] px-6 py-4">
 <div className="mb-3 flex items-center gap-1.5">
 {STEPS.map((s, i) => (
 <button key={s} type="button" onClick={() => i < step && goStep(i)} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "" : "bg-stone-200"}`} style={{ background: i <= step ? ACCENT : undefined }} aria-label={s} />
 ))}
 </div>
 <div className="flex items-center justify-between">
 <button type="button" onClick={() => goStep(Math.max(0, step - 1))} disabled={step === 0 || busy} className="flex items-center gap-1.5 text-[13px] text-stone-500 transition hover:text-stone-800 disabled:opacity-0"><ArrowLeft size={15} /> Back</button>
 <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{STEPS[step]}</span>
 <button type="button" disabled={!canNext || busy} onClick={() => (isLast ? finish() : goStep(step + 1))} className="flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold text-white transition disabled:opacity-40" style={{ background: ACCENT }}>
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
