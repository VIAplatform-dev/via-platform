import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { isValidAccessCode } from "@/app/lib/accessCodes";
import {
  getPilotStatus,
  getPilotReferralCode,
  createPilotEntry,
  checkAndApproveReferrer,
  checkAndGrantInsider,
} from "@/app/lib/pilot-db";
import { sendPilotApprovalEmail, sendWaitlistConfirmationEmail, sendReferralInsiderWelcomeEmail } from "@/app/lib/email";

// Promo codes grant instant approval and are tracked in the promo_code column
const PROMO_CODES: Record<string, string> = {
  NYC: "nyc-popup-2026-03-29",
};

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return url;
}

// Per-IP rate limit on this public form. A real person signs up once; a bot hammers it. 10/hour
// is generous for shared networks while stopping a flood. DB-backed so it holds across the
// serverless instances Vercel spins up (in-memory wouldn't).
const REGISTER_RATE_LIMIT = 10;
let rateTableReady = false;
function getSql() { return neon(getDatabaseUrl()); }
type Sql = ReturnType<typeof getSql>;
async function ensureRateTable(sql: Sql) {
  if (rateTableReady) return;
  await sql`CREATE TABLE IF NOT EXISTS register_attempts (ip TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_register_attempts_ip_ts ON register_attempts (ip, created_at)`;
  rateTableReady = true;
}
function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
// Returns true if this IP is over the limit (already logged the attempt when under).
async function overRateLimit(request: NextRequest): Promise<boolean> {
  try {
    const sql = getSql();
    await ensureRateTable(sql);
    const ip = clientIp(request);
    const recent = (await sql`SELECT count(*)::int AS n FROM register_attempts WHERE ip = ${ip} AND created_at >= now() - interval '1 hour'`) as { n: number }[];
    if (recent[0].n >= REGISTER_RATE_LIMIT) return true;
    await sql`INSERT INTO register_attempts (ip) VALUES (${ip})`;
    // Opportunistic cleanup so the table can't grow unbounded under a distributed flood.
    if (Math.random() < 0.02) await sql`DELETE FROM register_attempts WHERE created_at < now() - interval '2 days'`.catch(() => {});
    return false;
  } catch {
    return false; // never block real signups if the limiter itself errors
  }
}

async function recordPromoCode(email: string, promoKey: string) {
  const sql = neon(getDatabaseUrl());
  await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS promo_code TEXT`;
  await sql`
    UPDATE pilot_access
    SET promo_code = COALESCE(promo_code, ${promoKey})
    WHERE email = ${email}
  `;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, emailSubscribe, smsSubscribe, referralCode, accessCode, source } = body;

    if (!email || !firstName) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Spam guard: the pilot form was flooded by bots injecting casino/link spam into the name
    // fields. Reject any submission whose name contains a URL, a messaging-app handle, or obvious
    // spam markers, or that is absurdly long. Real names never do. Blocks the flood without
    // affecting genuine signups. (Longer-term: a captcha / rate-limit on this public endpoint.)
    const nameBlob = `${firstName ?? ""} ${lastName ?? ""}`;
    const SPAM = /https?:\/\/|www\.|bit\.ly|t\.me\/|wa\.me\/|telegram|whatsapp|\bcasino\b|\bbonus\b|\bspin[s]?\b|\bfree\s*money\b|[✨🎰🎁💰🔥]|[a-z0-9-]+\.(com|net|ru|xyz|top|shop|link|online|site|club|vip)\b/i;
    if (SPAM.test(nameBlob) || (firstName || "").length > 60 || (lastName || "").length > 60) {
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    }
    // Phone (when given) must look like a phone, not a spam string.
    if (phone && !/^[+()\d\s.-]{6,20}$/.test(String(phone).trim())) {
      return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
    }

    // Rate-limit by IP (defense-in-depth for bots that drop the URL spam). Runs after the cheap
    // content checks above, so the current URL-spam flood is rejected before any DB work.
    if (await overRateLimit(request)) {
      return NextResponse.json({ error: "Too many attempts from your network. Please try again later." }, { status: 429 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedReferralCode = referralCode?.trim().toUpperCase() || undefined;

    const promoKey = accessCode?.trim().toUpperCase() ?? "";
    const promoSource = PROMO_CODES[promoKey];
    const isPromoCode = !!promoSource;

    const existingStatus = await getPilotStatus(normalizedEmail);
    if (existingStatus) {
      // If they're pending and have a valid promo code, upgrade them to approved
      if (isPromoCode && existingStatus === "pending") {
        const sql = neon(getDatabaseUrl());
        await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS promo_code TEXT`;
        await sql`
          UPDATE pilot_access
          SET status = 'approved', approved_at = NOW(), promo_code = COALESCE(promo_code, ${promoKey})
          WHERE email = ${normalizedEmail}
        `;
        sendPilotApprovalEmail(normalizedEmail, firstName?.trim() || "").catch(
          (err) => console.error("[PilotRegister] Approval email failed:", err)
        );
        const existingCode = await getPilotReferralCode(normalizedEmail);
        return NextResponse.json({ status: "approved", referralCode: existingCode });
      }
      const existingCode = await getPilotReferralCode(normalizedEmail);
      return NextResponse.json({ status: existingStatus, alreadyRegistered: true, referralCode: existingCode });
    }

    // Check access code: a valid access code grants immediate approval (skips the
    // waitlist). Uses the shared list so site-access and waitlist-skip never drift.
    const hasValidCode = isPromoCode || isValidAccessCode(accessCode);
    const status = hasValidCode ? "approved" : "pending";

    const myReferralCode = await createPilotEntry({
      email: normalizedEmail,
      firstName: firstName.trim(),
      lastName: lastName?.trim() || undefined,
      phone: phone?.trim() || undefined,
      emailSubscribe: !!emailSubscribe,
      smsSubscribe: !!smsSubscribe,
      status,
      referredBy: normalizedReferralCode,
      source: typeof source === "string" && source.trim() ? source.trim() : undefined,
    });

    // Record promo code for tracking
    if (isPromoCode) {
      await recordPromoCode(normalizedEmail, promoKey).catch(
        (err) => console.error("[PilotRegister] Promo code record failed:", err)
      );
    }

    if (hasValidCode) {
      sendPilotApprovalEmail(normalizedEmail, firstName.trim()).catch(
        (err) => console.error("[PilotRegister] Approval email failed:", err)
      );
    } else {
      sendWaitlistConfirmationEmail(normalizedEmail, firstName.trim()).catch(
        (err) => console.error("[PilotRegister] Waitlist email failed:", err)
      );
    }

    // If signed up via a referral code, approve the referrer and check for insider status
    if (normalizedReferralCode) {
      const approved = await checkAndApproveReferrer(normalizedReferralCode);
      if (approved) {
        sendPilotApprovalEmail(approved.email, approved.firstName ?? undefined).catch(
          (err) => console.error("[PilotRegister] Referrer approval email failed:", err)
        );
      }

      // Grant insider if referrer now has 2+ referrals (fires once, on the 2nd signup)
      checkAndGrantInsider(normalizedReferralCode)
        .then((insider) => {
          if (insider) {
            sendReferralInsiderWelcomeEmail(insider.email, insider.firstName ?? undefined).catch(
              (err) => console.error("[PilotRegister] Insider welcome email failed:", err)
            );
          }
        })
        .catch((err) => console.error("[PilotRegister] checkAndGrantInsider failed:", err));
    }

    return NextResponse.json({ status, referralCode: myReferralCode });
  } catch (error) {
    console.error("[PilotRegister]", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
