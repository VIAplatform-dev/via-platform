"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_ASPECT } from "@/app/lib/image-crop";

/**
 * Position a listing photo inside the frame it will actually be seen in.
 *
 * Sellers shoot vertically and the card crops the middle, so a piece photographed low in the frame
 * lost its hem. Reordering the photos didn't help — the crop was the problem. Drag to move, zoom to
 * fill; the frame is fixed to the product card's shape so what you see here is what a shopper gets.
 *
 * The gesture reports a pan as a FRACTION of the slack rather than in pixels, so the numbers mean
 * the same thing whatever size this is drawn at (see image-crop.ts).
 */
export default function PhotoCropper({ url, onCancel, onCropped }: {
 url: string;
 onCancel: () => void;
 onCropped: (nextUrl: string) => void;
}) {
 const [zoom, setZoom] = useState(1);
 const [pan, setPan] = useState({ x: 0, y: 0 });
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState("");
 const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
 const frame = useRef<HTMLDivElement>(null);

 useEffect(() => {
  const move = (e: PointerEvent) => {
   const d = drag.current;
   const box = frame.current?.getBoundingClientRect();
   if (!d || !box) return;
   // Dividing by half the frame maps a drag across the whole frame to the full -1…1 range, which
   // is roughly how far the photo can travel at a typical zoom — so it tracks the finger closely
   // without needing the image's own dimensions on this side.
   setPan({
    x: Math.max(-1, Math.min(1, d.px - (e.clientX - d.x) / (box.width / 2))),
    y: Math.max(-1, Math.min(1, d.py - (e.clientY - d.y) / (box.height / 2))),
   });
  };
  const up = () => { drag.current = null; };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
 }, []);

 async function save() {
  setBusy(true); setErr("");
  try {
   const r = await fetch("/api/store/listings/crop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, zoom, panX: pan.x, panY: pan.y }),
   });
   const d = await r.json().catch(() => null);
   if (!r.ok || !d?.url) throw new Error(d?.error || "Couldn’t crop that image");
   onCropped(d.url as string);
  } catch (e) {
   setErr(e instanceof Error ? e.message : "Couldn’t crop that image");
   setBusy(false);
  }
 }

 // The preview mirrors the server's maths: zoom scales the photo up inside a frame it already
 // covers, and the pan slides it by the leftover. Same inputs, same result.
 const shift = (v: number) => `${(v * -50) / zoom}%`;

 return (
  <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
   <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
    <div className="border-b border-stone-100 px-5 py-3.5">
     <p className="text-[13.5px] font-medium text-stone-900">Position the photo</p>
     <p className="mt-0.5 text-[12px] text-stone-500">Drag to move it. This is the shape shoppers see.</p>
    </div>

    <div
     ref={frame}
     onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
     className="relative mx-auto my-4 w-[240px] cursor-grab touch-none select-none overflow-hidden rounded-lg bg-stone-100 active:cursor-grabbing"
     style={{ aspectRatio: String(CARD_ASPECT) }}
    >
     {/* eslint-disable-next-line @next/next/no-img-element */}
     <img
      src={url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
      style={{
       width: `${zoom * 100}%`,
       height: `${zoom * 100}%`,
       objectFit: "cover",
       transform: `translate(calc(-50% + ${shift(pan.x)}), calc(-50% + ${shift(pan.y)}))`,
      }}
     />
    </div>

    <div className="flex items-center gap-3 px-5">
     <span className="text-[11px] text-stone-400">Zoom</span>
     <input
      type="range" min={1} max={3} step={0.05} value={zoom}
      onChange={(e) => setZoom(Number(e.target.value))}
      className="flex-1 accent-[#5D0F17]"
     />
    </div>

    {err && <p className="px-5 pt-2 text-[12px] text-rose-600" role="alert">{err}</p>}

    <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-3">
     <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[12.5px] text-stone-500 underline underline-offset-2 hover:text-stone-900">Reset</button>
     <div className="flex items-center gap-3">
      <button type="button" onClick={onCancel} className="text-[12.5px] text-stone-500 hover:text-stone-900">Cancel</button>
      <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-stone-900 px-3.5 py-1.5 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">
       {busy ? "Saving…" : "Save"}
      </button>
     </div>
    </div>
   </div>
  </div>
 );
}
