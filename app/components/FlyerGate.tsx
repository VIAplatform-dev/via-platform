"use client";

import { useState } from "react";

// The box that will not go away.
//
// It sits over the real homepage rather than replacing it, because the glimpse IS the offer: a
// stranger who just read "I have proof." on a lamppost should see actual Fendi baguettes behind
// this, not a marketing page about them.
//
// On success it follows a sign-in link the server mints on the spot. That hop is not optional:
// proxy.ts gates PAGES on an Auth.js session first and the approval cookie second, so the cookie
// alone would open the API and still bounce them to /login on their first tap. One redirect, no
// email, no password — and they come out the other side signed in and approved.

export default function FlyerGate({ slug, headline, subhead }: { slug: string; headline: string; subhead: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/flyer-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, slug }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Try again.");
        return;
      }
      setDone(true);
      // Follow the sign-in link the server just minted. It creates the session (the approval
      // cookie alone opens the API but not the pages), then lands them on the site proper.
      // A hard assignment, not router.push: this hop goes through Auth.js, not the App Router.
      setTimeout(() => { window.location.href = data?.next ?? "/"; }, 900);
    } catch {
      setError("Couldn’t reach us. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
      // No dismiss: no close button, no click-outside, no escape. This is the trade for skipping
      // the waitlist, and a gate that can be dismissed is a gate nobody fills in.
      role="dialog"
      aria-modal="true"
      aria-label="Skip the waitlist"
    >
      <div className="w-full sm:max-w-md bg-[#FFFDF8] rounded-t-3xl sm:rounded-2xl px-6 py-8 sm:px-8">
        {done ? (
          <>
            <h2 className="font-serif text-2xl text-[#5D0F17]">You’re in.</h2>
            <p className="mt-2 text-sm text-[#5D0F17]/70">Opening the site…</p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-2xl leading-tight text-[#5D0F17]">{headline}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5D0F17]/70">{subhead}</p>

            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              placeholder="you@email.com"
              className="mt-6 w-full rounded-xl border border-[#5D0F17]/15 bg-white px-4 py-3.5 text-[16px] text-[#5D0F17] outline-none focus:border-[#5D0F17]/40"
            />

            {error ? <p className="mt-2 text-sm text-[#5D0F17]">{error}</p> : null}

            <button
              onClick={() => void submit()}
              disabled={busy || !email.trim()}
              className="mt-3 w-full rounded-xl bg-[#5D0F17] px-4 py-3.5 text-xs uppercase tracking-[0.12em] text-[#FFFDF8] disabled:opacity-50"
            >
              {busy ? "One moment…" : "Skip the waitlist"}
            </button>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-[#5D0F17]/45">
              No password. You’ll be browsing in a second.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
