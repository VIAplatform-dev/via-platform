"use client";

import { useState } from "react";

type NewsletterSignupProps = {
  variant?: "default" | "hero" | "footer";
  title?: string;
  description?: string;
};

export default function NewsletterSignup({
  variant = "default",
  title = "Stay in the loop",
  description = "Get notified about new stores, rare finds, and exclusive drops.",
}: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setStatus("error");
      setMessage("Please enter your email.");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage(data.message || "You're on the list!");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  // Hero variant - larger, more prominent
  if (variant === "hero") {
    return (
      <div className="w-full">
        {status === "success" ? (
          <div className="text-center py-4">
            <p className="text-lg text-green-600 font-medium">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="Enter your email"
                className="flex-1 px-4 py-3.5 bg-white/10 border border-white/30 text-white placeholder:text-white/60 focus:outline-none focus:border-white transition min-h-[48px]"
                disabled={status === "loading"}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-8 py-3.5 bg-white text-black text-sm uppercase tracking-wide hover:bg-neutral-200 transition disabled:opacity-50 min-h-[48px]"
              >
                {status === "loading" ? "Joining..." : "Get Updates"}
              </button>
            </div>
            {status === "error" && (
              <p className="mt-2 text-red-400 text-sm">{message}</p>
            )}
          </form>
        )}
      </div>
    );
  }

  // Footer variant - compact, inline
  if (variant === "footer") {
    return (
      <div className="w-full">
        <h4 className="text-sm uppercase tracking-wide mb-4">{title}</h4>
        {status === "success" ? (
          <p className="text-sm text-neutral-400">{message}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="Your email"
                className="flex-1 px-4 py-2.5 bg-transparent border border-neutral-700 text-white placeholder:text-neutral-500 text-sm focus:outline-none focus:border-white transition min-h-[44px]"
                disabled={status === "loading"}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-5 py-2.5 border border-white text-white text-xs uppercase tracking-wide hover:bg-white hover:text-black transition disabled:opacity-50 min-h-[44px]"
              >
                {status === "loading" ? "..." : "Join"}
              </button>
            </div>
            {status === "error" && (
              <p className="mt-2 text-red-400 text-xs">{message}</p>
            )}
          </form>
        )}
      </div>
    );
  }

  // Default variant - centered section
  return (
    <div className="max-w-md mx-auto text-center">
      <h3 className="text-2xl sm:text-3xl font-serif mb-3">{title}</h3>
      <p className="text-neutral-600 text-sm sm:text-base mb-6">{description}</p>

      {status === "success" ? (
        <div className="py-4 px-6 bg-green-50 border border-green-200">
          <p className="text-green-800">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="Enter your email"
              className="flex-1 px-4 py-3 border border-neutral-300 focus:border-black focus:outline-none transition min-h-[48px]"
              disabled={status === "loading"}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="px-6 py-3 bg-black text-white text-sm uppercase tracking-wide hover:bg-neutral-800 transition disabled:opacity-50 min-h-[48px]"
            >
              {status === "loading" ? "Joining..." : "Join Waitlist"}
            </button>
          </div>
          {status === "error" && (
            <p className="mt-2 text-red-600 text-sm text-left">{message}</p>
          )}
        </form>
      )}
    </div>
  );
}
