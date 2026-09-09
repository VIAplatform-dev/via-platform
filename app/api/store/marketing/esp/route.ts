import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { maskKey, PROVIDERS, syncable, type Contact } from "@/app/lib/esp-core";
import { verify, pushContacts } from "@/app/lib/esp-client";
import { espAuth } from "@/app/lib/esp-auth";
import { setEspHandover } from "@/app/lib/esp-db";
import { describe as describeOwnership, TRANSACTIONAL_EXAMPLES, MARKETING_EXAMPLES } from "@/app/lib/email-ownership";
import { oauthConfigured } from "@/app/lib/esp-oauth";
import { getEspConnection, setEspList, setEspAutoSync, recordEspSync, disconnectEsp } from "@/app/lib/esp-db";
import { listCustomerProfiles } from "@/app/lib/store-customers-db";
import { syncStore, syncProducts, syncCustomers, syncOrders } from "@/app/lib/esp-client";
import { listStorefrontItems } from "@/app/lib/db/inventory";
import { listSellerOrders } from "@/app/lib/db/orders";
import { getSellerBySlug } from "@/app/lib/db/sellers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The store's own email tool — Klaviyo or Mailchimp.
//
// The API key is never sent back to the browser. Once saved it exists only server-side; the page
// gets a masked version so a seller can tell which key is connected without it being readable over
// her shoulder or sitting in a browser cache.

/** GET — what's connected, if anything. */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const r = await espAuth(slug);
 // What VYA itself can offer — missing app credentials is our problem to fix, not something to show
 // a seller as a broken button.
 const available = PROVIDERS.map((p) => ({ ...p, available: oauthConfigured(p.key) }));
 if (!r) return NextResponse.json({ ok: true, connected: null, providers: available });
 const c = r.conn;
 if (!r.auth) {
  return NextResponse.json({ ok: true, providers: available, connected: {
   provider: c.provider, accountName: c.accountName, keyMask: c.authKind === "oauth" ? "Signed in" : maskKey(c.apiKey),
   listId: c.listId, listName: c.listName, autoSync: c.autoSync,
   lastSyncAt: c.lastSyncAt, lastSyncNote: c.lastSyncNote, lists: [],
   problem: "This connection has stopped working. Connect it again.",
  } });
 }

 // Lists are re-read live so a list renamed or deleted in their tool shows up here, rather than us
 // insisting on a name that no longer exists.
 const v = await verify(c.provider, r.auth);
 return NextResponse.json({
  ok: true,
  providers: available,
  connected: {
   provider: c.provider,
   accountName: c.accountName,
   keyMask: c.authKind === "oauth" ? "Signed in" : maskKey(c.apiKey),
   listId: c.listId, listName: c.listName,
   autoSync: c.autoSync,
   handOverMarketing: c.handOverMarketing,
   // Who sends what, said in the response rather than reasoned about again in the browser.
   ownership: {
    summary: describeOwnership(
     { espConnected: Boolean(c.listId), handOverMarketing: c.handOverMarketing },
     c.provider === "mailchimp" ? "Mailchimp" : "Klaviyo",
    ),
    vya: TRANSACTIONAL_EXAMPLES,
    esp: MARKETING_EXAMPLES,
   },
   lastSyncAt: c.lastSyncAt, lastSyncNote: c.lastSyncNote,
   lists: v.ok ? v.lists : [],
   problem: v.ok ? null : v.reason,
  },
 });
}

/** POST { provider, apiKey } — connect. POST { listId } — choose the list. POST { sync: true } — send everyone. */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 const r0 = await espAuth(slug);
 if (!r0) return NextResponse.json({ error: "Connect Klaviyo or Mailchimp first." }, { status: 400 });
 const c = r0.conn;

 if (body?.listId) {
  await setEspList(slug, String(body.listId), String(body.listName || "Your list"));
  return NextResponse.json({ ok: true });
 }
 if (typeof body?.autoSync === "boolean") {
  await setEspAutoSync(slug, body.autoSync);
  return NextResponse.json({ ok: true });
 }
 if (typeof body?.handOverMarketing === "boolean") {
  await setEspHandover(slug, body.handOverMarketing);
  return NextResponse.json({ ok: true });
 }

 if (body?.sync) {
  // The same routine the assistant runs. Two "sync" paths that send different data is how a store
  // ends up with contacts in Mailchimp and no products.
  const { syncEspNow } = await import("@/app/lib/esp-sync");
  const r = await syncEspNow(slug);
  return NextResponse.json({ ok: r.ok, note: r.note, sent: r.sent, error: r.ok ? undefined : r.note });
 }

 return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}

/** DELETE — forget the key entirely. */
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 await disconnectEsp(slug);
 return NextResponse.json({ ok: true });
}
