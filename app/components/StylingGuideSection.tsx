"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { STYLING_LOOKS } from "@/app/lib/stylingGuide";

// Homepage "Styling Guide" — an auto-scrolling lookbook you can ALSO scroll by
// hand. A real overflow-x scroll container is nudged forward each frame; manual
// scroll / hover pauses the drift and it resumes shortly after. Content + looped
// copy give a seamless loop. Photos aren't clickable; only the item names link.
export default function StylingGuideSection() {
 const scrollRef = useRef<HTMLDivElement>(null);
 const pausedRef = useRef(false);
 const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 // Render the looks twice so we can wrap seamlessly at the halfway point.
 const loop = [...STYLING_LOOKS, ...STYLING_LOOKS];

 useEffect(() => {
 const el = scrollRef.current;
 if (!el) return;
 const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
 if (reduce) return; // honor reduced-motion, manual scroll still works

 let raf = 0;
 const speed = 0.4; // px/frame ≈ 24px/s
 const tick = () => {
 if (el && !pausedRef.current) {
 el.scrollLeft += speed;
 const half = el.scrollWidth / 2;
 if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
 }
 raf = requestAnimationFrame(tick);
 };
 raf = requestAnimationFrame(tick);
 return () => cancelAnimationFrame(raf);
 }, []);

 const pause = () => {
 pausedRef.current = true;
 };
 const resumeSoon = () => {
 if (resumeTimer.current) clearTimeout(resumeTimer.current);
 resumeTimer.current = setTimeout(() => {
 pausedRef.current = false;
 }, 1500);
 };

 if (STYLING_LOOKS.length === 0) return null;

 return (
 <section data-section="styling-guide" className="bg-[#FFFDF8] py-16 sm:py-24 overflow-hidden">
 <div className="max-w-7xl mx-auto">
 <div className="px-6 mb-8 sm:mb-12">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-1 font-sans">Shop the look</p>
 <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#5D0F17]">Styling Guide</h2>
 </div>
 </div>

 <div
 ref={scrollRef}
 onMouseEnter={pause}
 onMouseLeave={() => (pausedRef.current = false)}
 onPointerDown={pause}
 onPointerUp={resumeSoon}
 onWheel={() => {
 pause();
 resumeSoon();
 }}
 onTouchStart={pause}
 onTouchEnd={resumeSoon}
 className="flex gap-5 overflow-x-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
 >
 {loop.map((look, i) => (
 <div key={i} className="shrink-0 w-[260px] sm:w-[300px]">
 <div className="relative w-full h-[360px] sm:h-[420px] overflow-hidden bg-[#5D0F17]/[0.04]">
 <Image
 src={look.image}
 alt={`Styled look ${(i % STYLING_LOOKS.length) + 1}`}
 fill
 sizes="(min-width: 640px) 300px, 260px"
 className="object-cover pointer-events-none"
 loading="lazy"
 draggable={false}
 />
 </div>
 <div className="mt-4">
 <p className="text-[10px] uppercase tracking-[0.2em] text-[#5D0F17]/45 mb-2 font-sans">Shop the look</p>
 <div className="flex flex-wrap gap-x-4 gap-y-1.5">
 {look.items.map((it) => (
 <Link
 key={it.url + it.label}
 href={it.url}
 className="text-[14px] font-serif text-[#5D0F17] underline decoration-[#5D0F17]/30 underline-offset-4 hover:decoration-[#5D0F17] transition-colors"
 >
 {it.label}
 </Link>
 ))}
 </div>
 {look.caption && <p className="mt-2 text-[13px] text-[#5D0F17]/55 font-serif">{look.caption}</p>}
 </div>
 </div>
 ))}
 </div>
 </section>
 );
}
