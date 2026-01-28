import { NextRequest, NextResponse } from "next/server";
import { saveProfile, initTasteDatabase } from "@/app/lib/taste-db";
import { calculateScores, getTopTags } from "@/app/lib/taste-scoring";
import type { QuizAnswers } from "@/app/lib/taste-types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, answers } = body as { userId: string; answers: QuizAnswers };

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    if (!answers || Object.keys(answers).length === 0) {
      return NextResponse.json(
        { error: "answers are required" },
        { status: 400 }
      );
    }

    // Calculate scores and top tags
    const scores = calculateScores(answers);
    const topTags = getTopTags(scores);

    // Try to save to database, but don't fail if DB is unavailable
    let savedToDb = false;
    try {
      const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
      if (dbUrl) {
        await initTasteDatabase();
        await saveProfile(
          userId,
          scores,
          topTags.primary.tag,
          topTags.primary.percentage,
          topTags.secondary.tag,
          topTags.secondary.percentage,
          topTags.tertiary.tag,
          topTags.tertiary.percentage,
          answers
        );
        savedToDb = true;
      }
    } catch (dbError) {
      console.warn("[TasteMatch] Database unavailable, returning calculated results:", dbError);
    }

    return NextResponse.json({
      success: true,
      savedToDb,
      profile: {
        userId,
        scores,
        primaryTag: topTags.primary.tag,
        primaryPercentage: topTags.primary.percentage,
        secondaryTag: topTags.secondary.tag,
        secondaryPercentage: topTags.secondary.percentage,
        tertiaryTag: topTags.tertiary.tag,
        tertiaryPercentage: topTags.tertiary.percentage,
        answers,
      },
    });
  } catch (error) {
    console.error("[TasteMatch] Submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit quiz" },
      { status: 500 }
    );
  }
}
