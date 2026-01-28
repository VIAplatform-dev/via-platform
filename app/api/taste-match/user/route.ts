import { NextRequest, NextResponse } from "next/server";
import { createUser, getUser, initTasteDatabase } from "@/app/lib/taste-db";
import { generateUserId } from "@/app/lib/taste-scoring";

export async function POST(request: NextRequest) {
  try {
    await initTasteDatabase();

    const body = await request.json();
    const { userId, referrerId } = body;

    // If userId provided, try to get existing user
    if (userId) {
      const existingUser = await getUser(userId);
      if (existingUser) {
        return NextResponse.json({ user: existingUser });
      }
    }

    // Create new user
    const newUserId = userId || generateUserId();
    const user = await createUser(newUserId, referrerId || null);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[TasteMatch] User creation error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await initTasteDatabase();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const user = await getUser(userId);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("[TasteMatch] Get user error:", error);
    return NextResponse.json(
      { error: "Failed to get user" },
      { status: 500 }
    );
  }
}
