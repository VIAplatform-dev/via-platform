import React from "react";

// The persistent site chrome — the header (logo · nav · search) and footer that wrap EVERY page of a
// storefront. Presentational only (plain <a>, no hooks), so it renders identically in the live
// StorefrontView (server) and in the editor studio (client) — one source of truth for the header/footer
// look, which is why they stay consistent across the whole site.
export type ChromeNav = { label: string; href?: string; active?: boolean; slug?: string };
export type Socials = { instagram?: string; tiktok?: string; facebook?: string; youtube?: string; pinterest?: string; email?: string };

// Presentational social glyphs (inline SVG, currentColor) — no external icon deps.
const SOCIAL_ICON: Record<keyof Socials, React.ReactNode> = {
 instagram: <><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></>,
 tiktok: <path d="M14 3.5c.4 2.3 1.9 3.8 4.2 4.1v3c-1.6.1-3-.4-4.2-1.2v5.9a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3.1a2.7 2.7 0 1 0 1.9 2.6V3.5H14Z" strokeWidth="0" fill="currentColor" />,
 facebook: <path d="M14.5 8.5h2v-3h-2c-2 0-3.3 1.3-3.3 3.4v1.6H9v3h2.2V21h3v-6.9h2.2l.4-3h-2.6V9.2c0-.5.3-.7.8-.7Z" strokeWidth="0" fill="currentColor" />,
 youtube: <><rect x="2.5" y="5.5" width="19" height="13" rx="3.5" /><path d="M10.3 9.2v5.6l4.7-2.8-4.7-2.8Z" strokeWidth="0" fill="currentColor" /></>,
 pinterest: <path d="M12 3.5a8.5 8.5 0 0 0-3.1 16.4c-.1-.7-.2-1.8 0-2.6l1-4.3s-.3-.5-.3-1.3c0-1.2.7-2.1 1.6-2.1.7 0 1.1.6 1.1 1.3 0 .8-.5 2-.8 3.1-.2.9.5 1.6 1.4 1.6 1.6 0 2.8-1.7 2.8-4.1 0-2.2-1.5-3.7-3.7-3.7a3.9 3.9 0 0 0-4 3.9c0 .8.3 1.6.7 2 .1.1.1.2.1.3l-.3 1c0 .2-.2.2-.3.1-1.1-.5-1.8-2.1-1.8-3.4 0-2.8 2-5.3 5.9-5.3 3.1 0 5.5 2.2 5.5 5.1 0 3.1-1.9 5.6-4.6 5.6-.9 0-1.7-.5-2-1l-.6 2.1c-.2.7-.7 1.7-1 2.2A8.5 8.5 0 1 0 12 3.5Z" strokeWidth="0" fill="currentColor" />,
 email: <><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="m3.5 6 8.5 6 8.5-6" /></>,
};
// A seller can enter a full URL OR just a handle — normalise handles into real profile links so the
// footer icons always work (a bare "@store" shouldn't 404).
const handle = (base: string) => (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${base}/${v.replace(/^@|^\/+/g, "")}`);
const SOCIAL_HREF: Record<keyof Socials, (v: string) => string> = {
 instagram: handle("instagram.com"),
 tiktok: (v) => (/^https?:\/\//i.test(v) ? v : `https://www.tiktok.com/@${v.replace(/^@|^\/+/g, "")}`),
 facebook: handle("facebook.com"),
 youtube: handle("youtube.com"),
 pinterest: handle("pinterest.com"),
 email: (v) => (/^https?:\/\//i.test(v) ? v : v.includes("@") ? `mailto:${v}` : v),
};
function socialList(socials?: Socials): { key: keyof Socials; href: string }[] {
 if (!socials) return [];
 return (Object.keys(SOCIAL_ICON) as (keyof Socials)[])
 .filter((k) => socials[k] && socials[k]!.trim())
 .map((k) => ({ key: k, href: SOCIAL_HREF[k](socials[k]!.trim()) }));
}
type ChromeProps = {
 storeName: string;
 logo?: string | null;
 nav: ChromeNav[];
 colors: { bg: string; text: string; accent: string };
 headingFontFamily?: string;
 announcement?: string | null;
 search?: React.ReactNode; // a search control (functional on live, a static glyph in the editor)
 year?: number; // passed in (Date.now() isn't available everywhere); falls back to a static line
 onNav?: (item: ChromeNav) => void; // editor: click a nav link to switch pages (renders buttons, not links)
};

// A nav entry renders as a real link on the live site, or as a page-switch button inside the editor.
function NavItem({ n, onNav, className, style }: { n: ChromeNav; onNav?: (i: ChromeNav) => void; className?: string; style?: string }) {
 const css = style ? { fontFamily: style } : undefined;
 if (onNav) return <button type="button" onClick={() => onNav(n)} className={className} style={css}>{n.label}</button>;
 return <a href={n.href || "#"} className={className} style={css}>{n.label}</a>;
}

/**
 * Header layouts. The same three parts — brand, nav, utilities — arranged the ways real storefronts
 * arrange them. This is the axis Shopify and Squarespace both expose, and it is the difference
 * between a store that looks like a template and one that looks like itself.
 *   inline  — brand left, nav centre, utilities right (what every VYA storefront has today)
 *   center  — brand centred with the nav on the row beneath it; the classic boutique masthead
 *   split   — brand centred with the nav divided either side of it
 *   stacked — brand left with the nav on its own row below, left-aligned
 */
export type HeaderLayout = "inline" | "center" | "split" | "stacked";
export const HEADER_LAYOUTS: { id: HeaderLayout; label: string; description: string }[] = [
 { id: "inline", label: "Inline", description: "Brand left, menu centre, search right." },
 { id: "center", label: "Centred", description: "Brand centred, menu on the row below." },
 { id: "split", label: "Split menu", description: "Brand centred with the menu either side of it." },
 { id: "stacked", label: "Stacked", description: "Brand left, menu on its own row beneath." },
];

export function StoreHeader({ storeName, logo, nav, colors, headingFontFamily, announcement, search, onNav, layout = "inline" }: ChromeProps & { layout?: HeaderLayout }) {
 const brand = logo
  ? <img src={logo} alt={storeName} className="h-7 w-auto shrink-0 object-contain" draggable={false} />
  : <NavItem n={{ ...(nav.find((n) => /^home/i.test(n.label)) || {}), label: storeName }} onNav={onNav} className="shrink-0 text-lg tracking-[0.12em]" style={headingFontFamily} />;
 const links = (items: ChromeNav[], className = "") => (
  <div className={`hidden items-center gap-6 text-[11px] uppercase tracking-[0.16em] opacity-70 @3xl:flex ${className}`}>
   {items.map((n, i) => <NavItem key={i} n={n} onNav={onNav} className={`hover:opacity-100 ${n.active ? "opacity-100 underline underline-offset-4" : ""}`} />)}
  </div>
 );
 const utils = <div className="flex shrink-0 items-center gap-4 opacity-70">{search}</div>;
 const bar = "sticky top-0 z-40 border-b border-black/[0.07] px-6 @xl:px-8" as const;
 const style = { background: colors.bg, color: colors.text };
 // Split puts half the menu on each side of the brand. An odd number leans left, which reads as
 // deliberate; centring the extra item would make the brand sit visibly off-centre.
 const half = Math.ceil(nav.length / 2);
 return (
 // `@container`, and every breakpoint below is a CONTAINER variant.
 //
 // These were viewport breakpoints (`md:`), which is the wrong ruler for a storefront: the studio
 // renders the page into a 390px artboard inside a 1440px window, so `md:flex` was true and the phone
 // preview drew the DESKTOP nav — five items on one row, wrapping onto three lines and running off
 // the edge. The header measured the window and reported on a phone that wasn't there.
 //
 // @3xl is 48rem/768px, the same number `md:` used, so a real desktop is unchanged — the threshold is
 // now measured against the thing the header actually sits in.
 <header className="@container">
 {announcement && (
 <div className="px-4 py-2 text-center text-[11px] tracking-wide text-white" style={{ background: colors.accent }}>{announcement}</div>
 )}
 {layout === "center" ? (
 <nav className={`${bar} py-5`} style={style}>
  <div className="flex items-center justify-between gap-4"><span className="w-8 shrink-0" />{brand}{utils}</div>
  {nav.length > 0 && <div className="mt-3 flex justify-center">{links(nav)}</div>}
 </nav>
 ) : layout === "split" ? (
 <nav className={`${bar} flex items-center gap-6 py-5`} style={style}>
  {/* Menu halves pushed to the outer edges; the spacer mirrors the search icon so the brand
      lands dead centre rather than nudged left by it. */}
  <span className="w-8 shrink-0" />
  {links(nav.slice(0, half), "flex-1 justify-start")}
  {brand}
  {links(nav.slice(half), "flex-1 justify-end")}
  {utils}
 </nav>
 ) : layout === "stacked" ? (
 <nav className={`${bar} py-5`} style={style}>
  <div className="flex items-center justify-between gap-4">{brand}{utils}</div>
  {nav.length > 0 && <div className="mt-3">{links(nav)}</div>}
 </nav>
 ) : (
 <nav className={`${bar} flex items-center justify-between gap-4 py-5`} style={style}>
  {brand}
  {links(nav)}
  {utils}
 </nav>
 )}
 {/* Mobile nav — the links under the brand, whatever the desktop layout does. It WRAPS; it does not
     scroll. A horizontally-scrollable strip is technically fine (nothing overflows the page) but it
     reads as broken: the last label is sliced mid-word against the screen edge with nothing to say
     the row can be swiped, so a store with seven pages looks like a store whose header is cut off.
     Wrapping puts every link on screen at any width, which is what a nav is for. `whitespace-nowrap`
     stays on each ITEM, so "Shipping & Returns" breaks between links rather than through one. */}
 {nav.length > 0 && (
 <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border-b border-black/[0.06] px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] opacity-70 @3xl:hidden" style={{ background: colors.bg }}>
 {nav.map((n, i) => <NavItem key={i} n={n} onNav={onNav} className="whitespace-nowrap" />)}
 </div>
 )}
 </header>
 );
}

export function StoreFooter({ storeName, logo, nav, tagline, colors, headingFontFamily, year, socials, footerAbout, newsletter, onNav }: ChromeProps & { tagline?: string | null; socials?: Socials; footerAbout?: string; newsletter?: React.ReactNode }) {
 const links = socialList(socials);
 return (
 // Container, not viewport — same reasoning as the header above. The footer's columns stack at the
 // storefront's own width, so a phone preview stacks them and a desktop doesn't.
 <footer className="@container mt-10 border-t border-black/[0.08]" style={{ color: colors.text }}>
 <div className="mx-auto max-w-6xl px-6 @xl:px-8 py-16">
 {/* Email signup band — every page ends with a chance to subscribe (the "Sign up" the seller asked for). */}
 {newsletter && (
 <div className="mb-14 flex flex-col items-center gap-3 border-b border-black/[0.06] pb-14 text-center">
 <p className="text-xl" style={{ fontFamily: headingFontFamily }}>Join the list</p>
 <p className="max-w-sm text-xs leading-relaxed opacity-55">Be first to know about new arrivals, drops, and private sales.</p>
 <div className="mt-2 w-full max-w-sm">{newsletter}</div>
 </div>
 )}
 <div className="flex flex-col items-center gap-7 text-center @xl:flex-row @xl:items-start @xl:justify-between @xl:text-left">
 <div className="max-w-xs">
 {logo ? (
 <img src={logo} alt={storeName} className="mx-auto h-7 w-auto object-contain @xl:mx-0" draggable={false} />
 ) : (
 <p className="text-lg tracking-[0.14em]" style={{ fontFamily: headingFontFamily }}>{storeName}</p>
 )}
 {(footerAbout || tagline) && <p className="mt-3 text-xs leading-relaxed opacity-55">{footerAbout || tagline}</p>}
 {links.length > 0 && (
 <div className="mt-5 flex items-center justify-center gap-3.5 @xl:justify-start">
 {links.map(({ key, href }) => (
 <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={key} className="opacity-55 transition hover:opacity-100">
 <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{SOCIAL_ICON[key]}</svg>
 </a>
 ))}
 </div>
 )}
 </div>
 {nav.length > 0 && (
 <nav className="flex flex-col items-center gap-2.5 text-[11px] uppercase tracking-[0.16em] opacity-60 @xl:items-end">
 {nav.map((n, i) => <NavItem key={i} n={n} onNav={onNav} className="hover:opacity-100" />)}
 </nav>
 )}
 </div>
 <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-black/[0.06] pt-6 text-[10px] uppercase tracking-[0.22em] opacity-35 @xl:flex-row">
 <span>© {year ?? ""} {storeName}</span>
 <span>Powered by <span style={{ color: colors.accent }}>VYA</span></span>
 </div>
 </div>
 </footer>
 );
}
