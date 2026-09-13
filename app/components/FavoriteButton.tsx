"use client";

import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useFavorites } from "./FavoritesProvider";
import { trackFavoriteToggle } from "@/app/lib/firebase-analytics";

type FavoriteButtonProps = {
 type: "product" | "store";
 targetId: number | string;
 size?: "sm" | "md";
 className?: string;
 favoriteCount?: number;
};

export default function FavoriteButton({
 type,
 targetId,
 size = "sm",
 className = "",
 favoriteCount,
}: FavoriteButtonProps) {
 const { data: session } = useSession();
 const router = useRouter();
 const { isProductFavorited, isStoreFavorited, toggleProduct, toggleStore } = useFavorites();
 const [showSignInHint, setShowSignInHint] = useState(false);

 const isFavorited =
 type === "product"
 ? isProductFavorited(targetId as number)
 : isStoreFavorited(targetId as string);

 const iconSize = size === "sm" ? 16 : 22;

 // Track the user's own contribution to the count so it updates instantly.
 // Compare current favorited state to what it was when we last saw a server-fresh count.
 const initialFavoritedRef = useRef(isFavorited);
 useEffect(() => {
 // When the server prop changes, treat the current favorited state as the new baseline
 initialFavoritedRef.current = isFavorited;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [favoriteCount]);

 const baseCount = favoriteCount ?? 0;
 let displayCount = baseCount;
 if (type === "product") {
 if (isFavorited && !initialFavoritedRef.current) displayCount = baseCount + 1;
 else if (!isFavorited && initialFavoritedRef.current) displayCount = Math.max(0, baseCount - 1);
 }

 // Show count for products only, and only if > 0
 const showCount = type === "product" && favoriteCount != null && displayCount > 0;

 function handleClick(e: React.MouseEvent) {
 e.preventDefault();
 e.stopPropagation();

 if (!session) {
 setShowSignInHint(true);
 setTimeout(() => setShowSignInHint(false), 2500);
 return;
 }

 if (type === "product") {
 toggleProduct(targetId as number);
 } else {
 toggleStore(targetId as string);
 }

 trackFavoriteToggle({
 targetType: type,
 targetId: String(targetId),
 action: isFavorited ? "removed" : "added",
 });
 }

 if (showCount) {
 return (
 <div className="relative inline-flex">
 <button
 onClick={handleClick}
 aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
 className={`inline-flex items-center gap-1.5 transition-all duration-200 ${
 size === "sm"
 ? "h-8 px-2 rounded-full bg-white/80 hover:bg-white shadow-sm"
 : "h-10 px-3 rounded-full bg-neutral-100 hover:bg-neutral-200"
 } ${className}`}
 >
 <Heart
 size={iconSize}
 className={`transition-colors duration-200 ${
 isFavorited ? "fill-red-500 text-red-500" : "fill-none text-black/60"
 }`}
 />
 <span className={`font-medium text-black/60 ${size === "sm" ? "text-[11px]" : "text-xs"}`}>
 {displayCount}
 </span>
 </button>
 {showSignInHint && (
 <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-black/80 text-white text-[11px] px-3 py-1.5 rounded pointer-events-none z-50">
 <button
 className="underline pointer-events-auto"
 onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push("/login"); }}
 >
 Sign in
 </button>
 {" "}to save favorites
 </div>
 )}
 </div>
 );
 }

 return (
 <div className="relative inline-flex">
 <button
 onClick={handleClick}
 aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
 // The heart sits on a product photo the whole card links to, so a near-miss doesn't do
 // nothing — it opens the product. The circle stays 32/40px because that is the design;
 // the TOUCH target is grown to 44 with a transparent pseudo-element instead, which costs
 // no layout and no visual change. `relative` on the wrapper keeps it anchored.
 className={`relative inline-flex items-center justify-center transition-all duration-200 before:absolute before:content-[''] ${
 size === "sm"
 ? "w-8 h-8 rounded-full bg-white/80 hover:bg-white shadow-sm before:-inset-1.5"
 : "w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 before:-inset-0.5"
 } ${className}`}
 >
 <Heart
 size={iconSize}
 className={`transition-colors duration-200 ${
 isFavorited ? "fill-red-500 text-red-500" : "fill-none text-black/60"
 }`}
 />
 </button>
 {showSignInHint && (
 <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-black/80 text-white text-[11px] px-3 py-1.5 rounded pointer-events-none z-50">
 <button
 className="underline pointer-events-auto"
 onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push("/login"); }}
 >
 Sign in
 </button>
 {" "}to save favorites
 </div>
 )}
 </div>
 );
}
