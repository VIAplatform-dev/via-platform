import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { createGiveawayEntry, processReferralEntry, getEntryByEmail, setReferredByCode } from "@/app/lib/giveaway-db";
import { sendGiveawayConfirmation, sendFriendEnteredEmail } from "@/app/lib/email";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

export async function POST(request: Request) {
 try {
 const ip = clientIp(request.headers);
 if (await overRateLimit({ bucket: "giveaway-enter", ip, max: 10, windowMinutes: 15 })) {
 return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
 }
 const { email, refCode } = await request.json();

 if (!email || typeof email !== "string" || !email.includes("@")) {
 return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
 }

 const normalizedEmail = email.toLowerCase().trim();
 const normalizedRefCode = refCode && typeof refCode === "string" ? refCode.toUpperCase().trim() : null;

 // Create entry (deduplicates via UNIQUE constraint)
 const { referralCode, isExisting } = await createGiveawayEntry(normalizedEmail, normalizedRefCode || undefined);

 const baseUrl = getBaseUrl();
 const referralLink = `${baseUrl}/waitlist?ref=${referralCode}`;

 if (!isExisting) {
 // New entry — send confirmation email
 try {
 await sendGiveawayConfirmation(normalizedEmail, referralCode);
 } catch (err) {
 console.error("Failed to send confirmation email:", err);
 }

 // Process referral for the referrer
 if (normalizedRefCode) {
 try {
 const result = await processReferralEntry(normalizedEmail, normalizedRefCode);
 if (result && result.friendNumber) {
 try {
 await sendFriendEnteredEmail(
 result.referrerEntry.email,
 result.referrerEntry.referralCode,
 result.friendNumber
 );
 } catch (emailErr) {
 console.error("Failed to send friend-entered email:", emailErr);
 }
 }
 } catch (err) {
 console.error("Failed to process referral:", err);
 }
 }
 } else if (normalizedRefCode) {
 // Existing entry — but they came through a referral link.
 // If they haven't been counted as a referral yet, process it now.
 try {
 const existingEntry = await getEntryByEmail(normalizedEmail);
 if (existingEntry && !existingEntry.referredByCode) {
 // Mark them as referred and increment the referrer's count
 await setReferredByCode(normalizedEmail, normalizedRefCode);
 const result = await processReferralEntry(normalizedEmail, normalizedRefCode);
 if (result && result.friendNumber) {
 try {
 await sendFriendEnteredEmail(
 result.referrerEntry.email,
 result.referrerEntry.referralCode,
 result.friendNumber
 );
 } catch (emailErr) {
 console.error("Failed to send friend-entered email:", emailErr);
 }
 }
 }
 } catch (err) {
 console.error("Failed to process referral for existing entry:", err);
 }
 }

 return NextResponse.json({
 referralCode,
 referralLink,
 isNew: !isExisting,
 });
 } catch (error) {
 console.error("Giveaway enter error:", error);
 return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 }
}
