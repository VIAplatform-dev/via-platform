import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

function getResend() {
 const apiKey = process.env.RESEND_API_KEY;
 if (!apiKey) {
 throw new Error("RESEND_API_KEY environment variable is not set.");
 }
 return new Resend(apiKey);
}

const FROM_EMAIL = "VYA <hana@vyaplatform.com>";
const TO_EMAIL = "hana@vyaplatform.com";

function baseStyles() {
 return `
 body { margin: 0; padding: 0; background-color: #f7f6f3; font-family: 'Cormorant Garamond', Georgia, serif; }
 .container { max-width: 560px; margin: 0 auto; padding: 48px 24px; }
 .header { text-align: center; margin-bottom: 32px; }
 .header h1 { font-size: 28px; font-weight: 300; letter-spacing: 0.15em; color: #000; margin: 0; }
 .content { background: #ffffff; padding: 40px 32px; border-radius: 4px; }
 .content h2 { font-size: 24px; font-weight: 400; color: #000; margin: 0 0 16px 0; line-height: 1.3; }
 .content p { font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 16px 0; }
 .detail { background: #f7f6f3; padding: 14px 20px; font-size: 14px; color: #333; margin: 16px 0; border-radius: 4px; }
 .btn { display: inline-block; background: #000; color: #fff !important; padding: 14px 32px; text-decoration: none; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 8px; }
 .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #999; }
 `;
}

export async function POST(request: NextRequest) {
 try {
 const ip = clientIp(request.headers);
 if (await overRateLimit({ bucket: "product-question", ip, max: 10, windowMinutes: 15 })) {
 return NextResponse.json({ error: "Too many questions sent. Please try again in a few minutes." }, { status: 429 });
 }
 const body = await request.json();
 const { email, question, productTitle, storeName, productUrl } = body;

 if (!email || typeof email !== "string") {
 return NextResponse.json(
 { error: "Email is required" },
 { status: 400 }
 );
 }

 if (!question || typeof question !== "string") {
 return NextResponse.json(
 { error: "Question is required" },
 { status: 400 }
 );
 }

 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 if (!emailRegex.test(email.trim())) {
 return NextResponse.json(
 { error: "Please enter a valid email address" },
 { status: 400 }
 );
 }

 const resend = getResend();

 await resend.emails.send({
 from: FROM_EMAIL,
 to: TO_EMAIL,
 replyTo: email.trim(),
 subject: `Product Question: ${productTitle}`,
 html: `
<!DOCTYPE html>
<html>
<head><style>${baseStyles()}</style></head>
<body>
 <div class="container">
 <div class="header"><h1>VYA</h1></div>
 <div class="content">
 <h2>New Product Question</h2>
 <div class="detail">
 <p style="margin: 0 0 8px 0;"><strong>Product:</strong> ${productTitle}</p>
 <p style="margin: 0 0 8px 0;"><strong>Store:</strong> ${storeName}</p>
 <p style="margin: 0;"><strong>From:</strong> ${email.trim()}</p>
 </div>
 <p><strong>Question:</strong></p>
 <p>${question.replace(/\n/g, "<br>")}</p>
 <a href="${productUrl}" class="btn">View Product</a>
 </div>
 <div class="footer">
 <p>&copy; ${new Date().getFullYear()} VYA</p>
 </div>
 </div>
</body>
</html>`,
 });

 return NextResponse.json({ message: "Question sent successfully" });
 } catch (error) {
 console.error("[Product Question] Error:", error);
 return NextResponse.json(
 { error: "Something went wrong. Please try again." },
 { status: 500 }
 );
 }
}
