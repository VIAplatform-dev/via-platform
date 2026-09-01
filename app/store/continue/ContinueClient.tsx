"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { destinationAfterAuth, loginHref, safeNext, STORE_LOGIN } from "@/app/store/auth-route";

// The one hop every seller sign-in lands on.
//
// NextAuth needs a single fixed callbackUrl per provider, but where a seller belongs depends on
// something only the server knows — whether this email already has a store. So every provider comes
// here, this asks once, and sends them on: the wizard if they're new, their workspace if they're not.

export default function ContinueClient() {
 const next = safeNext(useSearchParams().get("next"));
 const [stuck, setStuck] = useState(false);

 useEffect(() => {
  let cancelled = false;
  // retryOn401: the session cookie is occasionally not readable on the first request after a
  // provider callback. Retrying beats telling a seller who just signed in that she isn't.
  destinationAfterAuth(next, true)
   .then((dest) => {
    if (cancelled) return;
    if (dest === STORE_LOGIN) { setStuck(true); return; }
    window.location.replace(dest);
   })
   .catch(() => { if (!cancelled) setStuck(true); });
  return () => { cancelled = true; };
 }, [next]);

 return (
  <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFDF8" }}>
   <div className="text-center px-6">
    {stuck ? (
     <>
      <p className="text-sm mb-3" style={{ color: "#5D0F17" }}>That sign-in link has expired or already been used.</p>
      <a href={loginHref(next)} className="text-sm underline" style={{ color: "#5D0F17" }}>Sign in again</a>
     </>
    ) : (
     <p className="text-sm" style={{ color: "rgba(93,15,23,0.55)" }}>Signing you in…</p>
    )}
   </div>
  </main>
 );
}
