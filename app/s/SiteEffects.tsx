"use client";

import { useEffect, useRef } from "react";
import type { SiteEffects } from "@/app/lib/storefront-effects";

/**
 * The pointer effects, drawn by us.
 *
 * One canvas pinned over the page, ignoring pointer events, drawing whichever effect the store
 * chose. It's OUR code rather than the seller's for the reason in storefront-effects.ts — a
 * storefront shares an origin with the marketplace, so a seller's script would run next to a
 * shopper's session.
 *
 * Three things this has to get right or it's worse than not having it:
 *  · it stops entirely for `prefers-reduced-motion`, because a trail chasing the pointer is exactly
 *    the kind of motion that setting exists to refuse;
 *  · it never runs on a touch screen, where there's no pointer to follow and it would only burn
 *    battery drawing nothing;
 *  · the loop stops when the tab is hidden and when the component unmounts, so a shopper who opens
 *    a product in a background tab isn't animating a canvas nobody is looking at.
 */

type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; rot: number };

export default function SiteEffects({ effects, accent }: { effects: SiteEffects; accent: string }) {
 const ref = useRef<HTMLCanvasElement | null>(null);

 useEffect(() => {
  const kind = effects.cursor;
  if (kind === "none") return;
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // A trail with no pointer to trail is nothing but a battery cost.
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const canvas = ref.current;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const colour = effects.cursorColor || accent || "#ffffff";
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
   dpr = Math.min(window.devicePixelRatio || 1, 2);
   canvas.width = Math.floor(window.innerWidth * dpr);
   canvas.height = Math.floor(window.innerHeight * dpr);
   canvas.style.width = `${window.innerWidth}px`;
   canvas.style.height = `${window.innerHeight}px`;
   ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();

  const parts: Particle[] = [];
  let px = -1000, py = -1000;      // where the pointer is
  let tx = -1000, ty = -1000;      // where the comet/ring has got to
  let moved = false;
 // Where the last speck was emitted. Glitter is a TRAIL — it marks where the pointer went, so it
 // has to stop when the pointer stops. Without this, `moved` latched true on the first movement and
 // every frame afterwards kept spawning at the last position, so a cursor left sitting still poured
 // sparkles onto one spot for as long as the page was open.
 let lastX = -1000, lastY = -1000;
  let raf = 0;

  const onMove = (e: PointerEvent) => { px = e.clientX; py = e.clientY; moved = true; };
  const onLeave = () => { px = -1000; py = -1000; };

  const spawn = () => {
   // Emitted from the pointer with a little spread, so the trail reads as scattered rather than
   // as a line of identical dots.
   const n = kind === "glitter" ? 2 : 1;
   for (let i = 0; i < n; i++) {
    parts.push({
     x: px + (Math.random() - 0.5) * 10,
     y: py + (Math.random() - 0.5) * 10,
     vx: (Math.random() - 0.5) * 0.6,
     vy: kind === "glitter" ? 0.4 + Math.random() * 0.9 : (Math.random() - 0.5) * 0.6,
     life: 1,
     size: kind === "sparkle" ? 5 + Math.random() * 5 : 1.5 + Math.random() * 2.5,
     rot: Math.random() * Math.PI,
    });
   }
   if (parts.length > 220) parts.splice(0, parts.length - 220);
  };

  const star = (x: number, y: number, r: number, rot: number) => {
   // A four-point twinkle: two tapered strokes crossed. Cheaper and prettier than a polygon.
   ctx.save();
   ctx.translate(x, y);
   ctx.rotate(rot);
   ctx.beginPath();
   ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0);
   ctx.quadraticCurveTo(0, 0, 0, r); ctx.quadraticCurveTo(0, 0, -r, 0);
   ctx.quadraticCurveTo(0, 0, 0, -r);
   ctx.fill();
   ctx.restore();
  };

  const frame = () => {
   ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

   if (kind === "trail" || kind === "ring") {
    // Eased chase — the shape catches up rather than sticking to the pointer.
    tx += (px - tx) * 0.18;
    ty += (py - ty) * 0.18;
    if (moved && px > -500) {
     ctx.globalAlpha = kind === "ring" ? 0.55 : 0.75;
     ctx.fillStyle = colour;
     ctx.strokeStyle = colour;
     if (kind === "ring") {
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tx, ty, 14, 0, Math.PI * 2); ctx.stroke();
     } else {
      ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2); ctx.fill();
     }
     ctx.globalAlpha = 1;
    }
   } else {
    // Emit only where the pointer actually travelled since the last frame. The threshold is in
    // pixels-squared to skip a square root 60 times a second, and it also swallows the sub-pixel
    // jitter a trackpad reports when a hand is resting on it.
    const dx = px - lastX, dy = py - lastY;
    if (moved && px > -500 && dx * dx + dy * dy > 4) { spawn(); lastX = px; lastY = py; }
    ctx.fillStyle = colour;
    for (let i = parts.length - 1; i >= 0; i--) {
     const p = parts[i];
     p.x += p.vx; p.y += p.vy; p.life -= 0.022;
     if (kind === "glitter") p.vy += 0.02; // a speck of glitter falls
     if (p.life <= 0) { parts.splice(i, 1); continue; }
     ctx.globalAlpha = Math.max(0, p.life);
     if (kind === "sparkle") star(p.x, p.y, p.size * p.life, p.rot + (1 - p.life) * 2);
     else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
   }
   raf = requestAnimationFrame(frame);
  };

  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  const onVisibility = () => (document.hidden ? stop() : start());

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerleave", onLeave, { passive: true });
  window.addEventListener("resize", size);
  document.addEventListener("visibilitychange", onVisibility);
  start();

  return () => {
   stop();
   window.removeEventListener("pointermove", onMove);
   window.removeEventListener("pointerleave", onLeave);
   window.removeEventListener("resize", size);
   document.removeEventListener("visibilitychange", onVisibility);
  };
 }, [effects.cursor, effects.cursorColor, accent]);

 if (effects.cursor === "none") return null;
 // aria-hidden and pointer-events-none: decoration that must never sit between a shopper and a
 // buy button, and never be announced to a screen reader.
 return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[9999]" />;
}
