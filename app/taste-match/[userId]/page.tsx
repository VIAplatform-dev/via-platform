"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TasteCard from "@/app/components/taste-match/TasteCard";
import ShareButton from "@/app/components/taste-match/ShareButton";
import ReferralProgress from "@/app/components/taste-match/ReferralProgress";
import UnlockCelebration from "@/app/components/taste-match/UnlockCelebration";
import type { TasteProfile } from "@/app/lib/taste-types";

interface ResultsPageProps {
  params: Promise<{ userId: string }>;
}

function getShareCount(userId: string): number {
  const stored = localStorage.getItem(`via_taste_shares_${userId}`);
  return stored ? parseInt(stored, 10) : 0;
}

function incrementShareCount(userId: string): number {
  const current = getShareCount(userId);
  const next = current + 1;
  localStorage.setItem(`via_taste_shares_${userId}`, String(next));
  if (next >= 2) {
    localStorage.setItem(`via_taste_unlocked_${userId}`, "true");
  }
  return next;
}

function checkUnlocked(userId: string): boolean {
  return localStorage.getItem(`via_taste_unlocked_${userId}`) === "true";
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { userId } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [shareCount, setShareCount] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const storedUserId = localStorage.getItem("via_taste_user_id");
        const ownProfile = storedUserId === userId;
        setIsOwnProfile(ownProfile);

        if (ownProfile) {
          setShareCount(getShareCount(userId));
          setIsUnlocked(checkUnlocked(userId));
        }

        // Try to fetch profile from API first
        let profileData = null;
        try {
          const profileRes = await fetch(`/api/taste-match/profile/${userId}`);
          if (profileRes.ok) {
            const data = await profileRes.json();
            profileData = data.profile;
          }
        } catch {
          console.warn("API unavailable, checking localStorage");
        }

        // Fallback to localStorage
        if (!profileData) {
          const storedProfile = localStorage.getItem(`via_taste_profile_${userId}`);
          if (storedProfile) {
            profileData = JSON.parse(storedProfile);
          }
        }

        if (!profileData) {
          if (storedUserId === userId) {
            router.push("/taste-match/quiz");
          } else {
            router.push("/taste-match");
          }
          return;
        }

        setProfile(profileData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, router]);

  const handleShareComplete = () => {
    const newCount = incrementShareCount(userId);
    setShareCount(newCount);
    if (newCount >= 2 && !isUnlocked) {
      setIsUnlocked(true);
      setJustUnlocked(true);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
        <p className="text-gray-500">Loading your taste...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Profile not found</p>
          <Link
            href="/taste-match"
            className="text-black underline hover:no-underline"
          >
            Take the quiz
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f3]">
      <div className="max-w-lg mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
            {isOwnProfile ? "Your" : "Their"} Taste Profile
          </p>
          <h1 className="text-3xl font-serif">VIA Taste Match</h1>
        </div>

        {/* Own profile - Locked */}
        {isOwnProfile && !isUnlocked && (
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-black/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            <h2 className="text-2xl sm:text-3xl font-serif mb-3 text-black">
              Share with 2 friends
              <br />
              to unlock your results
            </h2>

            <p className="text-gray-500 text-sm mb-8 max-w-xs mx-auto">
              Tap the button below to share, then come back to see your full taste profile.
            </p>

            <div className="mb-8">
              <ReferralProgress
                completedCount={shareCount}
                isUnlocked={false}
              />
            </div>

            <ShareButton
              userId={userId}
              onShareComplete={handleShareComplete}
            />
          </div>
        )}

        {/* Own profile - Unlocked */}
        {isOwnProfile && isUnlocked && (
          <>
            <div className="mb-8">
              {justUnlocked ? (
                <UnlockCelebration>
                  <TasteCard
                    primaryTag={profile.primaryTag}
                    primaryPercentage={profile.primaryPercentage}
                    secondaryTag={profile.secondaryTag}
                    secondaryPercentage={profile.secondaryPercentage}
                    tertiaryTag={profile.tertiaryTag}
                    tertiaryPercentage={profile.tertiaryPercentage}
                  />
                </UnlockCelebration>
              ) : (
                <TasteCard
                  primaryTag={profile.primaryTag}
                  primaryPercentage={profile.primaryPercentage}
                  secondaryTag={profile.secondaryTag}
                  secondaryPercentage={profile.secondaryPercentage}
                  tertiaryTag={profile.tertiaryTag}
                  tertiaryPercentage={profile.tertiaryPercentage}
                />
              )}
            </div>

            <div className="mb-8">
              <ShareButton userId={userId} />
            </div>
          </>
        )}

        {/* Visitor viewing someone else's profile */}
        {!isOwnProfile && (
          <div className="mb-8">
            <TasteCard
              primaryTag={profile.primaryTag}
              primaryPercentage={profile.primaryPercentage}
              secondaryTag={profile.secondaryTag}
              secondaryPercentage={profile.secondaryPercentage}
              tertiaryTag={profile.tertiaryTag}
              tertiaryPercentage={profile.tertiaryPercentage}
            />
          </div>
        )}

        {/* Not own profile - CTA to take quiz */}
        {!isOwnProfile && (
          <div className="text-center border-t border-gray-200 pt-8">
            <p className="text-gray-600 mb-4">
              Want to discover your own taste profile?
            </p>
            <Link
              href="/taste-match"
              className="inline-block bg-black text-white px-8 py-3 text-sm uppercase tracking-wide hover:bg-neutral-800 transition"
            >
              Take the Quiz
            </Link>
          </div>
        )}

        {/* Back to VIA */}
        <div className="text-center mt-12">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-black transition"
          >
            ← Back to VIA
          </Link>
        </div>
      </div>
    </main>
  );
}
