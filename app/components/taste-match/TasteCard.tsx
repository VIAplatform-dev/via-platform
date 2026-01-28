"use client";

import type { TasteTag } from "@/app/lib/taste-types";
import { TASTE_TAGS, getTagGradient } from "@/app/lib/taste-scoring";

interface TasteCardProps {
  primaryTag: TasteTag;
  primaryPercentage: number;
  secondaryTag: TasteTag;
  secondaryPercentage: number;
  tertiaryTag: TasteTag;
  tertiaryPercentage: number;
}

export default function TasteCard({
  primaryTag,
  primaryPercentage,
  secondaryTag,
  secondaryPercentage,
  tertiaryTag,
  tertiaryPercentage,
}: TasteCardProps) {
  const primary = TASTE_TAGS[primaryTag];
  const secondary = TASTE_TAGS[secondaryTag];
  const tertiary = TASTE_TAGS[tertiaryTag];
  const gradient = getTagGradient(primaryTag);

  return (
    <div
      className={`
        relative w-full max-w-sm mx-auto aspect-[3/4] rounded-lg overflow-hidden
        bg-gradient-to-br ${gradient} shadow-xl
      `}
    >
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        {/* Top - VIA Branding */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-1">
            VIA Taste Match
          </p>
        </div>

        {/* Middle - Primary Tag */}
        <div className="text-center flex-1 flex flex-col justify-center">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Your taste is
          </p>
          <h2
            className="text-3xl sm:text-4xl font-serif mb-2"
            style={{ color: primary.color }}
          >
            {primary.label}
          </h2>
          <p className="text-4xl sm:text-5xl font-serif font-light text-black">
            {primaryPercentage}%
          </p>
          <p className="text-sm text-gray-600 mt-3 max-w-[200px] mx-auto">
            {primary.description}
          </p>
        </div>

        {/* Bottom - Secondary/Tertiary Tags */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span style={{ color: secondary.color }} className="font-medium">
              {secondary.label}
            </span>
            <span className="text-gray-600">{secondaryPercentage}%</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span style={{ color: tertiary.color }} className="font-medium">
              {tertiary.label}
            </span>
            <span className="text-gray-600">{tertiaryPercentage}%</span>
          </div>
        </div>
      </div>

      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, black 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>
    </div>
  );
}
