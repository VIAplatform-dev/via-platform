import { NextRequest, NextResponse } from "next/server";
import { resolveStore } from "@/app/lib/plan-b/cart-session";
import { signInLinkToken } from "@/app/lib/shopper-signin";
import { Resend } from "resend";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

/**
 * POST { email } — email this shopper a link that signs them in to THIS store.
 *
 * The store is taken from the host, never from the request body: a link is scoped to one seller and
 * letting the caller name the store would let anyone mint a sign-in for any store.
 *
 * The reply is deliberately the same whether or not we have heard of the address. Saying "no account
 * here" would turn this endpoint into a way to ask a seller's storefront which of your customers'
 * email addresses it knows.
 */
export const dynamic = "force-dynamic";

const SAME_ANSWER = { ok: true, sent: true } as const;

export async function POST(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 404 });

 // A LIMIT, because this endpoint spends money and somebody else's reputation. Without one, a loop
 // makes us send mail to any address at will — our bill, and our sending domain in the spam folder.
 // Per IP and per store: a shared office IP must not lock a seller's other shoppers out.
 if (await overRateLimit({ bucket: `signin:${store.slug}`, ip: clientIp(request.headers), max: 8, windowMinutes: 15 })) {
  // Deliberately the same shape as a success. Telling a prober they hit a limit tells them the
  // endpoint is worth probing; the shopper who genuinely typed twice is told to check their email,
  // which is true — the first link still works.
  return NextResponse.json(SAME_ANSWER);
 }

 const body = await request.json().catch(() => null);
 const email = String(body?.email || "").trim().toLowerCase();
 // Shape only. Whether it exists, and whether it reaches anyone, is not this endpoint's business.
 if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
  return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
 }

 const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
 if (!secret) return NextResponse.json({ error: "Sign-in is not configured." }, { status: 500 });

 const token = signInLinkToken({ email, storeSlug: store.slug }, secret);
 const origin = new URL(request.url).origin;
 const link = `${origin}/api/storefront/account/verify?token=${encodeURIComponent(token)}`;

 const seller = await getSellerBySlug(store.slug).catch(() => null);
 const shopName = seller?.name || store.slug;
 // Resend directly rather than through app/lib/email: that module throws when no key is configured,
 // and a missing key must not turn a sign-in request into a 500 for the shopper.
 const apiKey = process.env.RESEND_API_KEY;
 if (apiKey) {
  const client = new Resend(apiKey);
  // Sent as the SHOP, not as VYA — the shopper is signing in to a vintage store, and an email from
  // a marketplace they have never heard of reads as phishing.
  await client.emails.send({
   from: `${shopName} <hana@vyaplatform.com>`,
   to: email,
   subject: `Sign in to ${shopName}`,
   text: `Tap to sign in to ${shopName}:\n\n${link}\n\nThe link works once and expires in 30 minutes. If you didn't ask for this, ignore it — nothing has changed.`,
  }).catch(() => {});
 }
 return NextResponse.json(SAME_ANSWER);
}
