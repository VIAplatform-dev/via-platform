import { NextRequest, NextResponse } from "next/server";
import { getReferralStatus, initTasteDatabase } from "@/app/lib/taste-db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await initTasteDatabase();

    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const status = await getReferralStatus(userId);

    return NextResponse.json({ referrals: status });
  } catch (error) {
    console.error("[TasteMatch] Get referrals error:", error);
    return NextResponse.json(
      { error: "Failed to get referral status" },
      { status: 500 }
    );
  }
}
