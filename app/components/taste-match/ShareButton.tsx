"use client";

import { useState } from "react";

interface ShareButtonProps {
  userId: string;
  onShareStart?: () => void;
  onShareEnd?: () => void;
  onShareComplete?: () => void;
}

export default function ShareButton({ userId, onShareStart, onShareEnd, onShareComplete }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://theviaplatform.com/taste-match?ref=${userId}`;
  const shareText = `I just discovered my VIA taste! Take the quiz and see yours: ${shareUrl}`;

  const handleShare = async () => {
    onShareStart?.();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "VIA Taste Match",
          text: "I just discovered my VIA taste! Take the quiz and see yours:",
          url: shareUrl,
        });
        onShareComplete?.();
        onShareEnd?.();
        return;
      } catch {
        // User cancelled share — don't count it
        onShareEnd?.();
        return;
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShareComplete?.();
    } catch {
      console.error("Failed to copy to clipboard");
    }
    onShareEnd?.();
  };

  return (
    <button
      onClick={handleShare}
      className="w-full bg-black text-white py-4 px-6 text-sm uppercase tracking-wide hover:bg-neutral-800 transition flex items-center justify-center gap-2"
    >
      {copied ? (
        <>
          <CheckIcon />
          Link Copied!
        </>
      ) : (
        <>
          <ShareIcon />
          Share Your Taste
        </>
      )}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
