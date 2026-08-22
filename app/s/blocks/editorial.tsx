/* eslint-disable @next/next/no-img-element */
// Editorial sections — blog (the journal row) and spotlight (one hero piece).
import { FreeField, ImageSlot, emptyHint, spotlightProps, type EditKit, type Item } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";

const S = ITEM_SCHEMAS.blog;

function Heading({ kit, className }: { kit: EditKit; className: string }) {
 const { b, ctx, p } = kit;
 if (!p.heading && !ctx.edit) return null;
 return <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className={`vya-heading ${className}`} style={{ fontFamily: ctx.head }} />;
}

function usePosts(kit: EditKit) {
 const all = kit.items(S);
 // A post with no title is a half-typed row: fine on the canvas, not on the live site.
 const posts = kit.ctx.edit ? all : all.filter((a) => a.title);
 const set = (i: number, patch: Item) => kit.setItems(S, all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
 return { posts, set };
}
// In the editor a post's link is inert, so clicking the card edits its text instead of navigating away.
const href = (kit: EditKit, a: Item) => (kit.ctx.edit ? undefined : a.link || "#");

// ── blog: three across (what shipped) ───────────────────────────────────────────────────────────
function BlogRow({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { posts, set } = usePosts(kit);
 if (!posts.length) return emptyHint(ctx, "Blog — add posts");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-10 text-center text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className="grid gap-8 @lg:grid-cols-3 @lg:gap-10">
    {posts.slice(0, 3).map((a, i) => (
     <a key={i} href={href(kit, a)} className="group block">
      <ImageSlot kit={kit} src={a.img} alt={a.title} onPick={(url) => set(i, { img: url })} ratio="aspect-[3/2]" />
      <h3 {...kit.txtItem(a.title, (v) => set(i, { title: v }))} className="mt-4 text-lg leading-snug @xl:text-xl" style={{ fontFamily: ctx.head }} />
      {(a.excerpt || ctx.edit) && <p {...kit.txtItem(a.excerpt, (v) => set(i, { excerpt: v }))} className="mt-2 text-[13px] leading-relaxed opacity-65" />}
      <span className="mt-3 inline-block text-[11px] uppercase tracking-[0.16em]" style={{ color: ctx.colors.accent }}>Read more →</span>
     </a>
    ))}
   </div>
  </section>
 );
}

// One lead story at full width with the rest listed beside it — the front page. Gives the newest or
// best piece the weight it deserves instead of flattening everything into equal cards.
function BlogFeature({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { posts, set } = usePosts(kit);
 if (!posts.length) return emptyHint(ctx, "Blog — add posts");
 const [lead, ...rest] = posts;
 return (
  <section className="vya-free-canvas relative mx-auto max-w-6xl px-5 @xl:px-8 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-10 text-3xl @xl:text-[2.4rem] leading-tight" />
   <div className="grid gap-8 @lg:grid-cols-[1.4fr_1fr] @lg:gap-14">
    <a href={href(kit, lead)} className="group block">
     <ImageSlot kit={kit} src={lead.img} alt={lead.title} onPick={(url) => set(0, { img: url })} ratio="aspect-[3/2]" />
     <h3 {...kit.txtItem(lead.title, (v) => set(0, { title: v }))} className="mt-5 text-2xl leading-snug @xl:text-3xl" style={{ fontFamily: ctx.head }} />
     {(lead.excerpt || ctx.edit) && <p {...kit.txtItem(lead.excerpt, (v) => set(0, { excerpt: v }))} className="mt-3 max-w-xl text-[14px] leading-relaxed opacity-65" />}
    </a>
    <div style={{ borderTop: `1px solid ${ctx.fg}1f` }}>
     {rest.map((a, i) => (
      <a key={i} href={href(kit, a)} className="group block py-5" style={{ borderBottom: `1px solid ${ctx.fg}1f` }}>
       <h3 {...kit.txtItem(a.title, (v) => set(i + 1, { title: v }))} className="text-base leading-snug transition-opacity group-hover:opacity-60 @xl:text-lg" style={{ fontFamily: ctx.head }} />
       {(a.excerpt || ctx.edit) && <p {...kit.txtItem(a.excerpt, (v) => set(i + 1, { excerpt: v }))} className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed opacity-60" />}
      </a>
     ))}
    </div>
   </div>
  </section>
 );
}

// One post per row: thumbnail, title, excerpt. Scales past three posts without the page becoming a
// grid of near-identical cards — the archive view.
function BlogList({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { posts, set } = usePosts(kit);
 if (!posts.length) return emptyHint(ctx, "Blog — add posts");
 return (
  <section className="vya-free-canvas relative mx-auto max-w-4xl px-5 @xl:px-8 py-16 @xl:py-24">
   <Heading kit={kit} className="mb-8 text-3xl @xl:text-[2.4rem] leading-tight" />
   <div style={{ borderTop: `1px solid ${ctx.fg}1f` }}>
    {posts.map((a, i) => (
     <a key={i} href={href(kit, a)} className="group flex items-start gap-5 py-6" style={{ borderBottom: `1px solid ${ctx.fg}1f` }}>
      <span className="w-24 shrink-0 @lg:w-32"><ImageSlot kit={kit} src={a.img} alt={a.title} onPick={(url) => set(i, { img: url })} ratio="aspect-[4/3]" /></span>
      <span className="min-w-0 flex-1">
       <h3 {...kit.txtItem(a.title, (v) => set(i, { title: v }))} className="text-lg leading-snug @xl:text-xl" style={{ fontFamily: ctx.head }} />
       {(a.excerpt || ctx.edit) && <p {...kit.txtItem(a.excerpt, (v) => set(i, { excerpt: v }))} className="mt-1.5 text-[13px] leading-relaxed opacity-65" />}
      </span>
     </a>
    ))}
   </div>
  </section>
 );
}

// ── spotlight: one piece, given the page ────────────────────────────────────────────────────────
function SpotlightBody({ kit }: { kit: EditKit }) {
 const { b, ctx, p, txtPlain } = kit;
 return (
  <>
   {p.heading && <FreeField b={b} ctx={ctx} fieldKey="heading" tag="h2" value={p.heading} className="vya-heading text-3xl @xl:text-4xl leading-tight" style={{ fontFamily: ctx.head }} />}
   {p.price && <FreeField b={b} ctx={ctx} fieldKey="price" tag="p" value={p.price} className="mt-2 text-xl" style={{ color: ctx.colors.accent }} />}
   {p.subtext && <p {...txtPlain(p.subtext, "subtext")} className="vya-body mt-4 whitespace-pre-wrap text-sm leading-[1.8] opacity-75 @xl:text-[15px]" />}
   {p.cta && <FreeField b={b} ctx={ctx} fieldKey="cta" tag="a" value={p.cta} href={ctx.shopHref} className="vya-cta mt-7 inline-block px-8 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85" style={{ background: ctx.colors.accent, color: "#fff" }} />}
  </>
 );
}
const pickImage = (kit: EditKit) => (url: string) => kit.ctx.onEditField?.(kit.b.id, "image", url);

function SpotlightHalf({ kit }: { kit: EditKit }) {
 return (
  <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 @xl:px-8 py-16 @xl:py-24 @lg:grid-cols-2 @lg:gap-14">
   <ImageSlot kit={kit} src={kit.p.image} onPick={pickImage(kit)} ratio="aspect-square" rounded="vya-img" />
   <div className="vya-free-canvas relative"><SpotlightBody kit={kit} /></div>
  </section>
 );
}

// The details sit over the photo, bottom-left. One image, one price, one button — the way a single
// piece is presented in a lookbook rather than in a catalogue.
function SpotlightOverlay({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 return (
  <section className="vya-fill relative w-full">
   <div className="relative min-h-[70vh] w-full overflow-hidden" style={{ background: `${ctx.fg}0d` }}>
    {p.image && <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
    {p.image && <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.05) 55%)" }} />}
    <div className={`vya-free-canvas relative flex min-h-[70vh] flex-col justify-end p-8 @xl:p-14 ${p.image ? "text-white" : ""}`}>
     <SpotlightBody kit={kit} />
    </div>
   </div>
  </section>
 );
}

// Photo above, details centred beneath — the product-page shape. The one spotlight layout that
// doesn't reflow between a phone and a desktop.
function SpotlightStacked({ kit }: { kit: EditKit }) {
 return (
  <section className="mx-auto max-w-3xl px-5 @xl:px-8 py-16 @xl:py-24">
   <ImageSlot kit={kit} src={kit.p.image} onPick={pickImage(kit)} ratio="aspect-[4/5]" rounded="vya-img" />
   <div className="vya-free-canvas relative mt-9 text-center [&_.vya-cta]:mx-auto"><SpotlightBody kit={kit} /></div>
  </section>
 );
}

export function renderBlog(kit: EditKit, variant: string) {
 switch (variant) {
  case "feature": return <BlogFeature kit={kit} />;
  case "list": return <BlogList kit={kit} />;
  default: return <BlogRow kit={kit} />;
 }
}
export function renderSpotlight(kit: EditKit, variant: string) {
 // A Spotlight pointed at a collection features that collection's lead piece. Rebuilt here rather
 // than inside each layout so all three behave identically — and so a new Spotlight layout gets it
 // without having to know the feature exists.
 kit = { ...kit, p: spotlightProps(kit.ctx, kit.p) };
 switch (variant) {
  case "overlay": return <SpotlightOverlay kit={kit} />;
  case "stacked": return <SpotlightStacked kit={kit} />;
  default: return <SpotlightHalf kit={kit} />;
 }
}
