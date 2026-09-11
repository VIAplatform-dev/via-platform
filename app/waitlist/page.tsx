"use client";

import { useState, useEffect, Suspense } from "react";
import { getBaseUrl } from "@/app/lib/base-url";
import { acquisitionSource } from "@/app/lib/capturedSource";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Phase = "waitlist" | "invite" | "confirmation";

interface StatusData {
 referralCount: number;
 friend1Entered: boolean;
 friend2Entered: boolean;
 isComplete: boolean;
}

function WaitlistContent() {
 const searchParams = useSearchParams();
 const refCode = searchParams.get("ref");

 const [phase, setPhase] = useState<Phase>("waitlist");
 const [email, setEmail] = useState("");
 const [phone1, setPhone1] = useState("");
 const [phone2, setPhone2] = useState("");
 const [referralCode, setReferralCode] = useState("");
 const [referralLink, setReferralLink] = useState("");
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [errorMsg, setErrorMsg] = useState("");
 const [copied, setCopied] = useState(false);
 const [status, setStatus] = useState<StatusData | null>(null);
 const [pendingPhone, setPendingPhone] = useState("");
 const [accessCode, setAccessCode] = useState("");
 const [accessError, setAccessError] = useState("");
 const [accessLoading, setAccessLoading] = useState(false);

 const handleAccessCode = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!accessCode.trim()) return;
 setAccessError("");
 setAccessLoading(true);
 try {
 const res = await fetch("/api/access-code", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ code: accessCode.trim() }),
 });
 if (res.ok) {
 window.location.href = "/";
 } else {
 setAccessError("Invalid code");
 }
 } catch {
 setAccessError("Something went wrong");
 } finally {
 setAccessLoading(false);
 }
 };

 useEffect(() => {
 const storedCode = localStorage.getItem("via_giveaway_code");
 const storedEmail = localStorage.getItem("via_giveaway_email");
 const entered = localStorage.getItem("via_giveaway_entered");

 if (entered && storedCode && storedEmail) {
 setReferralCode(storedCode);
 setEmail(storedEmail);
 const baseUrl = getBaseUrl();
 setReferralLink(`${baseUrl}/waitlist?ref=${storedCode}`);
 setPhase("confirmation");

 fetch(`/api/giveaway/status/${storedCode}`)
 .then((res) => res.json())
 .then((data) => {
 if (!data.error) setStatus(data);
 })
 .catch(() => {});
 }
 }, []);

 useEffect(() => {
 if (phase !== "confirmation" || !referralCode) return;

 const poll = () => {
 fetch(`/api/giveaway/status/${referralCode}`)
 .then((res) => res.json())
 .then((data) => {
 if (!data.error) setStatus(data);
 })
 .catch(() => {});
 };

 const interval = setInterval(poll, 10000);
 return () => clearInterval(interval);
 }, [phase, referralCode]);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!email.trim()) return;
 setErrorMsg("");
 setIsSubmitting(true);

 try {
 const waitlistRes = await fetch("/api/waitlist", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email: email.trim(), source: acquisitionSource("waitlist") }),
 });

 if (!waitlistRes.ok) {
 const data = await waitlistRes.json();
 if (!data.error?.includes("already")) {
 setErrorMsg(data.error || "Something went wrong.");
 return;
 }
 }

 const giveawayRes = await fetch("/api/giveaway/enter", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email: email.trim(), refCode }),
 });

 const giveawayData = await giveawayRes.json();

 if (!giveawayRes.ok) {
 setErrorMsg(giveawayData.error || "Something went wrong.");
 return;
 }

 setReferralCode(giveawayData.referralCode);
 setReferralLink(giveawayData.referralLink);
 localStorage.setItem("via_giveaway_entered", "true");
 localStorage.setItem("via_giveaway_code", giveawayData.referralCode);
 localStorage.setItem("via_giveaway_email", email.trim().toLowerCase());

 setPhase("invite");
 } catch {
 setErrorMsg("Something went wrong. Please try again.");
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleSendInvites = async () => {
 if (phone1 || phone2) {
 try {
 await fetch("/api/giveaway/invite", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ referralCode, phone1, phone2 }),
 });
 } catch {
 // Non-blocking
 }
 }

 const message = `Check out VYA, vintage & secondhand. Enter the giveaway to win a $1,000 shopping spree: ${referralLink}`;
 const first = phone1.trim() || phone2.trim();
 const second = phone1.trim() && phone2.trim() ? phone2.trim() : "";

 if (first) {
 window.location.href = `sms:${first}?&body=${encodeURIComponent(message)}`;
 }

 if (second) {
 setPendingPhone(second);
 } else {
 goToConfirmation();
 }
 };

 const handleSendSecond = () => {
 const message = `Check out VYA, vintage & secondhand. Enter the giveaway to win a $1,000 shopping spree: ${referralLink}`;
 window.location.href = `sms:${pendingPhone}?&body=${encodeURIComponent(message)}`;
 setPendingPhone("");
 goToConfirmation();
 };

 const goToConfirmation = async () => {
 setPhase("confirmation");
 try {
 const res = await fetch(`/api/giveaway/status/${referralCode}`);
 const data = await res.json();
 if (!data.error) setStatus(data);
 } catch {
 // Non-blocking
 }
 };

 const handleCopyLink = async () => {
 try {
 await navigator.clipboard.writeText(referralLink);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 } catch {
 // Fallback
 }
 };

 return (
 <div className="min-h-full bg-[#FFFDF8] text-[#5D0F17]">
 {/* Header */}
 <div className="px-6 py-5 flex items-center justify-between">
 <img src="/vya-logo.png" alt="VYA" className="h-20 w-auto" />
 </div>

 {/* Content */}
 <div className="max-w-xl mx-auto px-6 py-12 sm:py-20">

 {/* Phase: Waitlist */}
 {phase === "waitlist" && (
 <div>
 <p className="text-xs uppercase tracking-[0.25em] text-[#5D0F17]/50 mb-4">
 Launching March 19th at 5 PM
 </p>
 <h1 className="text-3xl sm:text-4xl font-serif mb-4 leading-snug">
 Shop vintage &amp; secondhand,<br />all in one place.
 </h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 mb-10 leading-relaxed max-w-md">
 Join the waitlist for early access. VYA lets you browse independent
 vintage and secondhand stores across the country in one seamless
 experience, and enter our giveaway to win a $1,000 shopping spree.
 </p>

 <form onSubmit={handleSubmit}>
 <div className="flex flex-col sm:flex-row gap-3">
 <input
 type="email"
 value={email}
 onChange={(e) => {
 setEmail(e.target.value);
 setErrorMsg("");
 }}
 placeholder="Enter your email"
 required
 className="flex-1 px-4 py-3.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:outline-none focus:border-[#5D0F17] transition min-h-[48px]"
 disabled={isSubmitting}
 />
 <button
 type="submit"
 disabled={isSubmitting || !email.trim()}
 className="px-8 py-3.5 bg-[#5D0F17] text-[#FFFDF8] text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition disabled:opacity-50 whitespace-nowrap min-h-[48px]"
 >
 {isSubmitting ? "Joining..." : "Join the Waitlist"}
 </button>
 </div>
 {errorMsg && (
 <p className="text-red-600 text-sm mt-3">{errorMsg}</p>
 )}
 </form>

 {/* Access Code */}
 <div className="mt-12 pt-8">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-4">
 Have an access code?
 </p>
 <form onSubmit={handleAccessCode}>
 <div className="flex flex-col sm:flex-row gap-3">
 <input
 type="text"
 value={accessCode}
 onChange={(e) => {
 setAccessCode(e.target.value);
 setAccessError("");
 }}
 placeholder="Enter code"
 className="flex-1 px-4 py-3.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:outline-none focus:border-[#5D0F17] transition min-h-[48px]"
 disabled={accessLoading}
 />
 <button
 type="submit"
 disabled={accessLoading || !accessCode.trim()}
 className="px-8 py-3.5 border border-[#5D0F17] text-[#5D0F17] text-sm uppercase tracking-wide hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition disabled:opacity-50 whitespace-nowrap min-h-[48px]"
 >
 {accessLoading ? "Checking..." : "Enter"}
 </button>
 </div>
 {accessError && (
 <p className="text-red-600 text-sm mt-3">{accessError}</p>
 )}
 </form>
 </div>
 </div>
 )}

 {/* Phase: Invite */}
 {phase === "invite" && (
 <div>
 {pendingPhone ? (
 <>
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-4">
 $1,000 Giveaway
 </p>
 <h2 className="text-2xl sm:text-3xl font-serif mb-4 leading-snug">
 Now send to Friend 2
 </h2>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 mb-10 leading-relaxed max-w-md">
 Tap below to open a message to your second friend. They need to sign up for you to be entered.
 </p>

 <button
 onClick={handleSendSecond}
 className="w-full bg-[#5D0F17] text-[#FFFDF8] py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Send to Friend 2
 </button>

 <button
 onClick={() => { setPendingPhone(""); goToConfirmation(); }}
 className="mt-4 text-sm text-[#5D0F17]/50 hover:text-[#5D0F17] transition py-2 block mx-auto"
 >
 Skip for now
 </button>
 </>
 ) : (
 <>
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-4">
 $1,000 Giveaway
 </p>
 <h2 className="text-2xl sm:text-3xl font-serif mb-4 leading-snug">
 Invite two friends<br />to sign up
 </h2>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 mb-10 leading-relaxed max-w-md">
 Enter your friends&apos; phone numbers below. Both need to sign up for you to be officially entered in the giveaway.
 </p>

 <div className="space-y-3 mb-6">
 <input
 type="tel"
 value={phone1}
 onChange={(e) => setPhone1(e.target.value)}
 placeholder="Friend 1's phone number"
 className="w-full px-4 py-3.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:outline-none focus:border-[#5D0F17] transition"
 />
 <input
 type="tel"
 value={phone2}
 onChange={(e) => setPhone2(e.target.value)}
 placeholder="Friend 2's phone number"
 className="w-full px-4 py-3.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:outline-none focus:border-[#5D0F17] transition"
 />
 </div>

 {/* Copy link */}
 <div className="mb-8">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">Or copy your unique link</p>
 <div className="flex items-center border border-[#5D0F17]/20 overflow-hidden">
 <span className="flex-1 px-4 py-3 text-xs text-[#5D0F17]/50 truncate">
 {referralLink}
 </span>
 <button
 onClick={handleCopyLink}
 className="flex-shrink-0 px-5 py-3 bg-[#5D0F17] text-[#FFFDF8] text-xs uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 {copied ? "Copied!" : "Copy"}
 </button>
 </div>
 </div>

 <button
 onClick={handleSendInvites}
 className="w-full bg-[#5D0F17] text-[#FFFDF8] py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Send Invites
 </button>

 <button
 onClick={() => goToConfirmation()}
 className="mt-4 text-sm text-[#5D0F17]/50 hover:text-[#5D0F17] transition py-2 block mx-auto"
 >
 Skip for now
 </button>
 </>
 )}
 </div>
 )}

 {/* Phase: Confirmation */}
 {phase === "confirmation" && (
 <div>
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-4">
 VYA Giveaway
 </p>
 <h2 className="text-2xl sm:text-3xl font-serif mb-4 leading-snug">
 You&apos;re in the queue
 </h2>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 mb-10 leading-relaxed max-w-md">
 {status && status.referralCount >= 2
 ? "You\u2019re officially entered! Keep sharing \u2014 every referral gives you another chance to win."
 : "Get 2 friends to sign up using your link to be entered. The more friends you refer, the more chances you get to win!"}
 </p>

 {/* Referral progress */}
 <div className="mb-10">
 <p className="text-sm text-[#5D0F17]/60 mb-4">
 {status?.referralCount || 0} friend{(status?.referralCount || 0) !== 1 ? "s" : ""} referred
 </p>
 <div className="flex items-center gap-3">
 <div
 className={`w-10 h-10 border-2 flex items-center justify-center transition-colors ${
 status && status.referralCount >= 1
 ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
 : "border-[#5D0F17]/20 text-[#5D0F17]/30"
 }`}
 >
 {status && status.referralCount >= 1 ? (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 ) : (
 <span className="text-sm">1</span>
 )}
 </div>
 <div className={`w-8 h-px ${status && status.referralCount >= 1 ? "bg-[#5D0F17]" : "bg-[#5D0F17]/20"}`} />
 <div
 className={`w-10 h-10 border-2 flex items-center justify-center transition-colors ${
 status && status.referralCount >= 2
 ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
 : "border-[#5D0F17]/20 text-[#5D0F17]/30"
 }`}
 >
 {status && status.referralCount >= 2 ? (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 ) : (
 <span className="text-sm">2</span>
 )}
 </div>
 {status && status.referralCount > 2 && (
 <>
 <div className="w-8 h-px bg-[#5D0F17]" />
 <div className="h-10 px-4 border-2 border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center">
 <span className="text-sm font-medium">+{status.referralCount - 2}</span>
 </div>
 </>
 )}
 </div>
 {status && status.referralCount >= 2 && (
 <p className="text-xs text-[#5D0F17]/50 mt-3">
 You have {status.referralCount} {status.referralCount === 1 ? "entry" : "entries"} in the giveaway
 </p>
 )}
 </div>

 {/* Copy link */}
 {referralLink && (
 <div className="mb-10">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">Your unique referral link</p>
 <div className="flex items-center border border-[#5D0F17]/20 overflow-hidden">
 <span className="flex-1 px-4 py-3 text-xs text-[#5D0F17]/50 truncate">
 {referralLink}
 </span>
 <button
 onClick={handleCopyLink}
 className="flex-shrink-0 px-5 py-3 bg-[#5D0F17] text-[#FFFDF8] text-xs uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 {copied ? "Copied!" : "Copy"}
 </button>
 </div>
 </div>
 )}

 <p className="text-[11px] text-[#5D0F17]/40 leading-relaxed mb-10">
 By entering, you agree to VYA&apos;s Terms &amp; Conditions. Each referral beyond your first gives you an additional entry. Winner will be selected at random. Giveaway credit must be used on items listed on VYA.
 </p>

 {/* Access Code */}
 <div className="pt-8">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-4">
 Have an access code?
 </p>
 <form onSubmit={handleAccessCode}>
 <div className="flex flex-col sm:flex-row gap-3">
 <input
 type="text"
 value={accessCode}
 onChange={(e) => {
 setAccessCode(e.target.value);
 setAccessError("");
 }}
 placeholder="Enter code"
 className="flex-1 px-4 py-3.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:outline-none focus:border-[#5D0F17] transition min-h-[48px]"
 disabled={accessLoading}
 />
 <button
 type="submit"
 disabled={accessLoading || !accessCode.trim()}
 className="px-8 py-3.5 border border-[#5D0F17] text-[#5D0F17] text-sm uppercase tracking-wide hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition disabled:opacity-50 whitespace-nowrap min-h-[48px]"
 >
 {accessLoading ? "Checking..." : "Enter"}
 </button>
 </div>
 {accessError && (
 <p className="text-red-600 text-sm mt-3">{accessError}</p>
 )}
 </form>
 </div>
 </div>
 )}

 </div>

 {/* Footer */}
 <footer className="px-6 py-6">
 <div className="max-w-xl mx-auto flex items-center justify-between text-[10px] uppercase tracking-wider text-[#5D0F17]/40">
 <div className="flex items-center gap-6">
 <Link href="/terms" className="hover:text-[#5D0F17] transition-colors">Terms</Link>
 <Link href="/privacy" className="hover:text-[#5D0F17] transition-colors">Privacy</Link>
 <a
 href="https://www.instagram.com/theviaplatform/"
 target="_blank"
 rel="noopener noreferrer"
 className="hover:text-[#5D0F17] transition-colors"
 >
 Instagram
 </a>
 </div>
 <Link href="/admin/login?redirect=/admin/sync" className="hover:text-[#5D0F17] transition-colors">
 Staff Access
 </Link>
 </div>
 </footer>
 </div>
 );
}

export default function WaitlistPage() {
 return (
 <Suspense>
 <WaitlistContent />
 </Suspense>
 );
}
