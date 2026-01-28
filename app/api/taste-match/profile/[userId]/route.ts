import { NextRequest, NextResponse } from "next/server";
import { getProfile, initTasteDatabase } from "@/app/lib/taste-db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Check if database is configured
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
      // No database - return 404 so client falls back to localStorage
      return NextResponse.json(
        { error: "Profile not found (no database configured)" },
        { status: 404 }
      );
    }

    await initTasteDatabase();
    const profile = await getProfile(userId);

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[TasteMatch] Get profile error:", error);
    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 }
    );
  }
}
