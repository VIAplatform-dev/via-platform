"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TasteCard from "@/app/components/taste-match/TasteCard";
import ShareButton from "@/app/components/taste-match/ShareButton";
import ReferralProgress from "@/app/components/taste-match/ReferralProgress";
import TasteComparison from "@/app/components/taste-match/TasteComparison";
import UnlockCelebration from "@/app/components/taste-match/UnlockCelebration";
import type { TasteProfile, ReferralStatus } from "@/app/lib/taste-types";

interface ResultsPageProps {
  params: Promise<{ userId: string }>;
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { userId } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [referrals, setReferrals] = useState<ReferralStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check if this is the user's own profile
        const storedUserId = localStorage.getItem("via_taste_user_id");
        setIsOwnProfile(storedUserId === userId);

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

        // Fallback to localStorage if API failed
        if (!profileData) {
          const storedProfile = localStorage.getItem(`via_taste_profile_${userId}`);
          if (storedProfile) {
            profileData = JSON.parse(storedProfile);
          }
        }

        if (!profileData) {
          // Profile not found - redirect to quiz if own profile
          if (storedUserId === userId) {
            router.push("/taste-match/quiz");
          } else {
            router.push("/taste-match");
          }
          return;
        }

        setProfile(profileData);

        // Try to fetch referral status (optional)
        try {
          const referralsRes = await fetch(
            `/api/taste-match/referrals/${userId}`
          );
          if (referralsRes.ok) {
            const referralsData = await referralsRes.json();
            setReferrals(referralsData.referrals);
          }
        } catch {
          // Referrals unavailable, continue without them
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, router]);

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

  const isUnlocked = referrals?.isUnlocked || false;
  const completedCount = referrals?.completedCount || 0;

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

        {/* Taste Card */}
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

        {/* Share Button - only for own profile */}
        {isOwnProfile && (
          <div className="mb-8">
            <ShareButton userId={userId} />
          </div>
        )}

        {/* Referral Section - only for own profile */}
        {isOwnProfile && (
          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-xl font-serif text-center mb-6">
              Taste Matches
            </h2>

            {!isUnlocked ? (
              <div className="text-center">
                <div className="bg-white rounded-lg p-6 border border-gray-200">
                  <div className="mb-4">
                    <svg
                      className="w-8 h-8 mx-auto text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>

                  <p className="text-gray-600 mb-4">
                    Invite 2 friends to take the quiz and unlock your Taste
                    Matches to see how your styles compare!
                  </p>

                  <ReferralProgress
                    completedCount={completedCount}
                    isUnlocked={isUnlocked}
                  />
                </div>
              </div>
            ) : (
              <UnlockCelebration>
                <div className="bg-white rounded-lg p-6 border border-gray-200">
                  <ReferralProgress
                    completedCount={completedCount}
                    isUnlocked={isUnlocked}
                  />

                  {referrals && referrals.friends.length > 0 && (
                    <div className="mt-6">
                      <TasteComparison
                        userProfile={profile}
                        friendProfiles={referrals.friends}
                      />
                    </div>
                  )}
                </div>
              </UnlockCelebration>
            )}
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
