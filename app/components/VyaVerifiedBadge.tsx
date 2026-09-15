"use client";

import Link from "next/link";

/**
 * VYA Verified badge: shown next to store name on store pages.
 * Deep red circle with cream checkmark, links to /trust.
 */
export default function VyaVerifiedBadge({ className = "" }: { className?: string }) {
 return (
 <Link
 href="/trust"
 className={`inline-flex items-center gap-1 group/badge ${className}`}
 onClick={(e) => e.stopPropagation()}
 >
 {/* Badge icon */}
 <span
 className="flex-shrink-0 w-[14px] h-[14px] sm:w-4 sm:h-4 rounded-full bg-[#5D0F17] flex items-center justify-center"
 aria-label="VYA Verified"
 >
 <svg
 viewBox="0 0 10 10"
 className="w-[7px] h-[7px] sm:w-[8px] sm:h-[8px]"
 fill="none"
 stroke="#FFFDF8"
 strokeWidth="1.8"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <polyline points="2,5.2 4.2,7.5 8,3" />
 </svg>
 </span>

 {/* Label */}
 <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.12em] text-[#5D0F17]/50 group-hover/badge:text-[#5D0F17] transition-colors">
 VYA Verified
 </span>
 </Link>
 );
}
