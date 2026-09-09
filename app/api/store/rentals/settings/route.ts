import { NextRequest, NextResponse } from "next/server";
import { getStoreSettings, saveStoreSettings } from "@/app/lib/rentals/rentals-db";
import { settingsWarnings, type RentalSettings } from "@/app/lib/rentals/settings-core";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// The store's house rules. Warnings ride along with every response so the settings
// screen can flag combinations that are legal but will misbehave.

export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const settings = await getStoreSettings(acting.slug);
 return NextResponse.json({ settings, warnings: settingsWarnings(settings) });
}

export async function PUT(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const body = (await request.json().catch(() => ({}))) as Partial<RentalSettings>;
 const settings = await saveStoreSettings(acting.slug, body || {});
 return NextResponse.json({ settings, warnings: settingsWarnings(settings) });
}
