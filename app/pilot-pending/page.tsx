"use client";

import { signOut } from "next-auth/react";
import { getBaseUrl } from "@/app/lib/base-url";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

const BASE_URL = getBaseUrl();

export default function PilotPendingPage() {
 const [referralCode, setReferralCode] = useState<string | null>(null);
 const [copied, setCopied] = useState(false);

 useEffect(() => {
 fetch("/api/referral-status")
 .then((r) => r.json())
 .then((data) => {
 if (data.referralCode) setReferralCode(data.referralCode);
 })
 .catch(() => {});
 }, []);

 const referralLink = referralCode
 ? `${BASE_URL}/register?ref=${referralCode}`
 : null;

 function copyLink() {
 if (!referralLink) return;
 navigator.clipboard.writeText(referralLink).then(() => {
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 });
 }

 return (
 <div className="fixed inset-0 z-[200] flex">
 {/* Left: solid red */}
 <div className="hidden lg:block lg:w-1/2 bg-[#5D0F17]" />

 {/* Right: content */}
 <div className="w-full lg:w-1/2 bg-white flex flex-col overflow-y-auto">
 <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 py-12 max-w-xl w-full mx-auto text-center">
 <div className="flex items-start gap-1.5 mb-10 justify-center">
 <img src="/vya-logo.png" alt="VYA" className="h-7 w-auto" />
 <span className="text-[9px] uppercase tracking-[0.15em] text-[#5D0F17]/60 font-sans">pilot</span>
 </div>

 <h1 className="font-serif text-3xl sm:text-4xl text-[#5D0F17] mb-4">
 You&apos;re on the list.
 </h1>

 <p className="text-sm text-[#5D0F17]/60 leading-relaxed mb-3">
 You&apos;re added to the wait. We&apos;ll let you know when you can start shopping our pilot.
 </p>

 {/* Referral section */}
 {referralCode && (
 <div className="bg-[#FFFDF8] px-6 py-6 mb-8 text-left">
 <p className="text-[10px] uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-3">
 Your referral link
 </p>

 {/* Link + copy */}
 <div className="flex items-stretch border border-[#5D0F17]/20">
 <p className="flex-1 px-3 py-2.5 text-xs text-[#5D0F17]/70 truncate bg-white">
 {referralLink}
 </p>
 <button
 onClick={copyLink}
 className="px-4 border-l border-[#5D0F17]/20 text-[#5D0F17]/50 hover:text-[#5D0F17] hover:bg-[#5D0F17]/5 transition flex items-center gap-1.5 text-xs uppercase tracking-wide"
 >
 {copied ? <Check size={13} /> : <Copy size={13} />}
 {copied ? "Copied" : "Copy"}
 </button>
 </div>
 </div>
 )}

 <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
 <Link
 href="/for-stores"
 className="px-6 py-3 border border-[#5D0F17]/20 text-sm text-[#5D0F17] hover:border-[#5D0F17] transition"
 >
 Partner with VYA
 </Link>
 <button
 onClick={() => signOut({ callbackUrl: "/login" })}
 className="px-6 py-3 text-sm text-[#5D0F17]/40 hover:text-[#5D0F17] transition underline"
 >
 Sign out
 </button>
 </div>

 <p className="text-xs text-[#5D0F17]/30">
 Questions?{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="underline">
 partnerships@vyaplatform.com
 </a>
 </p>
 </div>
 </div>
 </div>
 );
}
