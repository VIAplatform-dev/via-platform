"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const REASONS = [
 "Too many emails",
 "Not relevant to me",
 "I didn't sign up for this",
 "I found what I was looking for",
 "Other",
];

function UnsubscribeForm() {
 const searchParams = useSearchParams();
 // Most VYA emails link here without an address (the footer has no per-recipient token), so the
 // page has to be able to ask. With `?email=`, it's filled in and shown as before.
 const linkEmail = searchParams.get("email") ?? "";
 const [typedEmail, setTypedEmail] = useState("");
 const email = linkEmail || typedEmail.trim();

 const [reason, setReason] = useState("");
 const [detail, setDetail] = useState("");
 const [loading, setLoading] = useState(false);
 const [done, setDone] = useState(false);
 const [error, setError] = useState("");

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!reason || !email) return;
 setLoading(true);
 setError("");
 try {
 const res = await fetch("/api/unsubscribe", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email, reason, detail: detail || null }),
 });
 if (!res.ok) throw new Error("Failed");
 setDone(true);
 } catch {
 setError("Something went wrong. Please try again.");
 }
 setLoading(false);
 }

 if (done) {
 return (
 <div className="text-center">
 <p className="font-serif text-2xl text-[#5D0F17] mb-4">You&apos;ve been unsubscribed.</p>
 <p className="text-sm text-[#5D0F17]/60 mb-8 leading-relaxed">
 You won&apos;t receive any more marketing emails from VYA.
 <br />Your account is still active &mdash; you can still browse and shop.
 </p>
 <Link
 href="/"
 className="text-xs text-[#5D0F17]/50 underline hover:text-[#5D0F17] transition"
 >
 Back to VYA
 </Link>
 </div>
 );
 }

 return (
 <form onSubmit={handleSubmit}>
 <div className="flex items-center justify-center gap-1.5 mb-10">
 <img src="/vya-logo.png" alt="VYA" className="h-7 w-auto" />
 </div>

 <p className="font-serif text-2xl text-[#5D0F17] text-center mb-2">
 Unsubscribe
 </p>
 {linkEmail ? (
 <p className="text-sm text-[#5D0F17]/50 text-center mb-8">
 {linkEmail}
 </p>
 ) : (
 <div className="mb-8">
  <label htmlFor="unsub-email" className="text-sm text-[#5D0F17] mb-2 block font-medium">
   Which email address?
  </label>
  <input
   id="unsub-email"
   type="email"
   required
   autoComplete="email"
   value={typedEmail}
   onChange={(e) => setTypedEmail(e.target.value)}
   placeholder="you@example.com"
   className="w-full rounded-lg border border-[#5D0F17]/20 bg-white px-3 py-2.5 text-sm text-[#5D0F17] outline-none focus:border-[#5D0F17]/60"
  />
 </div>
 )}

 <p className="text-sm text-[#5D0F17] mb-4 font-medium">
 Why are you unsubscribing?
 </p>

 <div className="space-y-2 mb-6">
 {REASONS.map((r) => (
 <label
 key={r}
 className={`flex items-center gap-3 px-4 py-3 border cursor-pointer transition ${
 reason === r
 ? "border-[#5D0F17] bg-[#5D0F17]/5"
 : "border-[#5D0F17]/20 hover:border-[#5D0F17]/50"
 }`}
 >
 <input
 type="radio"
 name="reason"
 value={r}
 checked={reason === r}
 onChange={() => setReason(r)}
 className="accent-[#5D0F17]"
 />
 <span className="text-sm text-[#5D0F17]">{r}</span>
 </label>
 ))}
 </div>

 {reason === "Other" && (
 <textarea
 value={detail}
 onChange={(e) => setDetail(e.target.value)}
 placeholder="Tell us more (optional)"
 rows={3}
 className="w-full border border-[#5D0F17]/20 px-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:border-[#5D0F17] focus:outline-none transition resize-none mb-6"
 />
 )}

 {error && (
 <p className="text-sm text-red-600 mb-4">{error}</p>
 )}

 <button
 type="submit"
 disabled={!reason || !email || loading}
 className="w-full bg-[#5D0F17] text-[#FFFDF8] py-3.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition disabled:opacity-40 disabled:cursor-not-allowed"
 >
 {loading ? "Unsubscribing..." : "Confirm Unsubscribe"}
 </button>

 <p className="text-center text-xs text-[#5D0F17]/40 mt-6">
 Your account stays active. You can still browse and shop VYA.
 </p>
 </form>
 );
}

export default function UnsubscribePage() {
 return (
 <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center px-4">
 <div className="bg-white w-full max-w-[480px] px-10 py-12">
 <Suspense fallback={null}>
 <UnsubscribeForm />
 </Suspense>
 </div>
 </div>
 );
}
