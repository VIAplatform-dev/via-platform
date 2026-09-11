"use client";

import { useState, useEffect, useCallback } from "react";
import type { CategoryLabel } from "@/app/lib/categoryMap";
import ImageCarousel from "./ImageCarousel";
import AddToCollectionButton from "./AddToCollectionButton";

type ProductDetailModalProps = {
 isOpen: boolean;
 onClose: () => void;
 product: {
 id: string;
 dbId?: number;
 title: string;
 price: number;
 compareAtPrice?: number | null;
 categoryLabel: CategoryLabel;
 store: string;
 storeSlug: string;
 externalUrl?: string;
 image: string;
 images?: string[];
 description?: string | null;
 size?: string | null;
 } | null;
};

function extractConditionFromDescription(description: string | null | undefined): string | null {
 if (!description) return null;
 const plain = description
 .replace(/<[^>]+>/g, " ")
 .replace(/&[a-z#\d]+;/gi, " ")
 .replace(/\s+/g, " ")
 .trim();

 const labelMatch = plain.match(/condition\s*[:\-–]\s*([^.\n,;]{3,80})/i);
 if (labelMatch) return labelMatch[1].trim();

 const abbreviations: Record<string, string> = {
 NWT: "New with tags", NWOT: "New without tags",
 EUC: "Excellent used condition", VGUC: "Very good used condition", GUC: "Good used condition",
 };
 for (const [abbr, full] of Object.entries(abbreviations)) {
 if (new RegExp(`(?:^|\\s)${abbr}(?:\\s|$|[.,;])`, "i").test(plain)) return full;
 }

 const sentences = plain.split(/(?<=[.!?\n])\s+|[\n]/);
 for (const sentence of sentences) {
 const s = sentence.trim();
 if (!s || s.length > 150) continue;
 if (/\b(?:condition|pre-?owned|pre-?loved|gently used|like new|mint|new with tags|new without tags|light wear|some wear|signs of wear|well loved|worn)\b/i.test(s)) {
 return s;
 }
 }
 return null;
}

export default function ProductDetailModal({
 isOpen,
 onClose,
 product,
}: ProductDetailModalProps) {
 const [showModal, setShowModal] = useState(false);

 useEffect(() => {
 if (isOpen) {
 requestAnimationFrame(() => setShowModal(true));
 } else {
 setShowModal(false);
 }
 }, [isOpen]);

 const handleClose = useCallback(() => {
 setShowModal(false);
 setTimeout(() => onClose(), 200);
 }, [onClose]);

 useEffect(() => {
 const handleEscape = (e: KeyboardEvent) => {
 if (e.key === "Escape" && isOpen) handleClose();
 };
 document.addEventListener("keydown", handleEscape);
 return () => document.removeEventListener("keydown", handleEscape);
 }, [isOpen, handleClose]);

 useEffect(() => {
 if (isOpen) {
 document.body.style.overflow = "hidden";
 } else {
 document.body.style.overflow = "";
 }
 return () => {
 document.body.style.overflow = "";
 };
 }, [isOpen]);

 if (!isOpen || !product) return null;

 let checkoutUrl: string | null = null;
 if (product.externalUrl) {
 const params = new URLSearchParams({
 pid: product.id,
 pn: product.title,
 s: product.store,
 ss: product.storeSlug,
 url: product.externalUrl,
 });
 checkoutUrl = `/api/track?${params.toString()}`;
 }

 return (
 <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
 {/* Backdrop */}
 <div
 className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out ${
 showModal ? "opacity-100" : "opacity-0"
 }`}
 onClick={handleClose}
 />

 {/* Modal — slides up on mobile, centered on desktop */}
 <div
 className={`relative w-full sm:max-w-2xl sm:mx-4 max-h-[95vh] overflow-y-auto bg-[#FFFDF8] rounded-t-xl sm:rounded-none shadow-2xl transition-all duration-300 ease-out ${
 showModal
 ? "opacity-100 translate-y-0"
 : "opacity-0 translate-y-12 sm:translate-y-8"
 }`}
 >
 {/* Close button */}
 <button
 onClick={handleClose}
 className="absolute top-4 right-4 z-10 p-2 text-[#5D0F17]/50 hover:text-[#5D0F17] transition bg-[#FFFDF8]/80 backdrop-blur-sm"
 aria-label="Close"
 >
 <svg
 className="w-6 h-6"
 fill="none"
 stroke="currentColor"
 viewBox="0 0 24 24"
 >
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth={2}
 d="M6 18L18 6M6 6l12 12"
 />
 </svg>
 </button>

 {/* Product Image */}
 <ImageCarousel
 images={
 product.images && product.images.length > 0
 ? product.images
 : product.image
 ? [product.image]
 : []
 }
 alt={product.title}
 variant="detail"
 />

 {/* Product Info */}
 <div className="p-6 sm:p-8">
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/60 mb-2">
 {product.store}
 </p>

 <h2 className="text-2xl sm:text-3xl font-serif text-[#5D0F17] mb-2 leading-snug">
 {product.title}
 </h2>

 <p className="text-sm text-[#5D0F17]/60 mb-1">{product.categoryLabel}</p>

 {product.size && (
 <p className="text-sm text-[#5D0F17]/70 mb-0.5">
 Size: <span className="font-medium">{product.size}</span>
 </p>
 )}

 <p className="text-sm text-[#5D0F17]/70 mb-3">
 Condition:{" "}
 {extractConditionFromDescription(product.description) ? (
 <span className="font-medium">{extractConditionFromDescription(product.description)}</span>
 ) : (
 <span className="italic text-[#5D0F17]/50">not described, please refer to the photos listed</span>
 )}
 </p>

 <div className="flex items-baseline gap-3 mb-6">
 <p className="text-xl font-medium text-[#5D0F17]">
 ${product.price}
 </p>
 {product.compareAtPrice && product.compareAtPrice > product.price && (
 <p className="text-base text-[#5D0F17]/40 line-through">
 ${product.compareAtPrice}
 </p>
 )}
 </div>

 {/* Checkout button */}
 {checkoutUrl ? (
 <a
 href={checkoutUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="block w-full bg-[#5D0F17] text-[#FFFDF8] py-4 text-sm uppercase tracking-wide text-center hover:bg-[#5D0F17]/85 transition"
 >
 Checkout
 </a>
 ) : (
 <button
 disabled
 className="block w-full bg-[#5D0F17]/30 text-[#FFFDF8] py-4 text-sm uppercase tracking-wide text-center cursor-not-allowed"
 >
 Coming Soon
 </button>
 )}

 <p className="text-[10px] text-[#5D0F17]/40 mt-4 text-center">
 You&apos;ll be redirected to {product.store} to complete your
 purchase.
 </p>

 {product.dbId && (
 <AddToCollectionButton
 productId={product.dbId}
 snapshot={{
 title: product.title,
 price: product.price,
 image: product.image,
 store: product.store,
 storeSlug: product.storeSlug,
 }}
 />
 )}
 </div>
 </div>
 </div>
 );
}
