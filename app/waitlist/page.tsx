"use client";

import { useState } from "react";
import Link from "next/link";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "waitlist" }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message);
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-xl w-full text-center">
          {/* Logo */}
          <h1 className="text-5xl sm:text-7xl font-serif tracking-wide mb-8">
            VIA
          </h1>

          {/* Tagline */}
          <p className="text-neutral-400 text-base sm:text-lg leading-relaxed mb-4 max-w-md mx-auto">
            Shop independent resale and vintage stores from across the country, all in one place.
          </p>

          <p className="text-neutral-500 text-sm leading-relaxed mb-12 max-w-sm mx-auto">
            Browse multiple stores at once and discover unique pieces you won&apos;t find anywhere else.
          </p>

          {/* Email Form */}
          {status === "success" ? (
            <div className="animate-[fadeIn_0.4s_ease-out]">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-neutral-700 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white text-lg font-serif mb-2">{message}</p>
              <p className="text-neutral-500 text-sm">
                We&apos;ll let you know when VIA launches.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="max-w-sm mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder="Enter your email"
                  required
                  className="flex-1 px-5 py-4 bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 text-sm outline-none focus:border-neutral-600 transition-colors"
                />
                <button
                  type="submit"
                  disabled={status === "loading" || !email.trim()}
                  className="px-8 py-4 bg-white text-black text-sm uppercase tracking-wide hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {status === "loading" ? "Joining..." : "Join Waitlist"}
                </button>
              </div>

              {status === "error" && message && (
                <p className="text-red-400 text-sm mt-3">{message}</p>
              )}
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8">
        <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-neutral-600 text-xs">
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-neutral-400 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-neutral-400 transition-colors">
              Privacy
            </Link>
            <a
              href="https://www.instagram.com/theviaplatform/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-400 transition-colors"
            >
              Instagram
            </a>
          </div>
          <Link
            href="/admin/login?redirect=/"
            className="hover:text-neutral-400 transition-colors"
          >
            Staff Access
          </Link>
        </div>
      </footer>
    </div>
  );
}
