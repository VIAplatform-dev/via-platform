// A tiny, abstract wireframe of what each section looks like — so the "Add section" picker reads visually
// (Framer/Squarespace style) instead of as a wall of text. Pure CSS shapes; the accent bit uses brand red.
// Shared by the blocks studio and the captured-site editor so both galleries look identical.
import type { BlockType } from "@/app/lib/storefront-blocks";

export default function SectionThumb({ type, variant }: { type: BlockType | string; variant?: string }) {
 const A = "bg-[#5D0F17]"; // accent element (a heading or a button)
 const N = "bg-stone-300"; // neutral text line
 const B = "bg-stone-200"; // media / box
 const bar = (w: string, cls = N) => <span className={`h-1 rounded-full ${cls}`} style={{ width: w }} />;
 const wrap = (children: React.ReactNode, cls = "justify-center") => (
 <div className={`flex h-full w-full flex-col items-center gap-1 overflow-hidden p-2.5 ${cls}`}>{children}</div>
 );
 // Layout wireframes. A variant's thumbnail has to show the actual COMPOSITION — where the photo is,
 // where the type sits, how many panels — because that's the only thing distinguishing one card from
 // another in the picker. A generic placeholder here would make the whole gallery unreadable.
 if (variant) switch (`${type}/${variant}`) {
 // hero — content over a full photo (default), a swipeable set, photo beside text, type above photo,
 // and an inset frame with the headline across its lower edge.
 case "hero/slides": return (
  <div className="flex h-full w-full gap-1 overflow-hidden p-1.5">
   <span className={`flex h-full w-[62%] shrink-0 flex-col justify-end gap-1 rounded-sm p-2 ${B}`}>{bar("70%", A)}{bar("45%")}</span>
   <span className={`h-full w-[30%] shrink-0 rounded-sm ${B} opacity-60`} />
   <span className={`h-full flex-1 rounded-sm ${B} opacity-30`} />
  </div>
 );
 case "hero/split": return (
  <div className="flex h-full w-full items-stretch overflow-hidden">
   <span className={`h-full w-1/2 ${B}`} />
   <span className="flex h-full w-1/2 flex-col justify-center gap-1 p-2.5">{bar("80%", A)}{bar("100%")}<span className={`mt-1 h-2 w-8 rounded-full ${A}`} /></span>
  </div>
 );
 case "hero/stack": return (
  <div className="flex h-full w-full flex-col overflow-hidden">
   <span className="flex flex-col items-center gap-1 px-2 pb-1.5 pt-3">{bar("58%", A)}{bar("36%")}<span className={`mt-0.5 h-2 w-8 rounded-full ${A}`} /></span>
   <span className={`w-full flex-1 ${B}`} />
  </div>
 );
 case "hero/frame": return (
  <div className="h-full w-full p-2">
   <span className={`flex h-full w-full flex-col justify-end gap-1 rounded-sm p-2 ${B}`}>{bar("62%", A)}{bar("40%")}</span>
  </div>
 );

 // featured — even grid, a rail bleeding off the edge, one lead piece + a stack, an uneven mosaic,
 // and a dense row-per-piece list.
 case "featured/carousel": return wrap(<>{bar("30%", A)}<div className="flex w-full gap-1 overflow-hidden"><span className={`h-8 w-8 shrink-0 rounded-sm ${B}`} /><span className={`h-8 w-8 shrink-0 rounded-sm ${B}`} /><span className={`h-8 w-8 shrink-0 rounded-sm ${B}`} /><span className={`h-8 w-5 shrink-0 rounded-sm ${B} opacity-50`} /></div></>);
 case "featured/editorial": return wrap(<>{bar("30%", A)}<div className="flex w-full gap-1"><span className={`h-10 flex-[1.3] rounded-sm ${B}`} /><span className="flex flex-1 flex-col gap-1"><span className={`h-[18px] w-full rounded-sm ${B}`} /><span className={`h-[18px] w-full rounded-sm ${B}`} /></span></div></>);
 case "featured/mosaic": return wrap(<div className="grid w-full grid-cols-3 grid-rows-2 gap-1"><span className={`col-span-2 row-span-2 rounded-sm ${B}`} /><span className={`rounded-sm ${B}`} /><span className={`rounded-sm ${B}`} /></div>);
 case "featured/list": return wrap(<span className="flex w-full flex-col gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="flex w-full items-center gap-1.5"><span className={`h-4 w-3 rounded-sm ${B}`} />{bar("50%")}<span className="flex-1" /><span className={`h-1 w-4 rounded-full ${A}`} /></span>)}</span>);

 // collections — grid, rail, two large, circles, typographic index.
 case "collections/row": return wrap(<>{bar("34%", A)}<div className="flex w-full gap-1 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-7 w-5 shrink-0 rounded-sm ${B}`} />)}</div></>);
 case "collections/duo": return wrap(<>{bar("34%", A)}<div className="flex w-full gap-1.5"><span className={`h-9 flex-1 rounded-sm ${B}`} /><span className={`h-9 flex-1 rounded-sm ${B}`} /></div></>);
 case "collections/circles": return wrap(<>{bar("34%", A)}<div className="flex w-full justify-center gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-6 w-6 rounded-full ${B}`} />)}</div></>);
 case "collections/list": return wrap(<span className="flex w-full flex-col gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="flex w-full items-center justify-between border-b border-stone-200 pb-1">{bar("46%", A)}<span className={`h-1 w-1.5 rounded-full ${N}`} /></span>)}</span>);

 // testimonials — three cards, one large quote, plain running text, a scrolling strip.
 case "testimonials/single": return wrap(<><div className="flex gap-0.5">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1 w-1 rounded-full ${A}`} />)}</div>{bar("80%")}{bar("64%")}{bar("24%", A)}</>);
 case "testimonials/plain": return wrap(<span className="flex w-full flex-col items-start gap-1.5"><span className="flex w-full flex-col gap-1">{bar("92%")}{bar("30%", A)}</span><span className="flex w-full flex-col gap-1">{bar("84%")}{bar("26%", A)}</span></span>);
 case "testimonials/marquee": return wrap(<div className="flex w-full items-center gap-2 overflow-hidden">{[0, 1, 2, 3].map((i) => <span key={i} className="flex shrink-0 items-center gap-1"><span className={`h-1 w-10 rounded-full ${N}`} /><span className={`h-1 w-4 rounded-full ${A}`} /></span>)}</div>);

 // split — half/half, offset, edge-to-edge panel, stacked.
 case "split/offset": return wrap(<div className="flex w-full items-end gap-2"><span className={`h-12 w-1/2 rounded-sm ${B}`} /><span className="flex flex-1 flex-col gap-1 pb-1">{bar("80%", A)}{bar("100%")}{bar("60%")}</span></div>);
 case "split/panel": return (
  <div className="flex h-full w-full items-stretch overflow-hidden">
   <span className={`h-full w-1/2 ${B}`} />
   <span className="flex h-full w-1/2 flex-col justify-center gap-1 bg-stone-100 p-2.5">{bar("80%", A)}{bar("100%")}{bar("64%")}</span>
  </div>
 );
 case "split/stacked": return wrap(<><span className={`h-6 w-full rounded-sm ${B}`} />{bar("52%", A)}{bar("74%")}</>);

 // columns — with photos, promises, numbered steps, framed panels.
 case "columns/claims": return wrap(<div className="flex w-full items-start gap-2 border-y border-stone-200 py-2">{[0, 1, 2].map((i) => <span key={i} className="flex flex-1 flex-col items-center gap-1">{bar("70%", A)}{bar("90%")}</span>)}</div>);
 case "columns/steps": return wrap(<div className="flex w-full items-start gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="flex flex-1 flex-col items-start gap-1"><span className="flex w-full items-center gap-1"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${A}`} /><span className="h-px flex-1 bg-stone-200" /></span>{bar("80%", A)}{bar("100%")}</span>)}</div>);
 case "columns/bordered": return wrap(<div className="grid w-full grid-cols-3 border border-stone-200">{[0, 1, 2].map((i) => <span key={i} className="flex flex-col items-start gap-1 border-r border-stone-200 p-1.5 last:border-r-0">{bar("80%", A)}{bar("100%")}</span>)}</div>);

 // announcement — solid bar, hairline rule, scrolling ticker.
 case "announcement/quiet": return wrap(<><span className="w-full border-y border-stone-300 py-1">{bar("60%", N)}</span><span className="flex-1" /></>, "justify-start");
 case "announcement/ticker": return wrap(<><span className={`flex h-2 w-full items-center gap-2 overflow-hidden rounded-sm ${A} px-1`}>{[0, 1, 2].map((i) => <span key={i} className="h-0.5 w-6 shrink-0 rounded-full bg-white/70" />)}</span><span className="flex-1" /></>, "justify-start");

 // countdown — centred, a compact band, the clock at display size.
 case "countdown/strip": return wrap(<div className="flex w-full items-center justify-between gap-2 border-y border-stone-200 py-2"><span className="flex flex-col gap-1">{bar("46px", A)}{bar("30px")}</span><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-4 w-3 rounded-sm ${i % 2 ? B : A}`} />)}</span></div>);
 case "countdown/display": return wrap(<><div className="flex items-center gap-1.5">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-8 w-6 rounded-sm ${i % 2 ? B : A}`} />)}</div>{bar("50%", A)}{bar("34%")}</>);

 // blog — three across, a lead story, an archive list.
 case "blog/feature": return wrap(<div className="flex w-full gap-2"><span className="flex flex-1 flex-col gap-1"><span className={`h-8 w-full rounded-sm ${B}`} />{bar("80%", A)}{bar("60%")}</span><span className="flex flex-1 flex-col gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="flex flex-col gap-0.5 border-b border-stone-200 pb-1">{bar("90%", A)}{bar("60%")}</span>)}</span></div>);
 case "blog/list": return wrap(<span className="flex w-full flex-col gap-1.5">{[0, 1].map((i) => <span key={i} className="flex w-full items-start gap-1.5 border-b border-stone-200 pb-1.5"><span className={`h-6 w-8 shrink-0 rounded-sm ${B}`} /><span className="flex flex-1 flex-col gap-1">{bar("70%", A)}{bar("100%")}</span></span>)}</span>);

 // text — centred, editorial two-up, newspaper columns, a big lede.
 case "text/editorial": return wrap(<div className="flex w-full items-start gap-2.5"><span className="flex w-1/3 flex-col gap-1">{bar("100%", A)}{bar("70%", A)}</span><span className="flex flex-1 flex-col gap-1">{bar("100%")}{bar("100%")}{bar("80%")}</span></div>);
 case "text/columns": return wrap(<span className="flex w-full flex-col gap-1.5">{bar("40%", A)}<span className="flex w-full gap-2">{[0, 1].map((i) => <span key={i} className="flex flex-1 flex-col gap-1">{bar("100%")}{bar("100%")}{bar("70%")}</span>)}</span></span>);
 case "text/lede": return wrap(<span className="flex w-full flex-col items-start gap-1.5"><span className={`h-2 w-[80%] rounded-sm ${A}`} /><span className={`h-2 w-[55%] rounded-sm ${A}`} /><span className="mt-1 flex w-1/2 flex-col gap-1">{bar("100%")}{bar("80%")}</span></span>);

 // image — full bleed, inset with margin, portrait with a side caption.
 case "image/inset": return wrap(<span className={`h-3/4 w-4/5 rounded-sm ${B}`} />);
 case "image/captioned": return wrap(<div className="flex h-full w-full items-end gap-2"><span className={`h-full w-2/3 rounded-sm ${B}`} /><span className="flex flex-1 flex-col gap-1 pb-1">{bar("100%")}{bar("70%")}</span></div>);

 // gallery — contact sheet, airy, uneven mosaic, swipeable rail.
 case "gallery/loose": return wrap(<div className="grid w-full grid-cols-3 gap-1.5">{Array.from({ length: 3 }).map((_, i) => <span key={i} className={`h-8 rounded-sm ${B}`} />)}</div>);
 case "gallery/mosaic": return wrap(<div className="grid w-full grid-cols-4 grid-rows-2 gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`rounded-sm ${B} ${i === 0 ? "row-span-2" : ""}`} />)}</div>);
 case "gallery/rail": return wrap(<div className="flex w-full gap-1 overflow-hidden">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-9 w-7 shrink-0 rounded-sm ${B}`} />)}</div>);

 // marquee — scrolling, static row, oversized display.
 case "marquee/static": return wrap(<div className="flex w-full items-center justify-center gap-1.5 border-y border-stone-200 py-2">{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-1.5"><span className={`h-1 w-7 rounded-full ${N}`} />{i < 2 && <span className={`h-1 w-1 rounded-full ${A}`} />}</span>)}</div>);
 case "marquee/display": return wrap(<div className="flex w-full items-center gap-2 overflow-hidden">{[0, 1, 2].map((i) => <span key={i} className={`h-3 w-14 shrink-0 rounded-sm ${B}`} />)}</div>);

 // statement — large, boxed pull quote, credited beside.
 case "statement/boxed": return wrap(<span className="flex w-full flex-col items-center gap-1 border-y border-stone-300 py-2.5">{bar("74%", A)}{bar("52%", A)}{bar("22%")}</span>);
 case "statement/side": return wrap(<div className="flex w-full items-end gap-2"><span className="flex flex-1 flex-col gap-1">{bar("100%", A)}{bar("80%", A)}</span><span className="border-l border-stone-300 pl-2">{bar("28px")}</span></div>);

 // spotlight — half/half, details over the photo, stacked.
 case "spotlight/overlay": return (
  <div className="h-full w-full p-1.5">
   <span className={`flex h-full w-full flex-col justify-end gap-1 rounded-sm p-2 ${B}`}>{bar("55%", A)}{bar("30%")}<span className={`mt-0.5 h-2 w-8 rounded-full ${A}`} /></span>
  </div>
 );
 case "spotlight/stacked": return wrap(<><span className={`h-7 w-2/3 rounded-sm ${B}`} />{bar("46%", A)}{bar("28%")}</>);

 // video — framed, full bleed, portrait.
 case "video/bleed": return wrap(<span className={`relative grid h-1/2 w-full place-items-center ${B}`}><span className="h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-stone-400" /></span>);
 case "video/portrait": return wrap(<span className={`relative grid h-full w-1/3 place-items-center rounded-sm ${B}`}><span className="h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-stone-400" /></span>);

 // newsletter — centred, split, band, over a photo.
 case "newsletter/split": return wrap(<div className="flex w-full items-center gap-2"><span className="flex flex-1 flex-col gap-1">{bar("80%", A)}{bar("100%")}</span><span className="flex flex-1 gap-1"><span className={`h-2.5 flex-1 rounded-sm ${B}`} /><span className={`h-2.5 w-5 rounded-sm ${A}`} /></span></div>);
 case "newsletter/bar": return wrap(<div className="flex w-full items-center justify-between gap-2 bg-stone-100 p-2">{bar("34%", A)}<span className="flex gap-1"><span className={`h-2.5 w-10 rounded-sm ${B}`} /><span className={`h-2.5 w-5 rounded-sm ${A}`} /></span></div>);
 case "newsletter/photo": return (
  <div className={`flex h-full w-full flex-col items-center justify-center gap-1 ${B}`}>
   {bar("52%", A)}<span className="mt-0.5 flex w-3/5 gap-1"><span className="h-2.5 flex-1 rounded-sm bg-white/80" /><span className={`h-2.5 w-5 rounded-sm ${A}`} /></span>
  </div>
 );

 // contact — centred, split with details, card.
 case "contact/split": return wrap(<div className="flex w-full items-start gap-2"><span className="flex flex-1 flex-col gap-1">{bar("80%", A)}{bar("100%")}{bar("60%")}</span><span className="flex flex-1 flex-col gap-1"><span className={`h-2 w-full rounded-sm ${B}`} /><span className={`h-2 w-full rounded-sm ${B}`} /><span className={`h-2 w-6 rounded-sm ${A}`} /></span></div>);
 case "contact/card": return wrap(<span className="flex w-4/5 flex-col items-start gap-1 rounded-sm border border-stone-300 bg-white p-2">{bar("50%", A)}<span className={`h-2 w-full rounded-sm ${B}`} /><span className={`h-2 w-full rounded-sm ${B}`} /><span className={`h-2 w-6 rounded-sm ${A}`} /></span>);

 // faq — one stack, two columns, heading beside the questions, panels, numerals, a contents column.
  // appointments — day chips above a row of times. The composition that distinguishes these is
  // WHERE the picker sits relative to the words, so each thumb shows that and nothing else.
  case "appointments/split": return wrap(<div className="flex w-full items-start gap-2"><span className="flex w-1/2 flex-col gap-1">{bar("80%", A)}{bar("100%")}{bar("60%")}</span><span className="flex flex-1 flex-col gap-1"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-3 flex-1 rounded-sm ${B}`} />)}</span><span className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${N}`} />)}</span><span className={`mt-0.5 h-2 w-full rounded-sm ${A}`} /></span></div>);
  case "appointments/card": return wrap(<span className="flex w-full flex-col gap-1 rounded-sm border border-stone-200 p-2">{bar("55%", A)}<span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-3 flex-1 rounded-sm ${B}`} />)}</span><span className={`h-2 w-full rounded-sm ${A}`} /></span>);
 case "faq/two-column": return wrap(<div className="grid w-full grid-cols-2 gap-x-2">{[0, 1].map((c) => <span key={c} className="flex flex-col gap-1">{[0, 1, 2].map((i) => <span key={i} className="flex items-center justify-between rounded-sm bg-stone-100 px-1 py-0.5">{bar("60%")}<span className={`h-1 w-1 rounded-full ${N}`} /></span>)}</span>)}</div>);
 case "faq/sided": return wrap(<div className="flex w-full items-start gap-2"><span className="flex w-1/3 flex-col gap-1">{bar("100%", A)}{bar("70%")}</span><span className="flex flex-1 flex-col gap-1">{[0, 1, 2].map((i) => <span key={i} className="flex items-center justify-between border-b border-stone-200 pb-1">{bar("70%")}<span className={`h-1 w-1 rounded-full ${N}`} /></span>)}</span></div>);
 case "faq/cards": return wrap(<div className="grid w-full grid-cols-2 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="flex flex-col gap-1 rounded-sm border border-stone-200 p-1.5">{bar("70%", A)}{bar("100%")}</span>)}</div>);
 case "faq/numbered": return wrap(<span className="flex w-full flex-col gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-1.5 border-b border-stone-200 pb-1"><span className={`h-2 w-2 rounded-sm ${A}`} />{bar("64%")}</span>)}</span>);
 case "faq/index": return wrap(<div className="flex w-full items-start gap-2"><span className="flex w-1/3 flex-col gap-1 border-r border-stone-200 pr-2">{[0, 1, 2].map((i) => <span key={i} className={`h-1 rounded-full ${A}`} style={{ width: i === 1 ? "70%" : "90%" }} />)}</span><span className="flex flex-1 flex-col gap-1.5">{[0, 1].map((i) => <span key={i} className="flex flex-col gap-1">{bar("80%", A)}{bar("100%")}</span>)}</span></div>);
 }
 switch (type) {
 case "announcement": return wrap(<><span className={`h-1.5 w-full rounded-sm ${A}`} /><span className="flex-1" /></>, "justify-start");
 case "hero": return wrap(<>{bar("48%", A)}{bar("32%")}<span className={`mt-1 h-2.5 w-9 rounded-full ${A}`} /></>);
 case "statement": return wrap(<>{bar("70%", A)}{bar("55%", A)}{bar("30%")}</>);
 case "featured": return wrap(<>{bar("34%", A)}<div className="flex w-full gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-7 flex-1 rounded-sm ${B}`} />)}</div></>);
 case "gallery": return wrap(<div className="flex w-full gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-8 flex-1 rounded-sm ${B}`} />)}</div>);
 case "collections": return wrap(<>{bar("40%", A)}<div className="grid w-full grid-cols-3 gap-1">{Array.from({ length: 6 }).map((_, i) => <span key={i} className={`h-3 rounded-sm ${B}`} />)}</div></>);
 case "testimonials": return wrap(<><div className="flex gap-0.5">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1 w-1 rounded-full ${A}`} />)}</div>{bar("62%")}{bar("46%")}{bar("22%", A)}</>);
 case "countdown": return wrap(<><div className="flex items-center gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-6 w-5 rounded-sm ${i % 2 ? B : A}`} />)}</div>{bar("40%")}</>);
 case "blog": return wrap(<div className="flex w-full gap-1">{[0, 1, 2].map((i) => <span key={i} className="flex flex-1 flex-col gap-0.5"><span className={`h-5 w-full rounded-sm ${B}`} />{bar("90%")}{bar("60%")}</span>)}</div>);
 case "split": case "spotlight": return wrap(<div className="flex w-full items-center gap-2"><span className={`h-11 w-1/2 rounded-sm ${B}`} /><span className="flex flex-1 flex-col gap-1">{bar("80%", A)}{bar("100%")}{bar("70%")}<span className={`mt-0.5 h-2 w-8 rounded-full ${A}`} /></span></div>);
 case "columns": return wrap(<div className="flex w-full items-start gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="flex flex-1 flex-col items-start gap-1">{bar("70%", A)}{bar("100%")}{bar("80%")}</span>)}</div>);
 case "text": return wrap(<span className="flex w-full flex-col items-start gap-1">{bar("45%", A)}{bar("100%")}{bar("92%")}{bar("60%")}</span>, "justify-center");
 case "image": return wrap(<span className={`h-full w-full rounded-sm ${B}`} />);
 case "video": return wrap(<span className={`relative grid h-full w-full place-items-center rounded-sm ${B}`}><span className="h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-stone-400" /></span>);
 case "marquee": return wrap(<div className="flex w-full items-center gap-2 overflow-hidden">{Array.from({ length: 6 }).map((_, i) => <span key={i} className={`h-1.5 w-8 shrink-0 rounded-full ${i % 2 ? A : N}`} />)}</div>);
 case "newsletter": return wrap(<>{bar("40%", A)}{bar("60%")}<div className="mt-0.5 flex w-4/5 gap-1"><span className={`h-2.5 flex-1 rounded-sm ${B}`} /><span className={`h-2.5 w-6 rounded-sm ${A}`} /></div></>);
 case "contact": return wrap(<>{bar("40%", A)}<span className={`h-2 w-4/5 rounded-sm ${B}`} /><span className={`h-2 w-4/5 rounded-sm ${B}`} /><span className={`mt-0.5 h-2 w-8 rounded-full ${A}`} /></>);
 case "faq": return wrap(<span className="flex w-full flex-col gap-1">{[0, 1, 2].map((i) => <span key={i} className="flex w-full items-center justify-between rounded-sm bg-stone-100 px-1.5 py-1">{bar("55%")}<span className={`h-1 w-1 rounded-full ${N}`} /></span>)}</span>);
 case "custom": return wrap(<span className="grid h-full w-full place-items-center rounded-sm border border-dashed border-stone-300 font-mono text-[13px] font-semibold text-stone-400">{"</>"}</span>);
  case "appointments": return wrap(<>{bar("45%", A)}<span className="flex w-full gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-3 flex-1 rounded-sm ${B}`} />)}</span><span className="flex w-full gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${N}`} />)}</span><span className={`h-2 w-full rounded-sm ${A}`} /></>);
 default: return wrap(<>{bar("50%", A)}{bar("80%")}{bar("60%")}</>);
 }
}
