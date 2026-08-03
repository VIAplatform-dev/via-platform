"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { visibleStores as stores } from "../lib/stores";
import TrackedStoreLink from "./TrackedStoreLink";

// Auto-scroll speed in px per animation frame (~60fps) — 1.0px ≈ 60px/s
const SPEED = 1.0;

function StoreCard({ store }: { store: (typeof stores)[number] }) {
 return (
 <TrackedStoreLink
 href={`/stores/${store.slug}`}
 storeSlug={store.slug}
 storeName={store.name}
 surface="home_store_carousel"
 className="group block flex-shrink-0 w-44 sm:w-64"
 >
 <div
 className="aspect-[3/4] relative overflow-hidden rounded-xl w-full"
 style={{ backgroundColor: "#FFFDF8" }}
 >
 {store.image.includes("placeholder") ? (
 <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img
 src="/vya-logo.png"
 alt="VYA"
 className="w-12 sm:w-16 blur-[1px] opacity-40 select-none pointer-events-none"
 />
 <p className="text-[7px] uppercase tracking-[0.3em] text-[#5D0F17]/40">
 Coming Soon
 </p>
 </div>
 ) : (
 <Image
 src={store.image}
 alt={store.name}
 fill
 sizes="(min-width: 640px) 256px, 176px"
 className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
 loading="lazy"
 />
 )}
 </div>
 <div className="pt-2 pb-1">
 <p className="text-[9px] uppercase tracking-wide text-[#5D0F17]/70 mb-0.5 truncate">
 {store.location}
 </p>
 <h3 className="font-serif text-xs sm:text-sm text-[#5D0F17] leading-snug line-clamp-2">
 {store.name}
 </h3>
 </div>
 </TrackedStoreLink>
 );
}

export default function StoreCarousel() {
 const scrollRef = useRef<HTMLDivElement>(null);
 const pausedRef = useRef(false);
 const rafRef = useRef<number | null>(null);
 const isDragging = useRef(false);
 const dragStartX = useRef(0);
 const dragScrollLeft = useRef(0);

 useEffect(() => {
 const el = scrollRef.current;
 if (!el) return;

 // Auto-scroll tick — scrolls forward and loops seamlessly at the halfway point
 const tick = () => {
 if (!pausedRef.current) {
 el.scrollLeft += SPEED;
 const half = el.scrollWidth / 2;
 if (half > 0 && el.scrollLeft >= half) {
 el.scrollLeft -= half;
 }
 }
 rafRef.current = requestAnimationFrame(tick);
 };
 rafRef.current = requestAnimationFrame(tick);

 let resumeTimer: ReturnType<typeof setTimeout> | null = null;
 const scheduleResume = (delay = 800) => {
 if (resumeTimer) clearTimeout(resumeTimer);
 resumeTimer = setTimeout(() => {
 // Snap back to first half if momentum scrolled past the loop point
 const half = el.scrollWidth / 2;
 if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
 isDragging.current = false;
 pausedRef.current = false;
 el.style.cursor = "grab";
 }, delay);
 };

 // Desktop: drag to scroll
 const onMouseDown = (e: MouseEvent) => {
 isDragging.current = true;
 pausedRef.current = true;
 dragStartX.current = e.clientX;
 dragScrollLeft.current = el.scrollLeft;
 el.style.cursor = "grabbing";
 if (resumeTimer) clearTimeout(resumeTimer);
 };
 const onMouseMove = (e: MouseEvent) => {
 if (!isDragging.current) return;
 el.scrollLeft = dragScrollLeft.current + (dragStartX.current - e.clientX);
 };
 const onMouseUp = () => {
 if (!isDragging.current) return;
 scheduleResume(800);
 };

 // Desktop: pause auto-scroll on hover so users can read, resume on leave
 const onMouseEnter = () => { if (!isDragging.current) pausedRef.current = true; };
 const onMouseLeave = () => { if (!isDragging.current) pausedRef.current = false; };

 // Desktop: only intercept primarily horizontal wheel movements; let vertical scroll pass through
 const onWheel = (e: WheelEvent) => {
 if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
 e.preventDefault();
 pausedRef.current = true;
 el.scrollLeft += e.deltaX;
 const half = el.scrollWidth / 2;
 if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
 if (half > 0 && el.scrollLeft < 0) el.scrollLeft += half;
 scheduleResume(1200);
 };

 // Mobile: browser handles native touch scroll — pause auto-scroll during it
 const onTouchStart = () => {
 pausedRef.current = true;
 if (resumeTimer) clearTimeout(resumeTimer);
 };
 const onTouchEnd = () => {
 scheduleResume(900);
 };

 el.addEventListener("mousedown", onMouseDown);
 document.addEventListener("mousemove", onMouseMove);
 document.addEventListener("mouseup", onMouseUp);
 el.addEventListener("mouseenter", onMouseEnter);
 el.addEventListener("mouseleave", onMouseLeave);
 el.addEventListener("wheel", onWheel, { passive: false });
 el.addEventListener("touchstart", onTouchStart, { passive: true });
 el.addEventListener("touchend", onTouchEnd, { passive: true });

 return () => {
 if (rafRef.current) cancelAnimationFrame(rafRef.current);
 if (resumeTimer) clearTimeout(resumeTimer);
 el.removeEventListener("mousedown", onMouseDown);
 document.removeEventListener("mousemove", onMouseMove);
 document.removeEventListener("mouseup", onMouseUp);
 el.removeEventListener("mouseenter", onMouseEnter);
 el.removeEventListener("mouseleave", onMouseLeave);
 el.removeEventListener("wheel", onWheel);
 el.removeEventListener("touchstart", onTouchStart);
 el.removeEventListener("touchend", onTouchEnd);
 };
 }, []);

 return (
 <div
 ref={scrollRef}
 className="flex gap-4 sm:gap-6 overflow-x-scroll cursor-grab select-none"
 style={{
 scrollbarWidth: "none",
 msOverflowStyle: "none",
 touchAction: "pan-x",
 maskImage:
 "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
 WebkitMaskImage:
 "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
 }}
 >
 {[...stores, ...stores].map((store, i) => (
 <StoreCard key={`${store.slug}-${i}`} store={store} />
 ))}
 </div>
 );
}
