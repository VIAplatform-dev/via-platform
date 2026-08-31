"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

const FEEDBACK_URL = "https://form.typeform.com/to/ssrEgHZ1";
const STORAGE_KEY = "vya_feedback_dismissed";

// Paths where the feedback popup should never appear: auth/waiting pages, the standalone
// /infrastructure landing page, and the seller back-offices (/admin Store OS, /store portal) —
// a seller mid-checkout at a market must never get a survey over the payment screen.
const AUTH_PATHS = ["/login", "/register", "/pilot-pending", "/infrastructure", "/admin", "/store"];

export default function FeedbackModal() {
 const [open, setOpen] = useState(false);
 const pathname = usePathname();

 useEffect(() => {
 // Don't show on auth/waiting pages
 if (AUTH_PATHS.some((p) => pathname.startsWith(p))) return;
 // Don't show if already dismissed this session
 if (sessionStorage.getItem(STORAGE_KEY)) return;

 const timer = setTimeout(() => {
 setOpen(true);
 }, 60_000); // 1 minute

 return () => clearTimeout(timer);
 }, [pathname]);

 function dismiss() {
 sessionStorage.setItem(STORAGE_KEY, "1");
 setOpen(false);
 }

 if (!open) return null;

 return (
 <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-[#5D0F17]/30 backdrop-blur-sm"
 onClick={dismiss}
 />

 {/* Card */}
 <div className="relative bg-white w-full max-w-md px-8 py-10 shadow-2xl">
 <button
 onClick={dismiss}
 className="absolute top-4 right-4 text-[#5D0F17]/40 hover:text-[#5D0F17] transition"
 aria-label="Close"
 >
 <X size={18} />
 </button>

 <p className="text-[10px] uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-3">VYA Pilot</p>
 <h2 className="font-serif text-2xl text-[#5D0F17] mb-3 leading-snug">
 Help us improve.
 </h2>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed mb-7">
 You&apos;re one of our first pilot users. We&apos;d love to hear your feedback — it takes less than 2 minutes.
 </p>

 <div className="flex flex-col sm:flex-row gap-3">
 <a
 href={FEEDBACK_URL}
 target="_blank"
 rel="noopener noreferrer"
 onClick={dismiss}
 className="flex-1 flex items-center justify-center bg-[#5D0F17] text-[#FFFDF8] py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition"
 >
 Give Feedback
 </a>
 <button
 onClick={dismiss}
 className="flex-1 flex items-center justify-center border border-[#5D0F17]/25 text-[#5D0F17]/60 py-3 text-xs uppercase tracking-[0.15em] hover:border-[#5D0F17] hover:text-[#5D0F17] transition"
 >
 Maybe Later
 </button>
 </div>
 </div>
 </div>
 );
}
