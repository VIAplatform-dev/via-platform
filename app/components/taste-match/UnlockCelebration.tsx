"use client";

import { useEffect, useState } from "react";

interface UnlockCelebrationProps {
  children: React.ReactNode;
}

export default function UnlockCelebration({ children }: UnlockCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      {/* Confetti animation */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                backgroundColor: [
                  "#C9A87C",
                  "#8B8B8B",
                  "#1A1A1A",
                  "#722F37",
                  "#2D5A27",
                ][Math.floor(Math.random() * 5)],
              }}
            />
          ))}
        </div>
      )}

      {/* Content with scale animation */}
      <div className="animate-scaleIn">{children}</div>
    </div>
  );
}
