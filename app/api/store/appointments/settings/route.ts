import { NextRequest, NextResponse } from "next/server";
import { getAppointmentSettings, saveAppointmentSettings } from "@/app/lib/appointments/appointments-db";
import { appointmentWarnings, type AppointmentSettings } from "@/app/lib/appointments/settings-core";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { routableEmail, storeOwnerInbox } from "@/app/lib/email";
import { seller, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

// A shop's diary rules. Warnings ride along so the form can flag combinations that will confuse —
// a deposit with no Stripe account behind it, say.
async function withWarnings(slug: string, settings: AppointmentSettings) {
 const pay = await getSellerPayments(slug).catch(() => null);
 // Where booking alerts will ACTUALLY land, resolved the same way the sender resolves it. Shown on
 // the form, because "email me every booking" is worthless if the store can't see which inbox.
 const notifyTo = routableEmail(settings.notifyEmail) || (await storeOwnerInbox(slug).catch(() => null));
 return { settings, notifyTo, warnings: appointmentWarnings(settings, { paymentsReady: Boolean(pay?.chargesEnabled) }) };
}

export async function GET(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 return NextResponse.json(await withWarnings(acting.slug, await getAppointmentSettings(acting.slug)));
}

export async function PUT(request: NextRequest) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const body = (await request.json().catch(() => ({}))) as Partial<AppointmentSettings>;
 return NextResponse.json(await withWarnings(acting.slug, await saveAppointmentSettings(acting.slug, body || {})));
}
