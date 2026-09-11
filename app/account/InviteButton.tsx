"use client";

import { useState } from "react";

const BASE_URL = "https://vyaplatform.com";

type Props = { label?: string; referralCode?: string | null; compact?: boolean };

export default function InviteButton({ label, referralCode, compact }: Props = {}) {
 const [open, setOpen] = useState(false);
 const [copied, setCopied] = useState(false);
 const [codeCopied, setCodeCopied] = useState(false);

 const inviteUrl = referralCode ? `${BASE_URL}?ref=${referralCode}` : BASE_URL;
 const inviteText = `Join VYA! An online platform where you can shop the best vintage stores, all in one place! ${inviteUrl}`;

 function copyLink() {
 navigator.clipboard.writeText(inviteUrl).then(() => {
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 });
 }

 function copyCode() {
 if (!referralCode) return;
 navigator.clipboard.writeText(referralCode).then(() => {
 setCodeCopied(true);
 setTimeout(() => setCodeCopied(false), 2000);
 });
 }

 return (
 <>
 <button
 onClick={() => setOpen(true)}
 className={compact
 ? "text-center text-xs uppercase tracking-[0.12em] px-5 py-2.5 border border-[#5D0F17]/25 text-[#5D0F17]/70 hover:border-[#5D0F17]/60 hover:text-[#5D0F17] transition whitespace-nowrap"
 : "w-full text-center text-sm uppercase tracking-[0.15em] px-5 py-3 border border-[#5D0F17] hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition"
 }
 >
 {label ?? "Invite a Friend"}
 </button>

 {open && (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
 onClick={() => setOpen(false)}
 >
 <div
 className="bg-[#FFFDF8] text-[#5D0F17] w-full max-w-md p-8 flex flex-col gap-6"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-start justify-between gap-4">
 <h2 className="font-serif text-xl">Invite a Friend</h2>
 <button
 onClick={() => setOpen(false)}
 className="text-[#5D0F17]/40 hover:text-[#5D0F17] transition text-xl leading-none mt-0.5"
 >
 ×
 </button>
 </div>

 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">
 Share VYA with someone who&apos;d love it, vintage stores, all in one place.
 </p>

 {/* Referral code */}
 {referralCode && (
 <div className="border border-[#5D0F17]/15 p-4 flex items-center justify-between gap-4 bg-white/40">
 <div>
 <p className="text-[10px] uppercase tracking-widest text-[#5D0F17]/40 mb-1">Your referral code</p>
 <p className="font-serif text-xl tracking-wider">{referralCode}</p>
 </div>
 <button
 onClick={copyCode}
 className="shrink-0 text-xs uppercase tracking-[0.12em] px-3 py-2 border border-[#5D0F17]/30 hover:border-[#5D0F17] transition"
 >
 {codeCopied ? "Copied!" : "Copy"}
 </button>
 </div>
 )}

 {/* Link row */}
 <div className="flex items-center gap-2">
 <div className="flex-1 border border-[#5D0F17]/20 px-3 py-2.5 text-sm text-[#5D0F17]/70 truncate bg-white/50 select-all">
 {inviteUrl}
 </div>
 <button
 onClick={copyLink}
 className="shrink-0 text-xs uppercase tracking-[0.12em] px-4 py-2.5 bg-[#5D0F17] text-[#FFFDF8] hover:bg-[#5D0F17]/85 transition whitespace-nowrap"
 >
 {copied ? "Copied!" : "Copy Link"}
 </button>
 </div>

 {/* SMS share */}
 <a
 href={`sms:?body=${encodeURIComponent(inviteText)}`}
 className="block text-center text-sm uppercase tracking-[0.15em] px-5 py-3 border border-[#5D0F17] hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition"
 >
 Send as Text Message
 </a>
 </div>
 </div>
 )}
 </>
 );
}
