"use client";

import type { TasteProfile, TasteTag } from "@/app/lib/taste-types";
import { TASTE_TAGS } from "@/app/lib/taste-scoring";

interface TasteComparisonProps {
  userProfile: TasteProfile;
  friendProfiles: TasteProfile[];
}

export default function TasteComparison({
  userProfile,
  friendProfiles,
}: TasteComparisonProps) {
  if (friendProfiles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-serif text-center">Your Taste Matches</h3>

      <div className="space-y-4">
        {friendProfiles.map((friend) => {
          const compatibility = calculateCompatibility(userProfile, friend);
          const friendPrimary = TASTE_TAGS[friend.primaryTag];

          return (
            <div
              key={friend.userId}
              className="border border-gray-200 rounded-lg p-4 bg-white"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: friendPrimary.color }}
                  >
                    {friend.userId.slice(-2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{friendPrimary.label}</p>
                    <p className="text-xs text-gray-500">
                      {friend.primaryPercentage}% match
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-serif">{compatibility}%</p>
                  <p className="text-xs text-gray-500">taste match</p>
                </div>
              </div>

              {/* Taste bar comparison */}
              <div className="space-y-2">
                {(Object.keys(TASTE_TAGS) as TasteTag[]).map((tag) => {
                  const userScore = userProfile.scores[tag];
                  const friendScore = friend.scores[tag];
                  const maxScore = Math.max(userScore, friendScore, 1);
                  const tagInfo = TASTE_TAGS[tag];

                  return (
                    <div key={tag} className="flex items-center gap-2">
                      <span
                        className="text-[10px] w-16 truncate"
                        style={{ color: tagInfo.color }}
                      >
                        {tagInfo.label}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className="absolute top-0 left-0 h-full opacity-60 rounded-full"
                          style={{
                            width: `${(userScore / maxScore) * 50}%`,
                            backgroundColor: tagInfo.color,
                          }}
                        />
                        <div
                          className="absolute top-0 right-0 h-full opacity-40 rounded-full"
                          style={{
                            width: `${(friendScore / maxScore) * 50}%`,
                            backgroundColor: tagInfo.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function calculateCompatibility(
  user: TasteProfile,
  friend: TasteProfile
): number {
  // Calculate based on shared preferences
  let matchScore = 0;

  // Primary tag match is worth more
  if (user.primaryTag === friend.primaryTag) matchScore += 40;
  else if (
    user.primaryTag === friend.secondaryTag ||
    user.secondaryTag === friend.primaryTag
  )
    matchScore += 25;

  // Secondary matches
  if (user.secondaryTag === friend.secondaryTag) matchScore += 20;

  // Score similarity
  const tags = Object.keys(TASTE_TAGS) as TasteTag[];
  let totalDiff = 0;
  for (const tag of tags) {
    totalDiff += Math.abs(user.scores[tag] - friend.scores[tag]);
  }
  // Max possible diff is about 10 per tag * 5 tags = 50
  const similarityScore = Math.max(0, 40 - totalDiff);
  matchScore += similarityScore;

  return Math.min(100, Math.max(10, matchScore));
}
