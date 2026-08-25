/* eslint-disable @next/next/no-img-element */
// Media sections — image, gallery, video. The picture is the content, so the layouts differ mainly
// in how much of the page it's allowed to take and how it's framed.
import { ImageSlot, emptyHint, type EditKit } from "./kit";
import { ITEM_SCHEMAS } from "@/app/lib/storefront-items";

// ── image ───────────────────────────────────────────────────────────────────────────────────────
// Edge to edge, capped so a tall photo can't swallow the page. The layout that shipped.
function ImageFull({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const setImg = (url: string) => ctx.onEditField?.(kit.b.id, "image", url);
 if (!p.image) return ctx.edit ? <div className="px-6 py-10"><ImageSlot kit={kit} src="" onPick={setImg} ratio="aspect-[21/9]" rounded="vya-img" /></div> : null;
 return (
  <figure className="w-full">
   {ctx.edit
    ? <ImageSlot kit={kit} src={p.image} onPick={setImg} pos={p.imagePos} onPos={(v) => ctx.onEditField?.(kit.b.id, "imagePos", v)} ratio="aspect-[21/9]" rounded="vya-img" />
    : <img src={p.image} alt={p.caption || ""} className="vya-img w-full object-cover" style={{ maxHeight: "70vh" }} />}
   {(p.caption || ctx.edit) && <figcaption {...kit.txt(p.caption, "caption")} className="px-6 py-3 text-center text-xs opacity-60" />}
  </figure>
 );
}

// Held inside the page's measure with real margin around it, caption beneath. The photo reads as a
// plate in a book rather than as a banner.
function ImageInset({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const setImg = (url: string) => ctx.onEditField?.(kit.b.id, "image", url);
 return (
  <figure className="mx-auto max-w-4xl px-6 py-16 @xl:px-8 @xl:py-20">
   <ImageSlot kit={kit} src={p.image} onPick={setImg} pos={p.imagePos} onPos={(v) => ctx.onEditField?.(kit.b.id, "imagePos", v)} ratio="aspect-[4/3]" rounded="vya-img" />
   {(p.caption || ctx.edit) && <figcaption {...kit.txt(p.caption, "caption")} className="mt-3 text-center text-xs opacity-60" />}
  </figure>
 );
}

// Portrait photo with the caption set beside it in the margin — the gallery-label treatment, for a
// single piece worth talking about.
function ImageCaptioned({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const setImg = (url: string) => ctx.onEditField?.(kit.b.id, "image", url);
 return (
  <figure className="mx-auto grid max-w-5xl gap-5 px-6 py-16 @xl:px-8 @xl:py-24 @lg:grid-cols-[1.7fr_1fr] @lg:gap-12">
   <ImageSlot kit={kit} src={p.image} onPick={setImg} pos={p.imagePos} onPos={(v) => ctx.onEditField?.(kit.b.id, "imagePos", v)} ratio="aspect-[4/5]" rounded="vya-img" />
   <figcaption className="flex items-end">
    <span {...kit.txt(p.caption, "caption")} className="text-[13px] leading-relaxed opacity-65" />
   </figcaption>
  </figure>
 );
}

// ── gallery ─────────────────────────────────────────────────────────────────────────────────────
const S = ITEM_SCHEMAS.gallery;

function galleryOps(kit: EditKit) {
 const shots = kit.items(S);
 const setSrc = (i: number, src: string) => kit.setItems(S, shots.map((x, j) => (j === i ? { src } : x)));
 // In the editor an extra empty slot always trails the set, so adding a photo is one click on the
 // canvas rather than a trip to the panel.
 const slots = kit.ctx.edit ? [...shots, { src: "" }] : shots;
 const addAt = shots.length;
 const pick = (i: number) => (url: string) => (i === addAt ? kit.setItems(S, [...shots, { src: url }]) : setSrc(i, url));
 return { shots, slots, pick };
}

// A tight grid, no gutters to speak of — the contact sheet. What shipped.
function GalleryGrid({ kit }: { kit: EditKit }) {
 const { ctx, p } = kit;
 const { shots, slots, pick } = galleryOps(kit);
 if (!shots.length && !ctx.edit) return null;
 const cols = p.cols === "2" ? "@lg:grid-cols-2" : p.cols === "4" ? "@lg:grid-cols-4" : "@lg:grid-cols-3";
 return (
  <div className={`grid grid-cols-2 gap-1 ${cols}`} style={p.gap ? { gap: `${p.gap}px` } : undefined}>
   {slots.map((s, i) => <ImageSlot key={i} kit={kit} src={s.src} onPick={pick(i)} ratio="aspect-square" />)}
  </div>
 );
}

// Airy: fewer per row, real gutters, page margins. The same photos given room to be looked at.
function GalleryLoose({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { shots, slots, pick } = galleryOps(kit);
 if (!shots.length && !ctx.edit) return null;
 return (
  <section className="mx-auto max-w-6xl px-5 py-16 @xl:px-8 @xl:py-24">
   <div className="grid grid-cols-2 gap-4 @lg:grid-cols-3 @xl:gap-6">
    {slots.map((s, i) => <ImageSlot key={i} kit={kit} src={s.src} onPick={pick(i)} ratio="aspect-[4/5]" />)}
   </div>
  </section>
 );
}

// An uneven rhythm — every third photo runs tall. Stops a set of similar shots reading as a
// spreadsheet, without needing the merchant to crop anything.
function GalleryMosaic({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { shots, slots, pick } = galleryOps(kit);
 if (!shots.length && !ctx.edit) return null;
 return (
  <section className="mx-auto max-w-6xl px-5 py-16 @xl:px-8 @xl:py-24">
   <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4 @xl:gap-4">
    {slots.map((s, i) => (
     <div key={i} className={i % 3 === 0 ? "row-span-2" : ""}>
      <ImageSlot kit={kit} src={s.src} onPick={pick(i)} ratio={i % 3 === 0 ? "aspect-[3/4]" : "aspect-square"} />
     </div>
    ))}
   </div>
  </section>
 );
}

// A swipeable strip that bleeds off the edge. Fits a whole lookbook in one band of the page.
function GalleryRail({ kit }: { kit: EditKit }) {
 const { ctx } = kit;
 const { shots, slots, pick } = galleryOps(kit);
 if (!shots.length && !ctx.edit) return null;
 return (
  <section className="py-16 @xl:py-20">
   <div className="vya-rail flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 @xl:gap-4 @xl:px-8">
    {slots.map((s, i) => (
     <div key={i} className="shrink-0 snap-start" style={{ width: "min(62vw, 20rem)" }}>
      <ImageSlot kit={kit} src={s.src} onPick={pick(i)} ratio="aspect-[3/4]" />
     </div>
    ))}
   </div>
   <style dangerouslySetInnerHTML={{ __html: ".vya-rail{justify-content:safe center;scrollbar-width:none;-ms-overflow-style:none}.vya-rail::-webkit-scrollbar{display:none}" }} />
  </section>
 );
}

// ── video ───────────────────────────────────────────────────────────────────────────────────────
// Resolve a pasted link to an embeddable player; a direct file falls through to a <video>.
function videoEmbed(url: string) {
 const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
 const vimeo = url.match(/vimeo\.com\/(\d+)/);
 return yt ? `https://www.youtube.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}
function Player({ url, caption, ratio = "16 / 9" }: { url: string; caption?: string; ratio?: string }) {
 const embed = videoEmbed(url);
 return (
  <div className="vya-round relative w-full overflow-hidden bg-black" style={{ aspectRatio: ratio }}>
   {embed
    ? <iframe src={embed} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen title={caption || "Video"} />
    : <video src={url} controls playsInline className="absolute inset-0 h-full w-full object-cover" />}
  </div>
 );
}
const NoVideo = ({ kit }: { kit: EditKit }) => emptyHint(kit.ctx, "Video — paste a YouTube, Vimeo, or .mp4 link");

function VideoFramed({ kit }: { kit: EditKit }) {
 const { p } = kit;
 const url = (p.url || "").trim();
 if (!url) return <NoVideo kit={kit} />;
 return (
  <section className="mx-auto max-w-5xl px-5 py-16 @xl:px-8 @xl:py-20">
   <Player url={url} caption={p.caption} />
   {p.caption && <p {...kit.txt(p.caption, "caption")} className="mt-3 text-center text-xs opacity-60" />}
  </section>
 );
}

// Edge to edge, no margin. The video becomes the section — for a campaign film rather than a clip.
function VideoBleed({ kit }: { kit: EditKit }) {
 const { p } = kit;
 const url = (p.url || "").trim();
 if (!url) return <NoVideo kit={kit} />;
 return (
  <section className="w-full">
   <Player url={url} caption={p.caption} ratio="21 / 9" />
   {p.caption && <p {...kit.txt(p.caption, "caption")} className="px-6 py-3 text-center text-xs opacity-60" />}
  </section>
 );
}

// Portrait, held narrow — the shape a phone shoots. Suits a reel or a try-on clip, which look wrong
// letterboxed into 16:9.
function VideoPortrait({ kit }: { kit: EditKit }) {
 const { p } = kit;
 const url = (p.url || "").trim();
 if (!url) return <NoVideo kit={kit} />;
 return (
  <section className="mx-auto max-w-md px-5 py-16 @xl:py-20">
   <Player url={url} caption={p.caption} ratio="9 / 16" />
   {p.caption && <p {...kit.txt(p.caption, "caption")} className="mt-3 text-center text-xs opacity-60" />}
  </section>
 );
}

export function renderImage(kit: EditKit, variant: string) {
 switch (variant) {
  case "inset": return <ImageInset kit={kit} />;
  case "captioned": return <ImageCaptioned kit={kit} />;
  default: return <ImageFull kit={kit} />;
 }
}
export function renderGallery(kit: EditKit, variant: string) {
 switch (variant) {
  case "loose": return <GalleryLoose kit={kit} />;
  case "mosaic": return <GalleryMosaic kit={kit} />;
  case "rail": return <GalleryRail kit={kit} />;
  default: return <GalleryGrid kit={kit} />;
 }
}
export function renderVideo(kit: EditKit, variant: string) {
 switch (variant) {
  case "bleed": return <VideoBleed kit={kit} />;
  case "portrait": return <VideoPortrait kit={kit} />;
  default: return <VideoFramed kit={kit} />;
 }
}
