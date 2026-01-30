"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
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
    <div className="fixed inset-0 z-[100] bg-black text-white overflow-y-auto">
      <div className="min-h-full flex flex-col justify-between px-6 sm:px-16 py-10 sm:py-16">
        {/* Main Content - vertically centered */}
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-xl text-left">
            {/* Coming Soon */}
            <p className="text-[12px] sm:text-[17px] font-semibold uppercase tracking-[0.3rem] sm:tracking-[0.5rem] mb-6 sm:mb-8">
              Coming Soon
            </p>

            {/* VIA Logo */}
            <Image
              src="/via-logo-white.png"
              alt="VIA"
              width={990}
              height={492}
              className="w-[160px] sm:w-[240px] h-auto mb-6 sm:mb-8"
              priority
            />

            {/* Body Text */}
            <p className="text-[15px] sm:text-[17px] leading-[1.9] sm:leading-[2] font-light tracking-normal sm:tracking-wide mb-10 sm:mb-12">
              VIA lets you shop independent resale and vintage stores across the
              country, all in one place. Browse multiple stores at once and
              discover unique pieces you won&apos;t find anywhere else.
            </p>

            {/* Email Form */}
            {status === "success" ? (
              <div className="animate-[fadeIn_0.4s_ease-out]">
                <div className="w-12 h-12 sm:w-14 sm:h-14 mb-4 sm:mb-5 rounded-full border border-neutral-700 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 sm:w-7 sm:h-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-white text-base sm:text-lg font-serif mb-2">
                  {message}
                </p>
                <p className="text-neutral-500 text-sm tracking-wide font-light">
                  We&apos;ll let you know when VIA launches.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    placeholder="Enter your email"
                    required
                    className="w-full sm:flex-1 px-5 h-12 sm:h-14 bg-transparent border border-neutral-700 text-white placeholder-neutral-600 text-[14px] sm:text-[15px] tracking-wide outline-none focus:border-neutral-400 transition-colors font-light"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading" || !email.trim()}
                    className="h-12 sm:h-14 px-6 sm:px-7 bg-white text-black text-[11px] sm:text-[12px] uppercase tracking-[0.25rem] sm:tracking-[0.4rem] font-semibold rounded-full hover:scale-[1.04] transition-transform disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {status === "loading" ? "Joining..." : "Join the wait"}
                  </button>
                </div>

                {status === "error" && message && (
                  <p className="text-red-400 text-sm mt-3 sm:mt-4 tracking-wide">
                    {message}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-10 sm:pt-16">
          <div className="max-w-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 text-neutral-600 text-[10px] sm:text-[11px] tracking-wider">
            <div className="flex items-center gap-5 sm:gap-6">
              <Link
                href="/terms"
                className="hover:text-neutral-400 transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-neutral-400 transition-colors"
              >
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
    </div>
  );
}
