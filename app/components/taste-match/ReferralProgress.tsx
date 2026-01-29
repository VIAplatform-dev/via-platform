"use client";

interface ReferralProgressProps {
  completedCount: number;
  isUnlocked: boolean;
}

export default function ReferralProgress({
  completedCount,
  isUnlocked,
}: ReferralProgressProps) {
  const circles = [0, 1].map((index) => {
    const isFilled = index < completedCount;
    return (
      <div
        key={index}
        className={`
          w-4 h-4 rounded-full border-2 transition-all duration-300
          ${
            isFilled
              ? "bg-black border-black"
              : "bg-white border-gray-300"
          }
        `}
      />
    );
  });

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        {circles}
      </div>
      <p className="text-sm text-gray-600">
        {isUnlocked ? (
          <span className="text-black font-medium">Unlocked!</span>
        ) : (
          <span>
            {completedCount}/2 shares
          </span>
        )}
      </p>
    </div>
  );
}
