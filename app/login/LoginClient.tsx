"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function useIsInAppBrowser() {
 const [isInApp, setIsInApp] = useState(false);
 useEffect(() => {
 const ua = navigator.userAgent;
 setIsInApp(/Instagram|FBAN|FBAV|Twitter|Threads|TikTok|BytedanceWebview|musical_ly|LinkedIn|Snapchat/i.test(ua));
 }, []);
 return isInApp;
}

export default function LoginClient() {
 const [mode, setMode] = useState<"entry" | "signin">("entry");
 const [email, setEmail] = useState("");
 const [loading, setLoading] = useState(false);
 const [sent, setSent] = useState(false);
 const searchParams = useSearchParams();
 // Where to land after signing in. On the seller OS host (getvya.ai) default to the workspace
 // (/admin) — its layout then routes to onboarding or the dashboard. On the marketplace
 // (vyaplatform.com) default to home. An explicit ?callbackUrl always wins.
 const [next, setNext] = useState("/");
 useEffect(() => {
  const raw = searchParams.get("callbackUrl");
  const isOsHost = /(^|\.)getvya\.ai$/i.test(window.location.hostname);
  setNext(raw || (isOsHost ? "/admin" : "/"));
 }, [searchParams]);
 const isInApp = useIsInAppBrowser();

 async function handleEmailSignIn(e: React.FormEvent) {
 e.preventDefault();
 if (!email.trim()) return;
 setLoading(true);
 await signIn("resend", { email, callbackUrl: next, redirect: false });
 setSent(true);
 setLoading(false);
 }

 return (
 <div className="fixed inset-0 z-[200] bg-[#5D0F17] flex flex-col items-center justify-center px-4">
 {/* Modal card */}
 <div className="bg-white w-full max-w-[520px] px-10 py-12 sm:px-14 sm:py-14">

 {/* Logo */}
 <div className="flex items-center justify-center gap-1.5 mb-8">
 <img src="/vya-logo.png" alt="VYA" className="h-7 w-auto" />
 <span className="text-[9px] uppercase tracking-[0.15em] text-[#5D0F17]/60 font-sans">pilot</span>
 </div>

 {mode === "entry" && (
 <>
 <p className="text-sm text-[#5D0F17]/60 text-center mb-3 leading-relaxed">
 The first online department store for vintage and secondhand.
 </p>
 <p className="text-sm text-[#5D0F17]/60 text-center mb-8 leading-relaxed">
 Our pilot allows users to browse, shop, and give feedback to improve the platform.
 Discover the best vintage and secondhand stores, all in one place.
 Sign in or create an account to be added to our waitlist.
 </p>

 <div className="space-y-3">
 <Link
 href={next !== "/" ? `/register?callbackUrl=${encodeURIComponent(next)}` : "/register"}
 className="w-full flex items-center justify-center bg-[#5D0F17] text-[#FFFDF8] py-3.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition"
 >
 Create Account
 </Link>

 <div className="flex items-center gap-4 py-1">
 <div className="flex-1 h-px bg-[#5D0F17]/10" />
 <span className="text-xs text-[#5D0F17]/40">or</span>
 <div className="flex-1 h-px bg-[#5D0F17]/10" />
 </div>

 <button
 onClick={() => setMode("signin")}
 className="w-full flex items-center justify-center border border-[#5D0F17]/25 text-[#5D0F17] py-3.5 text-xs uppercase tracking-[0.15em] hover:border-[#5D0F17] transition"
 >
 Sign In
 </button>
 </div>

 <div className="flex justify-center flex-wrap gap-5 mt-10">
 <Link href="/terms" className="text-xs text-[#5D0F17]/40 underline hover:no-underline">Terms</Link>
 <Link href="/privacy" className="text-xs text-[#5D0F17]/40 underline hover:no-underline">Privacy</Link>
 <Link href="/for-stores" className="text-xs text-[#5D0F17]/40 underline hover:no-underline">Partner with VYA</Link>
 <a href="https://www.instagram.com/vyaplatform" target="_blank" rel="noopener noreferrer" className="text-xs text-[#5D0F17]/40 underline hover:no-underline">Instagram</a>
 <a href="https://www.tiktok.com/@vyaplatform" target="_blank" rel="noopener noreferrer" className="text-xs text-[#5D0F17]/40 underline hover:no-underline">TikTok</a>
 <a href="https://vyaplatform.substack.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-[#5D0F17]/40 underline hover:no-underline">Substack</a>
 </div>
 </>
 )}

 {mode === "signin" && !sent && (
 <>
 <button
 onClick={() => setMode("entry")}
 className="text-xs text-[#5D0F17]/40 hover:text-[#5D0F17] transition mb-6 block"
 >
 ← Back
 </button>

 <h1 className="font-serif text-3xl text-[#5D0F17] text-center mb-2">
 Sign in
 </h1>
 <p className="text-sm text-[#5D0F17]/50 text-center mb-8">
 Welcome back.
 </p>

 {isInApp ? (
 <div className="w-full border border-[#5D0F17]/15 bg-[#FFFDF8]/60 px-4 py-3.5 text-center mb-5">
 <p className="text-xs text-[#5D0F17]/70 leading-relaxed">
 Google sign-in isn&apos;t available inside apps like Instagram or Threads.
 </p>
 <p className="text-xs text-[#5D0F17]/50 mt-1">
 Open this page in Safari or Chrome, or use the email link below.
 </p>
 </div>
 ) : (
 <button
 onClick={() => signIn("google", { callbackUrl: next })}
 className="w-full flex items-center justify-center gap-3 border border-[#5D0F17]/20 py-3 text-sm text-[#5D0F17] hover:border-[#5D0F17] transition mb-5"
 >
 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
 <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
 <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
 <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
 <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
 </svg>
 Continue with Google
 </button>
 )}

 <div className="flex items-center gap-4 mb-5">
 <div className="flex-1 h-px bg-[#5D0F17]/10" />
 <span className="text-xs text-[#5D0F17]/30">or</span>
 <div className="flex-1 h-px bg-[#5D0F17]/10" />
 </div>

 <form onSubmit={handleEmailSignIn} className="space-y-3">
 <input
 type="email"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder="Email address"
 required
 className="w-full border border-[#5D0F17]/20 px-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:border-[#5D0F17] focus:outline-none transition"
 />
 <button
 type="submit"
 disabled={loading || !email.trim()}
 className="w-full bg-[#5D0F17] text-[#FFFDF8] py-3.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition disabled:opacity-50"
 >
 {loading ? "Sending..." : "Send Sign-in Link"}
 </button>
 </form>

 <p className="text-center text-xs text-[#5D0F17]/40 mt-6">
 Don&apos;t have an account?{" "}
 <Link href="/register" className="underline text-[#5D0F17]/60">Create one</Link>
 </p>
 </>
 )}

 {mode === "signin" && sent && (
 <div className="text-center py-4">
 <h1 className="font-serif text-2xl text-[#5D0F17] mb-4">Check your email</h1>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">
 We sent a sign-in link to <strong>{email}</strong>.
 <br />Click it to sign in to VYA.
 </p>
 </div>
 )}
 </div>
 </div>
 );
}
