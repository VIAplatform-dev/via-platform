/* eslint-disable @next/next/no-img-element */
// Presentational renderer for the section-based storefront. No hooks / no client
// APIs, so it renders identically in the live store (server component) and the
// editor's live preview (client). Sections come from theme.blocks.
import type { Block } from "@/app/lib/storefront-blocks";
import NewsletterForm from "./NewsletterForm";

const SERIFS = new Set(["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces"]);
const ff = (name?: string) => (name ? `'${name}', ${SERIFS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

export type BlockProduct = { key?: string; title: string; price: string; image: string; href?: string };
type Colors = { bg: string; text: string; accent: string };

function isDark(hex: string): boolean {
 const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
 return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

// Resolve a section's background → { background, fg (text colour) }.
function bgFor(bg: string | undefined, colors: Colors): { background?: string; fg: string } {
 if (!bg) return { fg: colors.text };
 if (bg === "dark") return { background: "#161616", fg: "#ffffff" };
 if (bg === "accent") return { background: colors.accent, fg: "#ffffff" };
 if (/^#[0-9a-fA-F]{6}$/.test(bg)) return { background: bg, fg: isDark(bg) ? "#ffffff" : colors.text };
 return { fg: colors.text };
}

type Ctx = { colors: Colors; head?: string; body?: string; products: BlockProduct[]; shopHref: string; fg: string };

function blockBody(b: Block, ctx: Ctx) {
 const p = b.props || {};
 const { colors, head, products, shopHref, fg } = ctx;
 switch (b.type) {
 case "announcement":
 return p.text ? <div className="px-4 py-2.5 text-center text-[10px] uppercase tracking-[0.22em]" style={{ background: colors.accent, color: "#fff" }}>{p.text}</div> : null;

 case "hero":
 return p.image ? (
 <div className="relative w-full overflow-hidden" style={{ minHeight: "84vh" }}>
 <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.6) 100%)" }} />
 <div className="vya-hero-inner relative z-10 flex min-h-[84vh] flex-col items-center justify-end px-6 pb-24 pt-36 text-center text-white">
 <h2 className="vya-heading max-w-3xl text-5xl leading-[1.04] sm:text-7xl" style={{ fontFamily: head }}>{p.heading}</h2>
 {p.subtext && <p className="vya-sub mt-5 max-w-xl text-sm leading-relaxed text-white/85 sm:text-[15px]">{p.subtext}</p>}
 {p.cta && <a href={shopHref} className="vya-cta mt-9 inline-block border border-white/70 px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:bg-white hover:text-black">{p.cta}</a>}
 </div>
 </div>
 ) : (
 <div className="vya-hero-inner px-6 py-32 text-center">
 <h2 className="vya-heading mx-auto max-w-3xl text-5xl leading-[1.05] sm:text-6xl" style={{ fontFamily: head }}>{p.heading}</h2>
 {p.subtext && <p className="vya-sub mt-5 mx-auto max-w-xl text-sm leading-relaxed opacity-65 sm:text-[15px]">{p.subtext}</p>}
 {p.cta && <a href={shopHref} className="vya-cta mt-9 inline-block px-10 py-3.5 text-[11px] uppercase tracking-[0.24em] transition hover:opacity-85" style={{ background: colors.accent, color: "#fff" }}>{p.cta}</a>}
 </div>
 );

 case "featured": {
 const shown = products.slice(0, 8);
 return (
 <section className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-24">
 {p.heading && (
 <div className="mb-12 text-center">
 <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] opacity-40">The Edit</span>
 <h2 className="vya-heading text-3xl sm:text-[2.6rem] leading-tight" style={{ fontFamily: head }}>{p.heading}</h2>
 </div>
 )}
 {shown.length ? (
 <div className="grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-8">
 {shown.map((it, i) => (
 <a key={it.key || i} href={it.href || shopHref} className="group block">
 <div className="aspect-[4/5] w-full overflow-hidden" style={{ background: `${fg}0d` }}>
 {it.image && <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.045]" />}
 </div>
 <p className="mt-3.5 line-clamp-1 text-[11px] uppercase tracking-[0.1em] opacity-65">{it.title}</p>
 <p className="mt-1 text-[13px]" style={{ color: colors.accent }}>{it.price}</p>
 </a>
 ))}
 </div>
 ) : (
 <p className="py-16 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">Coming soon</p>
 )}
 </section>
 );
 }

 case "text":
 return (
 <section className="mx-auto max-w-2xl px-6 py-20 sm:py-24 text-center">
 {p.heading && <h2 className="vya-heading mb-5 text-3xl sm:text-4xl leading-tight" style={{ fontFamily: head }}>{p.heading}</h2>}
 {p.body && <p className="vya-body text-sm leading-[1.9] opacity-75 sm:text-[15px] whitespace-pre-wrap">{p.body}</p>}
 </section>
 );

 case "image":
 return p.image ? (
 <figure className="w-full">
 <img src={p.image} alt={p.caption || ""} className="vya-img w-full object-cover" style={{ maxHeight: "70vh" }} />
 {p.caption && <figcaption className="px-6 py-3 text-center text-xs opacity-60">{p.caption}</figcaption>}
 </figure>
 ) : null;

 case "gallery": {
 const imgs = (p.images || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
 return imgs.length ? (
 <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
 {imgs.slice(0, 9).map((src, i) => (
 <div key={i} className="aspect-square overflow-hidden"><img src={src} alt="" className="h-full w-full object-cover" /></div>
 ))}
 </div>
 ) : null;
 }

 case "video": {
 const url = (p.url || "").trim();
 if (!url) return null;
 const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
 const vimeo = url.match(/vimeo\.com\/(\d+)/);
 const embed = yt ? `https://www.youtube.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
 return (
 <section className="mx-auto max-w-5xl px-5 sm:px-8 py-16 sm:py-20">
 <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
 {embed ? (
 <iframe src={embed} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen title={p.caption || "Video"} />
 ) : (
 <video src={url} controls playsInline className="absolute inset-0 h-full w-full object-cover" />
 )}
 </div>
 {p.caption && <p className="mt-3 text-center text-xs opacity-60">{p.caption}</p>}
 </section>
 );
 }

 case "newsletter":
 return (
 <section className="px-6 py-20 sm:py-24 text-center" style={{ borderTop: `1px solid ${fg}1a` }}>
 <h2 className="vya-heading text-3xl sm:text-4xl leading-tight" style={{ fontFamily: head }}>{p.heading || "Join the list"}</h2>
 {p.subtext && <p className="vya-sub mt-3 mx-auto max-w-md text-sm opacity-65">{p.subtext}</p>}
 <div className="mt-7"><NewsletterForm accent={colors.accent} /></div>
 </section>
 );

 default:
 return null;
 }
}

export default function Blocks({
 blocks,
 colors,
 fonts,
 products,
 shopHref = "#",
 onSelect,
 selectedId,
}: {
 blocks: Block[];
 colors: Colors;
 fonts: { heading?: string; body?: string };
 products: BlockProduct[];
 shopHref?: string;
 // Editor-only: click a section in the preview to select/edit it.
 onSelect?: (id: string) => void;
 selectedId?: string | null;
}) {
 const head = ff(fonts.heading);
 const body = ff(fonts.body);
 return (
 <div style={{ fontFamily: body, color: colors.text }}>
 {blocks.map((b) => {
 const { background, fg } = bgFor(b.style?.bg, colors);
 const inner = blockBody(b, { colors, head, body, products, shopHref, fg });
 const editable = typeof onSelect === "function";
 // Stable, targetable classes so custom CSS (AI- or hand-written) can hook any section
 // and element: e.g. `.vya-hero .vya-heading { ... }` or `.vya-b-<id> { ... }`.
 const secClass = `vya-sec vya-${b.type} vya-b-${b.id}`;
 return (
 <div
 key={b.id}
 onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onSelect!(b.id); } : undefined}
 className={editable ? `${secClass} group/sec relative cursor-pointer transition-shadow ${selectedId === b.id ? "shadow-[inset_0_0_0_2px_#5D0F17]" : "hover:shadow-[inset_0_0_0_2px_rgba(93,15,23,0.45)]"}` : secClass}
 style={background ? { background, color: fg } : undefined}
 >
 {editable && (
 <span className={`pointer-events-none absolute left-2 top-2 z-20 rounded bg-[#5D0F17] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white transition-opacity ${selectedId === b.id ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"}`}>{b.type.replace(/[-_]/g, " ")}</span>
 )}
 {inner}
 </div>
 );
 })}
 </div>
 );
}
