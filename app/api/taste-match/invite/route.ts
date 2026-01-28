import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("[TasteMatch] Invite API called");

  try {
    const body = await request.json();
    const { phoneNumbers, referrerId } = body as {
      phoneNumbers: string[];
      referrerId: string;
    };

    console.log("[TasteMatch] Request body:", { phoneNumbers, referrerId });

    if (!phoneNumbers || phoneNumbers.length !== 2) {
      return NextResponse.json(
        { error: "Two phone numbers are required" },
        { status: 400 }
      );
    }

    if (!referrerId) {
      return NextResponse.json(
        { error: "referrerId is required" },
        { status: 400 }
      );
    }

    // Check for Twilio credentials
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    console.log("[TasteMatch] Twilio config:", {
      hasAccountSid: !!accountSid,
      hasAuthToken: !!authToken,
      fromNumber: fromNumber || "NOT SET",
    });

    if (!accountSid || !authToken || !fromNumber) {
      console.warn("[TasteMatch] Twilio not configured, skipping SMS");
      return NextResponse.json({
        success: true,
        smsSent: false,
        message: "Invites recorded (SMS not configured)",
      });
    }

    // Build the invite URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://thevia.co";
    const inviteUrl = `${baseUrl}/taste-match?ref=${referrerId}`;

    const message = `Your friend wants you to discover your fashion taste! Take the VIA Taste Match quiz: ${inviteUrl}`;

    console.log("[TasteMatch] Sending SMS with message:", message);

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const results = await Promise.allSettled(
      phoneNumbers.map(async (phone) => {
        // Format phone number for Twilio (E.164 format)
        const digits = phone.replace(/\D/g, "");
        const formattedPhone = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;

        console.log(`[TasteMatch] Sending SMS to: ${formattedPhone} from: ${fromNumber}`);

        const response = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: formattedPhone,
            From: fromNumber,
            Body: message,
          }),
        });

        const responseText = await response.text();
        console.log(`[TasteMatch] Twilio response for ${formattedPhone}:`, response.status, responseText);

        if (!response.ok) {
          console.error(`[TasteMatch] SMS failed for ${formattedPhone}:`, responseText);
          throw new Error(`SMS failed: ${responseText}`);
        }

        return { phone: formattedPhone, status: "sent" };
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Log any failures
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[TasteMatch] SMS ${i + 1} failed:`, r.reason);
      }
    });

    console.log(`[TasteMatch] SMS invites complete: ${sent} sent, ${failed} failed`);

    return NextResponse.json({
      success: true,
      smsSent: true,
      sent,
      failed,
    });
  } catch (error) {
    console.error("[TasteMatch] Invite error:", error);
    return NextResponse.json(
      { error: "Failed to send invites" },
      { status: 500 }
    );
  }
}
