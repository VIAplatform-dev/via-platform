"use client";

import { useState } from "react";

/**
 * One photograph at a time, thumbnails beneath.
 *
 * The only product arrangement that needs state, and the reason it's worth having: a piece shot from
 * eight angles reads as eight photographs in a grid, or as one photograph you page through. Vintage
 * sells on the second — the detail shot of a seam or a label is a thing you look AT, not scroll past.
 *
 * Keyboard and screen readers get the same page: the thumbnails are real buttons, so arrowing and
 * tabbing through them works without anything extra.
 */
export default function ProductSlideshow({ images, title }: { images: string[]; title: string }) {
 const [at, setAt] = useState(0);
 if (images.length === 0) return <div className="vya-round aspect-[4/5] w-full bg-black/5" />;
 const i = Math.min(at, images.length - 1);

 return (
  <div className="space-y-3">
   <div className="vya-round relative overflow-hidden bg-black/5">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={images[i]} alt={title} className="w-full object-cover" />
    {images.length > 1 && (
     <>
      {/* Placed over the photo rather than beside it, so the image keeps the full column width. */}
      {([["‹", -1, "left-2"], ["›", 1, "right-2"]] as const).map(([mark, step, side]) => (
       <button
        key={side} type="button" aria-label={step < 0 ? "Previous photo" : "Next photo"}
        onClick={() => setAt((n) => (n + step + images.length) % images.length)}
        className={`absolute top-1/2 ${side} flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[16px] leading-none text-black/70 shadow-sm transition hover:bg-white`}
       >{mark}</button>
      ))}
     </>
    )}
   </div>
   {images.length > 1 && (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
     {images.map((src, n) => (
      <button
       key={n} type="button" onClick={() => setAt(n)} aria-label={`Photo ${n + 1}`} aria-current={n === i}
       className="vya-round h-16 w-16 shrink-0 overflow-hidden bg-black/5 transition"
       style={{ opacity: n === i ? 1 : 0.45 }}
      >
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      </button>
     ))}
    </div>
   )}
  </div>
 );
}
