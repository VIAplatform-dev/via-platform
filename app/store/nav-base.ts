"use client";

import { usePathname } from "next/navigation";

// The store pages are served in two places: the seller portal (/store) and the
// owner's infrastructure workspace (/admin). Internal navigation must
// stay in whichever one you're in — so pages build links off this base instead of a
// hardcoded "/store".
export function useStoreBase(): string {
 const p = usePathname() || "";
 return p.startsWith("/admin") ? "/admin" : "/store";
}
