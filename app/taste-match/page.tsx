"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { generateUserId } from "@/app/lib/taste-scoring";

function TasteMatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referrerId = searchParams.get("ref");

  useEffect(() => {
    // Check for existing user
    const existingUserId = localStorage.getItem("via_taste_user_id");

    if (existingUserId) {
      // Check if they've completed the quiz
      fetch(`/api/taste-match/profile/${existingUserId}`)
        .then((res) => {
          if (res.ok) {
            // Already completed, go to results
            router.push(`/taste-match/${existingUserId}`);
          }
        })
        .catch(() => {
          // No profile yet, stay on landing
        });
    }
  }, [router]);

  const handleStartQuiz = async () => {
    let userId = localStorage.getItem("via_taste_user_id");

    if (!userId) {
      userId = generateUserId();
      localStorage.setItem("via_taste_user_id", userId);
    }

    // Create user with optional referrer
    try {
      await fetch("/api/taste-match/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          referrerId: referrerId || null,
        }),
      });
    } catch (error) {
      console.error("Failed to create user:", error);
    }

    router.push("/taste-match/quiz");
  };

  return (
    <main className="min-h-screen bg-[#f7f6f3]">
      {/* Hero Section */}
      <section className="min-h-[80vh] flex items-center justify-center px-6 py-20">
        <div className="max-w-xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            VIA Taste Match
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif mb-6 text-black leading-tight">
            Discover Your
            <br />
            Fashion Taste
          </h1>

          <p className="text-gray-600 mb-10 max-w-md mx-auto">
            Take our 5-question quiz to uncover your unique style profile.
            Share with friends to see how your tastes compare.
          </p>

          <button
            onClick={handleStartQuiz}
            className="bg-black text-white px-10 py-4 text-sm uppercase tracking-wide hover:bg-neutral-800 transition"
          >
            Take the Quiz
          </button>

          {referrerId && (
            <p className="mt-6 text-sm text-gray-500">
              Invited by a friend? Complete the quiz to help them unlock Taste
              Matches!
            </p>
          )}
        </div>
      </section>

      {/* How it Works */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-serif text-center mb-12">
            How it Works
          </h2>

          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center mx-auto mb-4 text-xl font-serif">
                1
              </div>
              <h3 className="font-serif text-lg mb-2">Take the Quiz</h3>
              <p className="text-sm text-gray-600">
                Answer 5 quick questions about your style preferences
              </p>
            </div>

            <div>
              <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center mx-auto mb-4 text-xl font-serif">
                2
              </div>
              <h3 className="font-serif text-lg mb-2">Get Your Profile</h3>
              <p className="text-sm text-gray-600">
                Discover your taste breakdown with shareable results
              </p>
            </div>

            <div>
              <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center mx-auto mb-4 text-xl font-serif">
                3
              </div>
              <h3 className="font-serif text-lg mb-2">Unlock Matches</h3>
              <p className="text-sm text-gray-600">
                Invite 2 friends to see how your tastes compare
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Taste Tags Preview */}
      <section className="bg-neutral-100 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            The 5 Taste Profiles
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {[
              { label: "Paris Archive", color: "#C9A87C" },
              { label: "NYC Street", color: "#8B8B8B" },
              { label: "Minimal Core", color: "#1A1A1A" },
              { label: "Designer Vintage", color: "#722F37" },
              { label: "Deal Hunter", color: "#2D5A27" },
            ].map((tag) => (
              <span
                key={tag.label}
                className="px-4 py-2 rounded-full text-sm text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.label}
              </span>
            ))}
          </div>

          <p className="text-gray-600 max-w-md mx-auto">
            Everyone has a unique blend. Find out which styles define your taste.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black text-white py-16 px-6">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-serif mb-6">
            Ready to discover your taste?
          </h2>
          <button
            onClick={handleStartQuiz}
            className="bg-white text-black px-10 py-4 text-sm uppercase tracking-wide hover:bg-neutral-200 transition"
          >
            Start Quiz
          </button>
        </div>
      </section>
    </main>
  );
}

export default function TasteMatchPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </main>
      }
    >
      <TasteMatchContent />
    </Suspense>
  );
}
