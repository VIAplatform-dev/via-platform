"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryLabel } from "@/app/lib/categoryMap";
import ImageCarousel from "./ImageCarousel";
import FavoriteButton from "./FavoriteButton";
import { normalizeSize, convertSizeToUS } from "@/app/lib/sizeUtils";
import { trackSelectItem } from "@/app/lib/firebase-analytics";

const SIZE_LABELS: Record<string, string> = {
 XS: "XS",
 S: "S",
 M: "M",
 L: "L",
 XL: "XL",
 XXL: "XXL",
 XXXL: "XXXL",
 "One Size": "One Size",
};

const CLOTHING_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);

const SHOE_RE = /shoe|boot|heel|sneaker|flat|sandal|loafer|pump|mule|slipper|clog/i;

function expandSize(size: string, category?: string, title?: string): string {
 const cat = category ?? "";
 const normalized = normalizeSize(size);

 // Try EU/UK → US conversion via shared utility (title lets it catch shoes the category missed)
 const converted = convertSizeToUS(size, cat, title);
 if (converted) return converted;

 // For shoes: if stored as a letter size but title has a numeric EU size, extract and convert it
 if (SHOE_RE.test(cat) && CLOTHING_SIZES.has(normalized) && title) {
 const match = title.match(/\b(\d{2}(?:\.\d)?)\s*$/);
 if (match) {
  const us = convertSizeToUS(match[1], cat, title);
  return us ?? match[1];
 }
 }

 return SIZE_LABELS[normalized] ?? normalized;
}

// Strip "Size X" patterns from a product title when size is already shown separately
function stripSizeFromTitle(title: string, size: string | null | undefined): string {
 if (!size) return title;
 const result = title
 // "(Size M)" or "(size 38)" anywhere
 .replace(/\s*\(\s*size\s*:?\s*[^)]+\)\s*/gi, " ")
 // Bare size in parens: "(S)", "(M)", "(38)", "(EU 38)"
 .replace(/\s*\(\s*(?:Extra\s+Small|Extra\s+Large|X{0,3}S|M|L|X{1,3}L|OS(?:FM)?|One\s+Size|(?:US|UK|EU|IT)?\s*\d{1,2}(?:[.,]\d)?|(?:US|UK|EU|IT)\s*\d{1,2}(?:[.,]\d)?)\s*\)\s*/gi, " ")
 // "- Size M", "/ Size M", ", Size M", "| Size M" at end
 .replace(/\s*[-–—|\/,]+\s*size\s*:?\s*\S+\s*$/gi, "")
 // " Size M" at end (space before "size")
 .replace(/\s+size\s*:?\s*\S+\s*$/gi, "")
 .trim();
 return result || title;
}

type ProductCardProps = {
 id: string;
 dbId?: number;
 name: string;
 price: string;
 compareAtPrice?: string;
 category: CategoryLabel;
 storeName: string;
 storeSlug: string;
 externalUrl?: string;
 image: string;
 images?: string[];
 favoriteCount?: number;
 from?: string;
 size?: string | null;
 isEditorsPick?: boolean;
 soldOut?: boolean;
 onImageFail?: () => void;
 priority?: boolean;
};

export default function ProductCard({
 id,
 dbId,
 name,
 price,
 compareAtPrice,
 category,
 storeName,
 storeSlug,
 image,
 images,
 favoriteCount,
 from,
 size,
 isEditorsPick,
 soldOut,
 onImageFail,
 priority,
}: ProductCardProps) {
 const pathname = usePathname();
 const carouselImages =
 images && images.length > 0 ? images : image ? [image] : [];

 // Parse dbId from composite id if not provided (e.g. "lei-vintage-42" -> 42)
 const numericId = dbId ?? (() => {
 const match = id.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })();

 const surface = from ? `${pathname}:${from}` : pathname;
 const href = soldOut
 ? "#"
 : from
 ? `/products/${id}?from=${encodeURIComponent(from)}`
 : `/products/${id}`;

 return (
 <div className="relative group">
 {soldOut && (
 <div className="absolute inset-0 z-20 bg-[#FFFDF8]/70 pointer-events-none flex items-start justify-center pt-8 sm:pt-10">
 <span className="bg-[#FFFDF8]/95 border border-[#5D0F17]/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#5D0F17]/50">
 Sold Out
 </span>
 </div>
 )}
 <Link
 href={href}
 className={`cursor-pointer text-[#5D0F17] block ${soldOut ? "opacity-40 pointer-events-none" : ""}`}
 onClick={() => {
 if (soldOut) {
 return;
 }

 trackSelectItem(
 {
 itemId: id,
 itemName: name,
 price,
 category,
 storeName,
 storeSlug,
 size: size ?? undefined,
 listId: surface,
 listName: surface,
 },
 surface
 );
 }}
 >
 <ImageCarousel images={carouselImages} alt={name} variant="card" isEditorsPick={isEditorsPick} onAllImagesFailed={onImageFail} priority={priority} />

 {/* Product info */}
 <div className="pt-3 pb-1 sm:pb-2 px-2 sm:px-3 flex flex-col gap-1">
 <p className="font-sans text-[9px] sm:text-[10px] uppercase tracking-[0.16em] text-[#5D0F17]/45">
 {storeName}
 </p>

 <h3 className="font-sans font-medium text-[13px] sm:text-sm text-[#5D0F17] leading-snug line-clamp-2">
 {stripSizeFromTitle(name, size)}
 </h3>

 <div className="flex items-baseline gap-2 mt-0.5">
 <p className="font-sans text-[13px] sm:text-sm text-[#5D0F17]">{price}</p>
 {compareAtPrice && (
 <p className="font-sans text-[12px] sm:text-[13px] text-[#5D0F17]/40 line-through">{compareAtPrice}</p>
 )}
 </div>

 {size && (
 <p className="font-sans text-[11px] text-[#5D0F17]/45 tracking-wide">
 Size {expandSize(size, String(category), name)}
 </p>
 )}
 </div>
 </Link>

 {/* Favorite button overlay — always visible on mobile, hover on desktop */}
 {numericId != null && (
 <div className={`absolute top-2 right-2 z-40 transition-opacity ${favoriteCount && favoriteCount > 0 ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}>
 <FavoriteButton type="product" targetId={numericId} size="sm" favoriteCount={favoriteCount} />
 </div>
 )}
 </div>
 );
}
