"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getBaseUrl } from "@/app/lib/base-url";
import { acquisitionSource } from "@/app/lib/capturedSource";

interface GiveawayModalProps {
  isOpen: boolean;
  onClose: () => void;
  refCode?: string | null;
}

type Screen = "entry" | "invite" | "confirmation";

interface StatusData {
  referralCount: number;
  friend1Entered: boolean;
  friend2Entered: boolean;
  isComplete: boolean;
}

export default function GiveawayModal({ isOpen, onClose, refCode }: GiveawayModalProps) {
  const [screen, setScreen] = useState<Screen>("entry");
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [emailError, setEmailError] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");

  // Animate modal entrance
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setShowModal(true));
    } else {
      setShowModal(false);
    }
  }, [isOpen]);

  // Check for returning user
  useEffect(() => {
    if (!isOpen) return;

    const storedCode = localStorage.getItem("via_giveaway_code");
    const storedEmail = localStorage.getItem("via_giveaway_email");

    if (storedCode && storedEmail) {
      setReferralCode(storedCode);
      setEmail(storedEmail);
      const baseUrl = getBaseUrl();
      setReferralLink(`${baseUrl}/waitlist?ref=${storedCode}`);

      // Fetch current status
      fetch(`/api/giveaway/status/${storedCode}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) {
            setStatus(data);
          }
        })
        .catch(() => {});

      setScreen("confirmation");
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setShowModal(false);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) handleClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  // Scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Poll for status updates on confirmation screen
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (screen !== "confirmation" || !referralCode || !isOpen) return;

    const poll = () => {
      fetch(`/api/giveaway/status/${referralCode}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) setStatus(data);
        })
        .catch(() => {});
    };

    pollRef.current = setInterval(poll, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [screen, referralCode, isOpen]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    if (!email || !email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Add to waitlist table
      try {
        await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), source: acquisitionSource("giveaway_modal") }),
        });
      } catch {
        // Non-blocking — continue to giveaway entry
      }

      const res = await fetch("/api/giveaway/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), refCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || "Something went wrong. Try again.");
        return;
      }

      setReferralCode(data.referralCode);
      setReferralLink(data.referralLink);

      // Persist to localStorage
      localStorage.setItem("via_giveaway_entered", "true");
      localStorage.setItem("via_giveaway_code", data.referralCode);
      localStorage.setItem("via_giveaway_email", email.trim().toLowerCase());

      setScreen("invite");
    } catch {
      setEmailError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendInvites = async () => {
    // Record phone numbers for analytics
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
    setScreen("confirmation");
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
      // Fallback: select text
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out ${
          showModal ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-[#f7f6f3] rounded-lg shadow-2xl transition-all duration-300 ease-out ${
          showModal ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-500 hover:text-black transition"
          aria-label="Close modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Screen 1: Entry */}
        {screen === "entry" && (
          <div className="p-8 sm:p-12 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
              VYA Giveaway
            </p>

            <h2 className="text-3xl sm:text-4xl font-serif mb-4 text-black leading-tight">
              Help Build VYA.<br />
              Enter to Win a $1,000<br />
              Shopping Spree on Us!
            </h2>

            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
              Enter our giveaway to win a $1,000 shopping spree on VYA!
            </p>

            {/* How It Works */}
            <div className="text-left max-w-xs mx-auto mb-8 space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 text-center mb-2">How It Works</p>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center mt-0.5">1</span>
                <p className="text-sm text-gray-700">Enter your email to get a unique referral link.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center mt-0.5">2</span>
                <p className="text-sm text-gray-700">Share your link with 2 friends and have them enter.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center mt-0.5">3</span>
                <p className="text-sm text-gray-700">Once both friends enter, you&apos;re officially in the giveaway.</p>
              </div>
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="Your email address"
                className="w-full px-4 py-3 border border-gray-300 bg-white text-black text-sm focus:outline-none focus:border-black transition"
                disabled={isSubmitting}
              />
              {emailError && (
                <p className="text-red-600 text-xs text-left">{emailError}</p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-black text-white py-4 text-sm uppercase tracking-wide hover:bg-neutral-800 transition disabled:opacity-50"
              >
                {isSubmitting ? "Entering..." : "Enter the Giveaway"}
              </button>
            </form>

            <p className="text-[10px] text-gray-400 mt-6 leading-relaxed">
              By entering, you agree to VYA&apos;s Terms &amp; Conditions. Winner will be selected at random from all completed entries. Giveaway credit must be used on items listed on VYA.
            </p>
          </div>
        )}

        {/* Screen 2: Invite */}
        {screen === "invite" && (
          <div className="p-8 sm:p-12 text-center">
            {pendingPhone ? (
              <>
                <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
                  Step 2 of 3
                </p>

                <h2 className="text-3xl sm:text-4xl font-serif mb-3 text-black leading-tight">
                  Now Send to<br />Friend 2
                </h2>

                <p className="text-gray-600 mb-8 max-w-sm mx-auto text-sm">
                  Tap below to open a message to your second friend.
                </p>

                <button
                  onClick={handleSendSecond}
                  className="w-full bg-black text-white py-4 text-sm uppercase tracking-wide hover:bg-neutral-800 transition"
                >
                  Send to Friend 2
                </button>

                <button
                  onClick={() => {
                    setPendingPhone("");
                    goToConfirmation();
                  }}
                  className="mt-3 text-sm text-gray-500 hover:text-black transition py-2"
                >
                  Skip for now
                </button>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
                  Step 2 of 3
                </p>

                <h2 className="text-3xl sm:text-4xl font-serif mb-3 text-black leading-tight">
                  Send VYA to<br />Two Friends
                </h2>

                <p className="text-gray-600 mb-8 max-w-sm mx-auto text-sm">
                  Enter their phone numbers to send a text invite, or copy your unique link to share however you&apos;d like.
                </p>

                {/* Phone inputs */}
                <div className="space-y-3 mb-6">
                  <input
                    type="tel"
                    value={phone1}
                    onChange={(e) => setPhone1(e.target.value)}
                    placeholder="Friend 1's phone number"
                    className="w-full px-4 py-3 border border-gray-300 bg-white text-black text-sm focus:outline-none focus:border-black transition"
                  />
                  <input
                    type="tel"
                    value={phone2}
                    onChange={(e) => setPhone2(e.target.value)}
                    placeholder="Friend 2's phone number"
                    className="w-full px-4 py-3 border border-gray-300 bg-white text-black text-sm focus:outline-none focus:border-black transition"
                  />
                </div>

                {/* Copy link */}
                <div className="mb-6">
                  <p className="text-xs text-gray-500 mb-2">Or copy your unique link</p>
                  <div className="flex items-center border border-gray-300 bg-white overflow-hidden">
                    <span className="flex-1 px-3 py-2.5 text-xs text-gray-600 truncate text-left">
                      {referralLink}
                    </span>
                    <button
                      onClick={handleCopyLink}
                      className="flex-shrink-0 px-4 py-2.5 bg-black text-white text-xs uppercase tracking-wide hover:bg-neutral-800 transition"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSendInvites}
                  className="w-full bg-black text-white py-4 text-sm uppercase tracking-wide hover:bg-neutral-800 transition"
                >
                  Send Invites
                </button>

                <button
                  onClick={() => goToConfirmation()}
                  className="mt-3 text-sm text-gray-500 hover:text-black transition py-2"
                >
                  Skip for now
                </button>
              </>
            )}
          </div>
        )}

        {/* Screen 3: Confirmation */}
        {screen === "confirmation" && (
          <div className="p-8 sm:p-12 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
              VYA Giveaway
            </p>

            <h2 className="text-3xl sm:text-4xl font-serif mb-3 text-black leading-tight">
              You&apos;re in the queue <span role="img" aria-label="heart">&#10084;&#65039;</span>
            </h2>

            <p className="text-gray-600 mb-8 max-w-sm mx-auto text-sm">
              {status?.isComplete
                ? "Both friends have entered. You're officially in the running!"
                : "Share your link with 2 friends to be officially entered."}
            </p>

            {/* Progress indicator */}
            <div className="mb-8">
              <p className="text-sm text-gray-500 mb-3">
                {status?.referralCount || 0} of 2 friends entered
              </p>
              <div className="flex items-center justify-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${
                    status && status.referralCount >= 1
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-300"
                  }`}
                >
                  {status && status.referralCount >= 1 ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm">1</span>
                  )}
                </div>
                <div className={`w-8 h-px ${status && status.referralCount >= 1 ? "bg-black" : "bg-gray-300"}`} />
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${
                    status && status.referralCount >= 2
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-300"
                  }`}
                >
                  {status && status.referralCount >= 2 ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm">2</span>
                  )}
                </div>
              </div>
            </div>

            {/* Copy link section */}
            {referralLink && (
              <div className="mb-8">
                <p className="text-xs text-gray-500 mb-2">Your unique referral link</p>
                <div className="flex items-center border border-gray-300 bg-white overflow-hidden">
                  <span className="flex-1 px-3 py-2.5 text-xs text-gray-600 truncate text-left">
                    {referralLink}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="flex-shrink-0 px-4 py-2.5 bg-black text-white text-xs uppercase tracking-wide hover:bg-neutral-800 transition"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full bg-black text-white py-4 text-sm uppercase tracking-wide hover:bg-neutral-800 transition"
            >
              Start Shopping
            </button>
          </div>
        )}
      </div>

      {/* Custom keyframes */}
      <style jsx>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
