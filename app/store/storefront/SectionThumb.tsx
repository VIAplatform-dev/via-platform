// A tiny, abstract wireframe of what each section looks like — so the "Add section" picker reads visually
// (Framer/Squarespace style) instead of as a wall of text. Pure CSS shapes; the accent bit uses brand red.
// Shared by the blocks studio and the captured-site editor so both galleries look identical.
import type { BlockType } from "@/app/lib/storefront-blocks";

export default function SectionThumb({ type }: { type: BlockType | string }) {
 const A = "bg-[#5D0F17]"; // accent element (a heading or a button)
 const N = "bg-stone-300"; // neutral text line
 const B = "bg-stone-200"; // media / box
 const bar = (w: string, cls = N) => <span className={`h-1 rounded-full ${cls}`} style={{ width: w }} />;
 const wrap = (children: React.ReactNode, cls = "justify-center") => (
 <div className={`flex h-full w-full flex-col items-center gap-1 overflow-hidden p-2.5 ${cls}`}>{children}</div>
 );
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
 default: return wrap(<>{bar("50%", A)}{bar("80%")}{bar("60%")}</>);
 }
}
