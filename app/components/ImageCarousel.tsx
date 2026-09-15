"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import NextImage from "next/image";
import { resizeImage, shouldServeUnoptimized } from "@/app/lib/imageUtils";

type ImageCarouselProps = {
 images: string[];
 alt: string;
 variant: "card" | "detail";
 isEditorsPick?: boolean;
 onAllImagesFailed?: () => void;
 priority?: boolean;
};

export default function ImageCarousel({
 images,
 alt,
 variant,
 isEditorsPick,
 onAllImagesFailed,
 priority,
}: ImageCarouselProps) {
 const [current, setCurrent] = useState(0);
 const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
 const [isLightboxOpen, setIsLightboxOpen] = useState(false);
 const [lightboxZoomed, setLightboxZoomed] = useState(false);
 const touchStartX = useRef<number | null>(null);
 const touchStartY = useRef<number | null>(null);
 const mouseStartX = useRef<number | null>(null);
 const isDragging = useRef(false);
 const wasSwipe = useRef(false);
 const lightboxImgRef = useRef<HTMLDivElement>(null);

 const validImages = images.filter((src) => !!src);
 const safeImages = validImages.length > 0 ? validImages : ["/placeholder.jpg"];

 useEffect(() => {
 if (validImages.length === 0) onAllImagesFailed?.();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 useEffect(() => {
 if (validImages.length > 0 && failedImages.size >= validImages.length) {
 onAllImagesFailed?.();
 }
 }, [failedImages, validImages.length, onAllImagesFailed]);

 // Lock body scroll when lightbox is open
 useEffect(() => {
 if (isLightboxOpen) {
 document.body.style.overflow = "hidden";
 } else {
 document.body.style.overflow = "";
 }
 return () => { document.body.style.overflow = ""; };
 }, [isLightboxOpen]);

 // Preload lightbox images in the background so clicking the image is instant
 useEffect(() => {
 if (variant !== "detail") return;
 safeImages.forEach((src) => {
 const url = resizeImage(src, 1200);
 if (url) {
 const img = new Image();
 img.src = url;
 }
 });
 // Only run once on mount. SafeImages won't change
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 const hasMultiple = safeImages.length > 1;

 const goTo = useCallback(
 (idx: number) => {
 setCurrent((idx + safeImages.length) % safeImages.length);
 },
 [safeImages.length]
 );

 const goToLightbox = useCallback(
 (idx: number) => {
 setCurrent((idx + safeImages.length) % safeImages.length);
 setLightboxZoomed(false);
 if (lightboxImgRef.current) {
 lightboxImgRef.current.scrollTop = 0;
 lightboxImgRef.current.scrollLeft = 0;
 }
 },
 [safeImages.length]
 );

 const prev = useCallback(
 (e: React.MouseEvent) => {
 e.preventDefault();
 e.stopPropagation();
 goTo(current - 1);
 },
 [current, goTo]
 );

 const next = useCallback(
 (e: React.MouseEvent) => {
 e.preventDefault();
 e.stopPropagation();
 goTo(current + 1);
 },
 [current, goTo]
 );

 const lightboxPrev = useCallback(
 (e: React.MouseEvent) => {
 e.stopPropagation();
 goToLightbox(current - 1);
 },
 [current, goToLightbox]
 );

 const lightboxNext = useCallback(
 (e: React.MouseEvent) => {
 e.stopPropagation();
 goToLightbox(current + 1);
 },
 [current, goToLightbox]
 );

 const onTouchStart = useCallback((e: React.TouchEvent) => {
 touchStartX.current = e.touches[0].clientX;
 touchStartY.current = e.touches[0].clientY;
 }, []);

 const onTouchEnd = useCallback(
 (e: React.TouchEvent) => {
 if (touchStartX.current === null || touchStartY.current === null) return;
 const diffX = touchStartX.current - e.changedTouches[0].clientX;
 const diffY = touchStartY.current - e.changedTouches[0].clientY;
 touchStartX.current = null;
 touchStartY.current = null;
 if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
 wasSwipe.current = true;
 goTo(current + (diffX > 0 ? 1 : -1));
 } else {
 wasSwipe.current = false;
 }
 },
 [current, goTo]
 );

 const onMouseDown = useCallback((e: React.MouseEvent) => {
 mouseStartX.current = e.clientX;
 isDragging.current = false;
 }, []);

 const onMouseMove = useCallback((e: React.MouseEvent) => {
 if (mouseStartX.current === null) return;
 if (Math.abs(e.clientX - mouseStartX.current) > 5) {
 isDragging.current = true;
 }
 }, []);

 const onMouseUp = useCallback(
 (e: React.MouseEvent) => {
 if (mouseStartX.current === null) return;
 const diff = mouseStartX.current - e.clientX;
 if (Math.abs(diff) > 30) {
 e.preventDefault();
 goTo(current + (diff > 0 ? 1 : -1));
 }
 mouseStartX.current = null;
 },
 [current, goTo]
 );

 const handleDotClick = useCallback(
 (e: React.MouseEvent, idx: number) => {
 e.preventDefault();
 e.stopPropagation();
 goTo(idx);
 },
 [goTo]
 );

 const openLightbox = useCallback((e: React.MouseEvent) => {
 e.preventDefault();
 e.stopPropagation();
 setLightboxZoomed(false);
 setIsLightboxOpen(true);
 }, []);

 const closeLightbox = useCallback(() => {
 setIsLightboxOpen(false);
 setLightboxZoomed(false);
 }, []);

 const toggleZoom = useCallback((e: React.MouseEvent) => {
 e.stopPropagation();
 const next = !lightboxZoomed;
 setLightboxZoomed(next);
 if (!next && lightboxImgRef.current) {
 lightboxImgRef.current.scrollTop = 0;
 lightboxImgRef.current.scrollLeft = 0;
 }
 }, [lightboxZoomed]);

 // Pre-render current + adjacent images
 const renderImages = (sizes: string, targetWidth: number, objectPosition = "object-top") =>
 safeImages.map((src, idx) => {
 const isAdjacentOrCurrent =
 idx === current ||
 idx === (current + 1) % safeImages.length ||
 idx === (current - 1 + safeImages.length) % safeImages.length;
 if (!isAdjacentOrCurrent) return null;
 const failed = failedImages.has(idx);
 // Ask the source CDN for a card-sized image and, when it can resize, serve it
 // directly (unoptimized) so it loads instantly instead of waiting on the Vercel
 // image optimizer to cold-fetch and re-encode the full-size original.
 const displaySrc = failed ? "/placeholder.jpg" : resizeImage(src, targetWidth);
 return (
 <div
 key={idx}
 className={`absolute inset-0 transition-opacity duration-150 ${
 idx === current ? "opacity-100 z-10" : "opacity-0 z-0"
 }`}
 >
 <NextImage
 src={displaySrc}
 alt={alt}
 fill
 sizes={sizes}
 unoptimized={!failed && shouldServeUnoptimized(src)}
 className={`object-cover ${objectPosition}`}
 priority={priority && idx === 0}
 onError={() =>
 setFailedImages((prev) => {
 const next = new Set(prev);
 next.add(idx);
 return next;
 })
 }
 />
 </div>
 );
 });

 // ── Card variant ──
 if (variant === "card") {
 return (
 <div
 className="relative aspect-[3/4] w-full overflow-hidden group/carousel cursor-grab active:cursor-grabbing"
 style={{ touchAction: "pan-y" }}
 onPointerEnter={hasMultiple ? (e) => { if (e.pointerType === "mouse") goTo(1); } : undefined}
 onPointerLeave={hasMultiple ? (e) => { if (e.pointerType === "mouse") goTo(0); } : undefined}
 onTouchStart={hasMultiple ? onTouchStart : undefined}
 onTouchEnd={hasMultiple ? onTouchEnd : undefined}
 onMouseDown={hasMultiple ? onMouseDown : undefined}
 onMouseMove={hasMultiple ? onMouseMove : undefined}
 onMouseUp={hasMultiple ? onMouseUp : undefined}
 >
 {renderImages("(max-width: 768px) 50vw, 25vw", 600, "object-center")}

 {isEditorsPick && (
 <div className="hidden sm:block absolute top-2 left-2 z-40 bg-[#5D0F17] px-2 py-0.5">
 <span className="text-[#FFFDF8] text-[9px] uppercase tracking-[0.15em] font-medium">
 Everyone&apos;s Favorite
 </span>
 </div>
 )}

 {hasMultiple && (
 <div className="absolute bottom-0 left-0 right-0 z-30 flex gap-[2px] px-2 pb-2 pt-4 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover/carousel:opacity-100 transition-opacity">
 {safeImages.map((_, idx) => (
 <button
 key={idx}
 onClick={(e) => handleDotClick(e, idx)}
 className={`h-[3px] flex-1 transition-all duration-200 ${
 idx === current ? "bg-white" : "bg-white/40"
 }`}
 aria-label={`Go to image ${idx + 1}`}
 />
 ))}
 </div>
 )}
 </div>
 );
 }

 // ── Detail variant ──
 return (
 <>
 <div>
 <div
 className="relative aspect-[4/5] md:aspect-[3/4] w-full overflow-hidden bg-[#D8CABD]/30 cursor-zoom-in active:cursor-grabbing"
 style={{ touchAction: "pan-y" }}
 onTouchStart={onTouchStart}
 onTouchEnd={hasMultiple ? onTouchEnd : undefined}
 onMouseDown={hasMultiple ? onMouseDown : undefined}
 onMouseMove={hasMultiple ? onMouseMove : undefined}
 onMouseUp={hasMultiple ? onMouseUp : undefined}
 onClick={(e) => {
 if (wasSwipe.current || isDragging.current) {
 wasSwipe.current = false;
 isDragging.current = false;
 return;
 }
 openLightbox(e);
 }}
 >
 {renderImages("(max-width: 768px) 100vw, 600px", 1200, "object-center")}

 {safeImages[0] === "/placeholder.jpg" && (
 <div className="absolute inset-0 bg-[#D8CABD]/50" />
 )}

 {/* Progress dots */}
 {hasMultiple && (
 <div className="absolute bottom-0 left-0 right-0 z-20 flex gap-[2px] px-3 pb-2 pt-4 bg-gradient-to-t from-black/20 to-transparent">
 {safeImages.map((_, idx) => (
 <button
 key={idx}
 onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(idx); }}
 className={`h-[3px] flex-1 transition-all duration-200 ${idx === current ? "bg-white" : "bg-white/40"}`}
 aria-label={`Go to image ${idx + 1}`}
 />
 ))}
 </div>
 )}
 </div>
 </div>

 {/* ── Lightbox ── */}
 {isLightboxOpen && (
 <div className="fixed inset-0 z-[9999] bg-black flex flex-col" onClick={closeLightbox}>
 {/* Header bar */}
 <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
 <span className="text-white/60 text-sm select-none">
 {current + 1} / {safeImages.length}
 </span>
 <div className="flex items-center gap-3">
 <button
 onClick={toggleZoom}
 className="text-white/70 hover:text-white transition text-xs uppercase tracking-wide select-none"
 aria-label={lightboxZoomed ? "Zoom out" : "Zoom in"}
 >
 {lightboxZoomed ? "Zoom out" : "Zoom in"}
 </button>
 <button
 onClick={closeLightbox}
 className="w-9 h-9 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-full transition"
 aria-label="Close"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>
 </div>

 {/* Image area */}
 <div
 ref={lightboxImgRef}
 className="flex-1 relative"
 style={{
 overflow: lightboxZoomed ? "auto" : "hidden",
 display: lightboxZoomed ? "block" : "flex",
 alignItems: lightboxZoomed ? undefined : "center",
 justifyContent: lightboxZoomed ? undefined : "center",
 cursor: lightboxZoomed ? "zoom-out" : "zoom-in",
 }}
 onClick={toggleZoom}
 >
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img
 src={resizeImage(safeImages[current], lightboxZoomed ? 2000 : 1200)}
 alt={alt}
 style={{
 display: "block",
 maxWidth: lightboxZoomed ? "none" : "100%",
 maxHeight: lightboxZoomed ? "none" : "100%",
 width: lightboxZoomed ? "200%" : "auto",
 height: lightboxZoomed ? "auto" : "auto",
 objectFit: "contain",
 }}
 />
 </div>

 {/* Navigation arrows */}
 {hasMultiple && (
 <>
 <button
 onClick={lightboxPrev}
 className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition z-10"
 aria-label="Previous image"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
 </svg>
 </button>
 <button
 onClick={lightboxNext}
 className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition z-10"
 aria-label="Next image"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
 </svg>
 </button>
 </>
 )}

 {/* Thumbnail strip */}
 {hasMultiple && (
 <div
 className="flex gap-2 px-4 py-3 overflow-x-auto justify-center flex-shrink-0"
 onClick={(e) => e.stopPropagation()}
 >
 {safeImages.map((src, idx) => (
 <button
 key={idx}
 onClick={() => goToLightbox(idx)}
 className={`relative flex-shrink-0 w-12 h-16 overflow-hidden rounded transition-all ${
 idx === current
 ? "ring-2 ring-white opacity-100"
 : "opacity-40 hover:opacity-70"
 }`}
 aria-label={`View image ${idx + 1}`}
 >
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={src} alt={`${alt} ${idx + 1}`} className="w-full h-full object-cover object-center" />
 </button>
 ))}
 </div>
 )}
 </div>
 )}
 </>
 );
}
