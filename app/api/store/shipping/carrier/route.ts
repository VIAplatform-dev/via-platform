import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getShippingSettings, setShippingSettings } from "@/app/lib/store-shipping-db";

export const dynamic = "force-dynamic";

// Connect a store's OWN courier account to VYA.
//
// WHY A STORE WOULD. Two reasons, and the second is the one that matters:
//   • its own negotiated rates instead of VYA's shared ones;
//   • it becomes able to promise "duties covered". Duty is invoiced by the courier WEEKS after the
//     label, in an amount nobody knew at purchase, so VYA will not carry it for a third party (see
//     resolveDutyMode). On the store's own account the courier bills the store and VYA is never in
//     the middle — so DDP is unlocked by connecting an account, not by ticking a box.
//
// The credentials go straight to EasyPost and are NEVER stored here. All VYA keeps is the returned
// carrier-account id, which is a reference, not a secret.

/** What each carrier needs. EasyPost's own field names, so the UI can render them generically. */
export const CARRIERS: { type: string; label: string; fields: { key: string; label: string; hint?: string }[]; ddp: boolean }[] = [
 {
  type: "DhlExpressAccount",
  label: "DHL Express",
  ddp: true,
  fields: [{ key: "account_number", label: "DHL account number", hint: "9 digits, on your DHL invoice" }],
 },
 {
  type: "FedexAccount",
  label: "FedEx",
  ddp: true,
  fields: [
   { key: "account_number", label: "FedEx account number" },
   { key: "corporate_address_countryCode", label: "Account country", hint: "Two letters, e.g. GB" },
  ],
 },
 {
  type: "UpsAccount",
  label: "UPS",
  ddp: true,
  fields: [{ key: "account_number", label: "UPS account number" }],
 },
];

const byType = (t: unknown) => CARRIERS.find((c) => c.type === String(t ?? ""));

function apiKey(): string | null {
 return process.env.EASYPOST_API_KEY || null;
}

/** What the UI needs to draw the form. */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const s = await getShippingSettings(slug).catch(() => null);
 return NextResponse.json({
  ok: true,
  connected: Boolean(s?.carrierAccountId),
  carriers: CARRIERS.map(({ type, label, fields, ddp }) => ({ type, label, fields, ddp })),
  configured: Boolean(apiKey()),
 });
}

/** POST { type, credentials } — hand them to EasyPost, keep only the id it gives back. */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const key = apiKey();
 if (!key) return NextResponse.json({ error: "Shipping isn’t configured on the server yet." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const carrier = byType(body?.type);
 if (!carrier) return NextResponse.json({ error: "Pick a courier." }, { status: 400 });

 // Only the fields this carrier declares, so nothing arbitrary is forwarded.
 const credentials: Record<string, string> = {};
 for (const f of carrier.fields) {
  const v = body?.credentials?.[f.key];
  if (typeof v !== "string" || !v.trim()) {
   return NextResponse.json({ error: `${f.label} is required.` }, { status: 400 });
  }
  credentials[f.key] = v.trim().slice(0, 120);
 }

 let res: Response;
 try {
  res = await fetch("https://api.easypost.com/v2/carrier_accounts", {
   method: "POST",
   headers: {
    Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    "Content-Type": "application/json",
   },
   body: JSON.stringify({ carrier_account: { type: carrier.type, description: `VYA — ${slug}`, credentials } }),
  });
 } catch {
  return NextResponse.json({ error: "Couldn’t reach the courier — try again." }, { status: 502 });
 }

 const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
 if (!res.ok || !data?.id) {
  // EasyPost's own words are more useful than ours here — it names the field the courier rejected.
  const detail = data?.error?.message;
  return NextResponse.json({ error: detail ? `The courier rejected that: ${detail}` : "The courier rejected those details. Check the account number and try again." }, { status: 400 });
 }

 const existing = await getShippingSettings(slug);
 await setShippingSettings(slug, { ...existing, carrierAccountId: data.id });
 return NextResponse.json({ ok: true, connected: true });
}

/** Disconnect. Falls back to VYA's shared rates, and duty goes back to the buyer. */
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const existing = await getShippingSettings(slug);
 await setShippingSettings(slug, { ...existing, carrierAccountId: null });
 return NextResponse.json({ ok: true, connected: false });
}
