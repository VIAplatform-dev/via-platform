import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isStoreHost } from "@/app/lib/plan-b/store-host";
import type { CSSProperties } from "react";
import { getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import { storefrontVisibility } from "@/app/lib/storefront-visibility";
import ContactForm from "../../ContactForm";
import StorefrontView from "../../StorefrontView";
import StorefrontTracker from "../../StorefrontTracker";
import { sanitizePages } from "@/app/lib/storefront-blocks";
import { isPolicySlug, policyParagraphs } from "@/app/lib/policy-pages";
import { getStoreProfile } from "@/app/lib/store-profile-db";
import PolicyPage from "@/app/s/PolicyPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string; page: string }>; searchParams: Promise<{ preview?: string }> };

// A cloned content page (Our Story, Contact, …). Same nav + theme as the storefront.
export default async function StorefrontContentPage({ params, searchParams }: Props) {
 const { handle, page } = await params;
 const { preview } = await searchParams;

 // Resolved whether or not it is published. An unpublished shop shows its preview.
 // home page: a seller following her own menu must not fall off a 404 halfway round.
 const sf = await getStorefrontByHandleAny(handle).catch(() => null);
 if (!sf) return notFound();
 const visibility = storefrontVisibility(!!sf.enabled);
 const previewing = visibility === "preview";

 const theme = sf.theme || {};

 // VYA-built block pages render with the full storefront chrome via StorefrontView.
 const extra = sanitizePages(theme.extraPages ?? []);
 if (extra.some((p) => p.slug === page)) {
 return (
 <>
 {!sf.enabled && (
 <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-[#FFFDF8]">Preview · not live yet</div>
 )}
 <StorefrontView settings={sf} preview={previewing} pageSlug={page} />
 {sf.enabled && !preview && <StorefrontTracker slug={sf.storeSlug} pageType="page" />}
 </>
 );
 }

 const pages = theme.pages ?? [];
 const pg = pages.find((p) => p.slug === page);

 // A policy slug is allowed past this gate; everything else must be one of her pages.
 if (!pg && !isPolicySlug(page)) return notFound();

 const bg = theme.colors?.bg || "#FFFDF8";
 const text = theme.colors?.text || "#241c17";
 const accent = theme.colors?.text || theme.colors?.accent || sf.accentColor || "#5D0F17";
 const headingFont = theme.fonts?.heading;
 const bodyFont = theme.fonts?.body;
 const storeName = theme.storeName || handle.replace(/-/g, " ");
 const base = isStoreHost((await headers()).get("host")) ? "" : `/s/${handle}`;
 const withPreview = (href: string) => (preview ? `${href || "/"}?preview=1` : href || "/");
 const navItems = (theme.nav ?? []).map((label) => {
 const target = pages.find((p) => p.label?.toLowerCase() === label.toLowerCase());
 return { label, href: withPreview(target ? `${base}/${target.slug}` : `${base}/shop`) };
 });

 // Page shape drives the layout: contact → a real form, faq → Q&A, otherwise the
 // captured content (text over a lead image if there is one).
 // Optional throughout: a policy slug reaches here with no page of its own, and is answered below.
 const pageType = (pg as { pageType?: string } | undefined)?.pageType;
 const isContact = pageType === "contact" || /contact|enquir/i.test(pg?.label || "") || /contact/i.test(pg?.slug || "");
 const isFaq = pageType === "faq" || /faq/i.test(pg?.label || "") || /faq/i.test(pg?.slug || "");
 const leadImage = pg?.blocks.find((b) => b.type === "image")?.value || null;
 const textBlocks = pg?.blocks.filter((b) => b.type !== "image") ?? [];

 const vars: Record<string, string> = { "--accent": accent };
 if (headingFont) vars["--font-heading"] = `'${headingFont}', Georgia, serif`;
 if (bodyFont) vars["--font-body"] = `'${bodyFont}', system-ui, sans-serif`;
 const rootStyle = { ...vars, background: bg, color: text, ...(bodyFont ? { fontFamily: "var(--font-body)" } : {}) } as CSSProperties;
 const gf = [headingFont, bodyFont].filter(Boolean) as string[];
 const fontsHref = gf.length
 ? `https://fonts.googleapis.com/css2?${gf.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
 : null;

 // HER POLICIES, ON HER SITE. Served here rather than from four routes of their own: this one
 // already resolves a slug against her shop and already carries her theme, her fonts and her nav,
 // so a policy page looks like the rest of her site instead of like a form. Checked AFTER her own
 // pages, so a shop that has written its own "Shipping" page keeps it. See policy-pages.ts.
 if (!pg && isPolicySlug(page)) {
 const written = (await getStoreProfile(sf.storeSlug).catch(() => null))?.policies?.[page] ?? "";
 const paragraphs = policyParagraphs(written);
 // Not written is not a page. A blank policy 404s rather than serving an empty heading.
 if (!paragraphs.length) return notFound();
 return (
  <PolicyPage
   slug={page}
   paragraphs={paragraphs}
   storeName={storeName}
   enabled={!!sf.enabled}
   nav={navItems}
   home={withPreview(base)}
   theme={{ bg, text, headingFont, bodyFont, fontsHref }}
  />
 );
 }
 // Past the policy branch, this is one of her own pages or it is nothing.
 if (!pg) return notFound();

 return (
 <main style={rootStyle} className="min-h-screen">
 {fontsHref && <link rel="stylesheet" href={fontsHref} />}
 {!sf.enabled && (
 <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-white">Preview · not live yet</div>
 )}

 <nav className="flex items-center justify-between border-b border-black/10 px-6 py-4">
 <a href={withPreview(`${base}`)} className="text-base tracking-wide" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>
 {storeName}
 </a>
 <div className="flex items-center gap-6 text-[11px] uppercase tracking-[0.16em] opacity-70">
 {navItems.map((n, i) => (
 <a key={i} href={n.href} className="hover:opacity-100">{n.label}</a>
 ))}
 </div>
 </nav>

 {isContact ? (
 <section className="mx-auto max-w-md px-6 py-20 text-center">
 <h1 className="text-3xl sm:text-5xl" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{pg.title || "Get in Touch"}</h1>
 <ContactForm accent={accent} storeSlug={sf.storeSlug} />
 </section>
 ) : isFaq ? (
 <section className="mx-auto max-w-3xl px-6 py-16">
 <h1 className="mb-10 text-center text-3xl sm:text-5xl" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{pg.title || "FAQ"}</h1>
 <div>
 {textBlocks.map((b, i) =>
 b.type === "heading" ? (
 <p key={i} className="mt-7 border-t border-black/10 pt-5 text-base font-medium" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{b.value}</p>
 ) : (
 <p key={i} className="mt-2 text-sm leading-relaxed opacity-75">{b.value}</p>
 ),
 )}
 </div>
 </section>
 ) : leadImage ? (
 // Text laid over the page's image, the way the source presents it.
 <section className="relative flex min-h-[72vh] items-center justify-center overflow-hidden">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={leadImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0 bg-black/45" />
 <div className="relative mx-auto max-w-2xl px-6 py-20 text-center text-white">
 {textBlocks.map((b, i) =>
 b.type === "heading" ? (
 <h1 key={i} className={i === 0 ? "mb-6 text-3xl sm:text-5xl" : "mt-8 mb-2 text-xl sm:text-2xl"} style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>
 {b.value}
 </h1>
 ) : (
 <p key={i} className="mb-4 leading-relaxed opacity-90">{b.value}</p>
 ),
 )}
 </div>
 </section>
 ) : (
 <article className="mx-auto max-w-3xl px-6 py-16">
 {textBlocks.map((b, i) =>
 b.type === "heading" ? (
 <h2 key={i} className={i === 0 ? "mb-8 text-3xl sm:text-5xl" : "mt-10 mb-3 text-xl sm:text-2xl"} style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>
 {b.value}
 </h2>
 ) : (
 <p key={i} className="mb-4 leading-relaxed opacity-80">{b.value}</p>
 ),
 )}
 </article>
 )}

 <footer className="border-t border-black/10 py-8 text-center">
 <p className="text-[10px] uppercase tracking-[0.3em] opacity-35">
 Powered by <span style={{ color: accent }}>VYA</span>
 </p>
 </footer>
 </main>
 );
}
