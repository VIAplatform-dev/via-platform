"use client";

// Guided "build from scratch" onboarding — a Squarespace-style flow with a fully INTERACTIVE preview
// (VYA's real Blocks renderer — scroll it, click the nav to move between pages) on the left and one
// decision per step on the right: look → pages → colours → fonts. In VYA a "look" IS the personality
// (layout + colours + type as one kit), so there's a single look step. On finish it writes the theme +
// pages and hands off to the Canva-style studio.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Blocks from "@/app/s/Blocks";
import { StoreHeader, StoreFooter, type ChromeNav } from "@/app/s/StoreChrome";
import { STOREFRONT_TEMPLATES, STOREFRONT_PALETTES, templateBlocks, storefrontFontsHref, SERIF_FONTS } from "@/app/lib/storefront-templates";
import { makeBlock, type Block } from "@/app/lib/storefront-blocks";
import { defaultStarterTheme } from "@/app/lib/storefront-default";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

const ACCENT = "#5D0F17";

// In VYA the "personality" and the "template" are the same choice — each look IS a curated kit (layout +
// colours + fonts). So there's ONE look step, not two. This is the personality word shown on each card.
const VIBE: Record<string, string> = {
 "editorial-luxe": "Elevated", "archive-noir": "Archival", "modern-minimal": "Minimal",
 "literary-archive": "Literary", "romantic": "Romantic", "warm-earthy": "Warm & earthy", "playful-drop": "Playful",
};

// Curated pairings from current editorial best-practice — a display face with personality over a clean,
// legible body. (Serif display + sans body is the safe, high-fashion default; a couple stay all-serif.)
const FONT_PAIRS = [
 { name: "Editorial", heading: "Playfair Display", body: "Inter" },
 { name: "High Contrast", heading: "Bodoni Moda", body: "DM Sans" },
 { name: "Contemporary", heading: "Bricolage Grotesque", body: "Inter" },
 { name: "Warm Serif", heading: "Fraunces", body: "Source Serif 4" },
 { name: "Literary", heading: "Newsreader", body: "Newsreader" },
 { name: "Romantic", heading: "Cormorant Garamond", body: "Poppins" },
 { name: "Modern", heading: "Space Grotesk", body: "Inter" },
];

// What the seller sells drives the whole starting kit. Each category maps to a distinct look (template +
// palette + font pairing) AND tailored content (hero copy, shop-by-category tiles, marquee words). Picking
// several blends them: the FIRST pick leads the look; tiles + marquee merge across all picks — so
// "streetwear + vintage" lands somewhere genuinely different from "designer luxury".
type CatPreset = { template: string; palette: string; font: number; hero: { heading: string; sub: string; cta: string }; tiles: string[]; marquee: string[] };
const CATEGORY_OPTIONS: { key: string; label: string }[] = [
 { key: "streetwear", label: "Streetwear" },
 { key: "designer", label: "Designer & luxury" },
 { key: "vintage", label: "Vintage & archival" },
 { key: "y2k", label: "Y2K & retro" },
 { key: "denim", label: "Denim" },
 { key: "workwear", label: "Workwear & utility" },
 { key: "contemporary", label: "Contemporary" },
 { key: "menswear", label: "Menswear" },
 { key: "womenswear", label: "Womenswear" },
 { key: "accessories", label: "Accessories & jewelry" },
];
const CATEGORY_PRESET: Record<string, CatPreset> = {
 streetwear: { template: "playful-drop", palette: "charcoal", font: 6, hero: { heading: "New heat, curated.", sub: "One-of-one grails and everyday staples — cop them before they’re gone.", cta: "Shop the drop" }, tiles: ["Hoodies", "Tees", "Sneakers", "Outerwear", "Denim", "Headwear"], marquee: ["New drops", "One of one", "Deadstock", "Grails", "Restocked"] },
 designer: { template: "editorial-luxe", palette: "bone-ink", font: 1, hero: { heading: "Designer, authenticated.", sub: "Investment pieces and timeless labels — curated, verified, one of a kind.", cta: "Shop designer" }, tiles: ["Handbags", "Ready-to-wear", "Shoes", "Jewelry", "Outerwear", "Accessories"], marquee: ["Authenticated", "Timeless", "Investment pieces", "Iconic"] },
 vintage: { template: "warm-earthy", palette: "espresso", font: 3, hero: { heading: "Vintage, one of one.", sub: "Hand-picked pieces with history — no restocks, ever.", cta: "Shop vintage" }, tiles: ["Dresses", "Denim", "Knitwear", "Outerwear", "Tees", "Accessories"], marquee: ["One of one", "Hand-picked", "With history", "No restocks"] },
 y2k: { template: "playful-drop", palette: "blush", font: 2, hero: { heading: "Y2K & retro finds.", sub: "The good stuff from the archives — nostalgic, playful, rare.", cta: "Shop the era" }, tiles: ["Tops", "Denim", "Dresses", "Bags", "Shoes", "Accessories"], marquee: ["Y2K", "Retro", "Archive", "Nostalgia", "Rare finds"] },
 denim: { template: "modern-minimal", palette: "dusty-blue", font: 6, hero: { heading: "Denim, done right.", sub: "Vintage washes, perfect fades, one-of-one pairs.", cta: "Shop denim" }, tiles: ["Jeans", "Jackets", "Shorts", "Skirts", "Workwear", "Accessories"], marquee: ["Vintage wash", "Selvedge", "Perfect fades", "One of one"] },
 workwear: { template: "archive-noir", palette: "sage", font: 3, hero: { heading: "Workwear & utility.", sub: "Built-to-last pieces with a story in every seam.", cta: "Shop workwear" }, tiles: ["Jackets", "Trousers", "Overalls", "Shirts", "Boots", "Bags"], marquee: ["Built to last", "Utility", "Heritage", "Rugged"] },
 contemporary: { template: "modern-minimal", palette: "greige", font: 2, hero: { heading: "Considered, contemporary.", sub: "Modern staples and quiet statement pieces.", cta: "Shop the edit" }, tiles: ["New in", "Tops", "Bottoms", "Outerwear", "Shoes", "Accessories"], marquee: ["New in", "Considered", "Everyday", "Quiet luxury"] },
 menswear: { template: "archive-noir", palette: "charcoal", font: 1, hero: { heading: "Menswear, curated.", sub: "Tailoring, staples and standout pieces — edited with intent.", cta: "Shop menswear" }, tiles: ["Shirts", "Tailoring", "Knitwear", "Outerwear", "Denim", "Shoes"], marquee: ["Curated", "Tailored", "Considered", "Standout"] },
 womenswear: { template: "romantic", palette: "blush", font: 5, hero: { heading: "Womenswear, one of one.", sub: "Dresses, knits and finds you won’t see on anyone else.", cta: "Shop womenswear" }, tiles: ["Dresses", "Tops", "Knitwear", "Outerwear", "Bags", "Shoes"], marquee: ["One of one", "Romantic", "Hand-picked", "Timeless"] },
 accessories: { template: "editorial-luxe", palette: "antique-gold", font: 0, hero: { heading: "Accessories & jewelry.", sub: "The finishing pieces — bags, belts, and one-of-a-kind jewels.", cta: "Shop accessories" }, tiles: ["Handbags", "Jewelry", "Belts", "Scarves", "Sunglasses", "Watches"], marquee: ["One of a kind", "Finishing pieces", "Rare", "Curated"] },
};
const dedupeCI = (a: string[]) => { const seen = new Set<string>(); return a.filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

const OPTIONAL_PAGES = [
 { slug: "about", label: "About" },
 { slug: "faq", label: "FAQ" },
 { slug: "shipping-returns", label: "Shipping & Returns" },
 { slug: "contact", label: "Contact" },
];

const SAMPLE = [
 { title: "Silk slip dress", price: "$185", image: "" },
 { title: "Wool overcoat", price: "$240", image: "" },
 { title: "Leather satchel", price: "$160", image: "" },
 { title: "Cashmere knit", price: "$95", image: "" },
];

const STEPS = ["Sell", "Look", "Pages", "Colours", "Fonts"];
const ff = (name: string) => `'${name}', ${SERIF_FONTS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;

// Every font any picker or the preview might show — loaded once so previews render in the real face.
const ALL_WIZARD_FONTS = Array.from(new Set([
 ...FONT_PAIRS.flatMap((f) => [f.heading, f.body]),
 ...STOREFRONT_TEMPLATES.flatMap((t) => [t.fonts.heading, t.fonts.body]),
]));

export default function BuildWizard() {
 const router = useRouter();
 const [step, setStep] = useState(0);
 const [name, setName] = useState("Your store");
 const [cats, setCats] = useState<string[]>([]); // what they sell (ordered — first pick leads the look)
 const [customs, setCustoms] = useState<string[]>([]); // free-typed categories
 const [customInput, setCustomInput] = useState("");
 const [templateId, setTemplateId] = useState("editorial-luxe");
 const [pages, setPages] = useState<Set<string>>(new Set(["about", "faq"]));
 const [paletteId, setPaletteId] = useState<string | null>(null);
 const [fontIdx, setFontIdx] = useState<number | null>(null);
 const [previewPage, setPreviewPage] = useState("home"); // which page the live preview is showing
 const [busy, setBusy] = useState(false);

 useEffect(() => {
 (async () => {
 const d = await fetch("/api/store/storefront/design").then((r) => (r.ok ? r.json() : null)).catch(() => null);
 if (d?.storeName) setName(d.storeName);
 })();
 }, []);

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
 // Shop-by-category tiles + marquee words merge across every pick (and any custom ones); hero copy is the
 // primary's. This is what makes "streetwear + vintage" a materially different starting store than "designer".
 const tiles = dedupeCI([...cats.flatMap((k) => CATEGORY_PRESET[k]?.tiles || []), ...customs]).slice(0, 6);
 const marquee = dedupeCI(cats.flatMap((k) => CATEGORY_PRESET[k]?.marquee || [])).slice(0, 8);

 const tmpl = STOREFRONT_TEMPLATES.find((t) => t.id === templateId) || STOREFRONT_TEMPLATES[0];
 const colors = (paletteId && STOREFRONT_PALETTES.find((p) => p.id === paletteId)?.colors) || tmpl.colors;
 const fonts = fontIdx != null ? { heading: FONT_PAIRS[fontIdx].heading, body: FONT_PAIRS[fontIdx].body } : tmpl.fonts;
 const fontHref = useMemo(() => storefrontFontsHref(ALL_WIZARD_FONTS), []);
 // Tailor the template's home blocks to what they sell — overriding the hero copy, the shop-by-category
 // tiles, and the marquee words where those sections exist. Keeps the template's layout personality.
 const tailoredHome = (): Block[] => {
 const bs = templateBlocks(templateId);
 if (!primary) return bs;
 let heroDone = false, tilesDone = false, marqDone = false;
 return bs.map((b) => {
 if (b.type === "hero" && !heroDone) { heroDone = true; return { ...b, props: { ...b.props, heading: primary.hero.heading, subtext: primary.hero.sub, cta: primary.hero.cta } }; }
 if (b.type === "collections" && !tilesDone && tiles.length) { tilesDone = true; return { ...b, props: { ...b.props, items: tiles.join("\n") } }; }
 if (b.type === "marquee" && !marqDone && marquee.length) { marqDone = true; return { ...b, props: { ...b.props, items: marquee.join("\n") } }; }
 return b;
 });
 };
 // Real page content for the interactive preview — home is the tailored template, other pages come from the
 // same starter content the store gets on finish, so clicking the nav navigates a true multi-page site.
 const base = useMemo(() => defaultStarterTheme(name), [name]);
 const pageBlocks = (slug: string): Block[] => {
 if (slug === "shop") return [makeBlock("featured", { heading: "Shop all" })];
 if (slug === "home") return tailoredHome();
 const seeded = base.extraPages?.find((p) => p.slug === slug);
 if (seeded) return seeded.blocks as Block[];
 if (slug === "contact") return [makeBlock("text", { heading: "Get in touch", body: "Questions about a piece, sizing, or an order? Email us — we usually reply within a day." })];
 return templateBlocks(templateId);
 };
 const previewBlocks = pageBlocks(previewPage);
 const navItems: ChromeNav[] = [
 { label: "Home", slug: "home", active: previewPage === "home" },
 { label: "Shop", slug: "shop", active: previewPage === "shop" },
 ...OPTIONAL_PAGES.filter((p) => pages.has(p.slug)).map((p) => ({ label: p.label, slug: p.slug, active: previewPage === p.slug })),
 ];
 const goPreview = (item: ChromeNav) => item.slug && setPreviewPage(item.slug);

 const canNext = step !== 1 || name.trim().length >= 2; // the name lives on the Look step (step 1)
 const isLast = step === STEPS.length - 1;
 const toggleCat = (k: string) => setCats((cs) => (cs.includes(k) ? cs.filter((x) => x !== k) : [...cs, k]));
 const addCustom = (e: React.FormEvent) => { e.preventDefault(); const v = customInput.trim(); if (v && customs.length < 8 && !customs.some((c) => c.toLowerCase() === v.toLowerCase())) setCustoms((cs) => [...cs, v]); setCustomInput(""); };

 async function finish() {
 setBusy(true);
 const base = defaultStarterTheme(name);
 const extraPages = [] as { slug: string; title: string; blocks: unknown[] }[];
 for (const p of OPTIONAL_PAGES) {
 if (!pages.has(p.slug)) continue;
 const seeded = base.extraPages?.find((x) => x.slug === p.slug);
 if (seeded) extraPages.push(seeded);
 else if (p.slug === "contact") extraPages.push({ slug: "contact", title: "Contact", blocks: [
 makeBlock("text", { heading: "Get in touch", body: "Questions about a piece, sizing, or an order? Email us — we usually reply within a day." }),
 makeBlock("newsletter", { heading: "Stay in touch", subtext: "News and new arrivals, now and then." }),
 ] });
 }
 await fetch("/api/store/storefront/design", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ template: templateId, colors, fonts, blocks: tailoredHome(), shopBlocks: [], extraPages }),
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
 <StoreHeader storeName={name || "Your store"} nav={navItems} colors={colors} headingFontFamily={ff(fonts.heading)} onNav={goPreview} />
 <Blocks blocks={previewBlocks} colors={colors} fonts={fonts} radius="sharp" products={SAMPLE} shopHref="#" />
 <StoreFooter storeName={name || "Your store"} nav={navItems} colors={colors} headingFontFamily={ff(fonts.heading)} year={2026} onNav={goPreview} newsletter={<div className="mx-auto flex max-w-sm items-center gap-2"><input disabled placeholder="Email address" className="h-10 flex-1 rounded-md border border-current/20 bg-transparent px-3 text-[13px] opacity-60" /><span className="grid h-10 place-items-center rounded-md px-4 text-[12px] font-medium uppercase tracking-wide text-white" style={{ background: colors.accent }}>Subscribe</span></div>} />
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
 <Step title="What do you sell?" sub="Pick any that fit — we’ll tailor your store’s look and starting content to match. Your first pick leads the style.">
 <div className="flex flex-wrap gap-2">
 {CATEGORY_OPTIONS.map((c, i) => {
 const on = cats.includes(c.key);
 const lead = on && cats[0] === c.key;
 return (
 <button key={c.key} type="button" onClick={() => toggleCat(c.key)} className={`relative rounded-full border px-3.5 py-2 text-[13px] font-medium transition ${on ? "border-[#5D0F17] bg-[#5D0F17] text-white" : "border-black/12 text-stone-700 hover:border-black/30"}`}>
 {c.label}{lead && <span className="ml-1.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">Leads</span>}
 </button>
 );
 })}
 </div>
 {customs.length > 0 && (
 <div className="mt-2.5 flex flex-wrap gap-2">
 {customs.map((c) => (
 <span key={c} className="flex items-center gap-1.5 rounded-full border border-[#5D0F17]/30 bg-[#5D0F17]/[0.06] px-3 py-1.5 text-[13px] text-stone-700">
 {c}<button type="button" onClick={() => setCustoms((cs) => cs.filter((x) => x !== c))} className="text-stone-400 hover:text-stone-700"><X size={13} /></button>
 </span>
 ))}
 </div>
 )}
 <form onSubmit={addCustom} className="mt-3">
 <input value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Add your own — e.g. Bags, Band tees, Ceramics…" className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-[#5D0F17]/50" />
 </form>
 {primary ? (
 <p className="mt-5 rounded-xl bg-stone-50 px-4 py-3 text-[12px] leading-relaxed text-stone-500">Starting you on a <b className="text-stone-700">{VIBE[primary.template] || "curated"}</b> look, tailored for {cats.map((k) => CATEGORY_OPTIONS.find((c) => c.key === k)?.label).filter(Boolean).join(" + ")}. Refine everything in the next steps.</p>
 ) : (
 <p className="mt-5 text-[12px] leading-relaxed text-stone-400">Optional — skip and choose a look yourself next. Selecting here just gives you a tailored head start.</p>
 )}
 </Step>
 )}

 {step === 1 && (
 <Step title="Name & look" sub="Your store name and its overall look — each is a curated kit: layout, colours and type in one.">
 <label className="mb-1.5 block text-[12px] font-medium text-stone-500">Store name</label>
 <input value={name} onChange={(e) => setName(e.target.value)} className="mb-5 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#5D0F17]/50" />
 <label className="mb-2 block text-[12px] font-medium text-stone-500">Choose a look</label>
 <div className="space-y-2">
 {STOREFRONT_TEMPLATES.map((t) => (
 <button key={t.id} type="button" onClick={() => setTemplateId(t.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${templateId === t.id ? "border-[#5D0F17] ring-1 ring-[#5D0F17]/20" : "border-black/10 hover:border-black/25"}`}>
 <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
 <span className="h-full flex-1" style={{ background: t.colors.bg }} /><span className="h-full flex-1" style={{ background: t.colors.text }} /><span className="h-full flex-1" style={{ background: t.colors.accent }} />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-[14px] font-medium text-stone-800" style={{ fontFamily: ff(t.fonts.heading) }}>{VIBE[t.id] || t.name}</span>
 <span className="block truncate text-[12px] text-stone-400">{t.description}</span>
 </span>
 {templateId === t.id && <Check size={16} className="shrink-0 text-[#5D0F17]" />}
 </button>
 ))}
 </div>
 </Step>
 )}

 {step === 2 && (
 <Step title="Add pages" sub="Home and Shop come standard. Add anything else — you can change it later.">
 <div className="space-y-2">
 <PageRow label="Home" locked />
 <PageRow label="Shop" locked />
 {OPTIONAL_PAGES.map((p) => (
 <PageRow key={p.slug} label={p.label} checked={pages.has(p.slug)} onToggle={() => setPages((s) => { const n = new Set(s); if (n.has(p.slug)) n.delete(p.slug); else n.add(p.slug); return n; })} />
 ))}
 </div>
 </Step>
 )}

 {step === 3 && (
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

 {step === 4 && (
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
