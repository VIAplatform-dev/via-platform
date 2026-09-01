"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { destinationAfterAuth, loginHref, safeNext, STORE_LOGIN } from "@/app/store/auth-route";

// Sign-in and sign-up for SELLERS.
//
// They're the same two buttons with different words around them — a magic link or Google either
// finds the account or creates it — so this renders both, and `mode` only changes the copy. What
// actually differs is where the seller LANDS, and that isn't decided here: /store/continue asks the
// server whether this email already has a store.
//
// Deliberately not /login (the marketplace shopper sign-in, which talks about joining the pilot)
// and not /admin/login (the owner's password + TOTP panel). A seller who lands on either of those
// is looking at someone else's product and has no way to tell that's what went wrong.

const WINE = "#5D0F17";
const CREAM = "#FFFDF8";

const COPY = {
 login: {
  title: "Sign in to your store",
  sub: "Use the email your store is registered with. We'll take you straight back to your shop.",
  google: "Continue with Google",
  send: "Email me a sign-in link",
  swapText: "New to VYA?",
  swapLink: "Create your store",
 },
 signup: {
  title: "Create your store",
  sub: "Sign up with your email, and we'll set your shop up on the next screen.",
  google: "Sign up with Google",
  send: "Email me a link to start",
  swapText: "Already have a store?",
  swapLink: "Sign in",
 },
} as const;

export default function StoreAuthClient({ mode }: { mode: "login" | "signup" }) {
 const params = useSearchParams();
 const next = safeNext(params.get("next"));
 const t = COPY[mode];

 const [email, setEmail] = useState("");
 const [sending, setSending] = useState(false);
 const [sent, setSent] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 // Nothing renders until we know whether they're already signed in. A seller who has a store must
 // never see a sign-in form she doesn't need, not even for one frame — that flash is exactly what
 // "it keeps asking me to log in when I'm already logged in" looks like from her side.
 const [checking, setChecking] = useState(true);

 useEffect(() => {
  let cancelled = false;
  destinationAfterAuth(next)
   .then((dest) => {
    if (cancelled) return;
    if (dest === STORE_LOGIN) { setChecking(false); return; }
    window.location.replace(dest);
   })
   .catch(() => { if (!cancelled) setChecking(false); });
  return () => { cancelled = true; };
 }, [next]);

 // Every provider comes back to the same hop, which is the only place that decides between the
 // wizard and the workspace. NextAuth needs one fixed callback URL, and this is it.
 const callbackUrl = `/store/continue${next ? `?next=${encodeURIComponent(next)}` : ""}`;

 async function sendLink(e: React.FormEvent) {
  e.preventDefault();
  const addr = email.trim();
  if (!addr || sending) return;
  setSending(true);
  setError(null);
  try {
   const res = await signIn("resend", { email: addr, callbackUrl, redirect: false });
   if (res?.error) throw new Error(res.error);
   setSent(addr);
  } catch {
   setError("We couldn't send that link. Check the address and try again.");
  } finally {
   setSending(false);
  }
 }

 if (checking) {
  return (
   <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
    <p className="text-sm" style={{ color: "rgba(93,15,23,0.55)" }}>Loading…</p>
   </main>
  );
 }

 return (
  <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
   <div className="w-full max-w-md px-6 py-12">
    <div className="bg-white p-10 shadow-sm">
     <div className="text-center mb-8">
      <Image src="/vya-logo.png" alt="VYA" width={72} height={72} className="mx-auto mb-6" style={{ objectFit: "contain" }} />
      <h1 className="text-2xl font-serif mb-2" style={{ color: WINE }}>{t.title}</h1>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(93,15,23,0.6)" }}>{t.sub}</p>
     </div>

     {sent ? (
      <div className="text-center">
       <p className="text-sm mb-2" style={{ color: WINE }}>
        Check <strong>{sent}</strong> for a link to sign in. It expires in 24 hours.
       </p>
       <button
        onClick={() => { setSent(null); setEmail(""); }}
        className="text-xs underline mt-3"
        style={{ color: "rgba(93,15,23,0.6)" }}
       >
        Use a different email
       </button>
      </div>
     ) : (
      <>
       <button
        onClick={() => signIn("google", { callbackUrl })}
        className="w-full py-3 text-sm uppercase tracking-wide transition-opacity hover:opacity-90"
        style={{ backgroundColor: WINE, color: CREAM }}
       >
        {t.google}
       </button>

       <div className="flex items-center gap-4 my-5">
        <div className="flex-1 h-px" style={{ backgroundColor: "rgba(93,15,23,0.2)" }} />
        <span className="text-xs uppercase tracking-wide" style={{ color: "rgba(93,15,23,0.4)" }}>or</span>
        <div className="flex-1 h-px" style={{ backgroundColor: "rgba(93,15,23,0.2)" }} />
       </div>

       <form onSubmit={sendLink}>
        <input
         type="email"
         value={email}
         onChange={(e) => setEmail(e.target.value)}
         placeholder="you@yourstore.com"
         required
         autoComplete="email"
         className="w-full border px-4 py-3 text-sm outline-none mb-3"
         style={{ borderColor: "rgba(93,15,23,0.3)", color: WINE }}
        />
        <button
         type="submit"
         disabled={sending}
         className="w-full py-3 text-sm uppercase tracking-wide border transition-opacity disabled:opacity-50"
         style={{ borderColor: WINE, color: WINE }}
        >
         {sending ? "Sending…" : t.send}
        </button>
       </form>

       {error ? <p className="text-xs mt-3 text-center" style={{ color: WINE }}>{error}</p> : null}
      </>
     )}
    </div>

    <p className="text-center text-sm mt-6" style={{ color: "rgba(93,15,23,0.6)" }}>
     {t.swapText}{" "}
     <Link href={loginHref(next, mode === "login" ? "signup" : "login")} className="underline" style={{ color: WINE }}>
      {t.swapLink}
     </Link>
    </p>
   </div>
  </main>
 );
}
