import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sendPopupThankYouEmail } from "@/app/lib/email";
import crypto from "crypto";

export const maxDuration = 300;

const CAMPAIGN = "nyc-popup-thankyou-2026-03-29";

// Deduplicated list of NYC pop-up attendees
const POPUP_ATTENDEE_EMAILS = [
 "hannahcao8897@gmail.com",
 "giannaraucher@gmail.com",
 "claudiamatthews80@gmail.com",
 "ana2dance@gmail.com",
 "jgherardi1919@gmail.com",
 "lisanschechter@gmail.com",
 "sophierosebecker@gmail.com",
 "sophiemannes@gmail.com",
 "isabelle.hekmat@outlook.com",
 "daiwong@ucdavis.edu",
 "cleo.rebecklynn@gmail.com",
 "sheanicolebrennan@gmail.com",
 "amydouglassings@gmail.com",
 "ekmarino26@gmail.com",
 "gianna@thenyarchive.com",
 "ellie.livingstone18@gmail.com",
 "miamolina91@icloud.com",
 "madisonpoll3@gmail.com",
 "tamara.teplow1@gmail.com",
 "meghancarey15@gmail.com",
 "sashaporter0613@gmail.com",
 "isabelamber@optonline.net",
 "fareen0428@gmail.com",
 "katie32smyth@gmail.com",
 "iamkaraelaine@gmail.com",
 "chiara.capasso12@gmail.com",
 "nicole.mikhailov@gmail.com",
 "kianahui@gmail.com",
 "kaiwasser@gmail.com",
 "smansbach@icloud.com",
 "layteezy@gmail.com",
 "natenzvi@gmail.com",
 "haileyquiej@gmail.com",
 "lizinnewyorkcity@gmail.com",
 "y.choi0217@gmail.com",
 "akhila2003@icloud.com",
 "sydneytyu@gmail.com",
 "hayley81603@me.com",
 "shari.schwartz12@gmail.com",
 "olivia.soracco@gmail.com",
 "katieseidl16@gmail.com",
 "reedhtorre@gmail.com",
 "dylmorris929@gmail.com",
 "jmansbach1@gmail.com",
 "jessmedwin@gmail.com",
 "mqscarrone@gmail.com",
 "ngranader@tulane.edu",
 "camrynadk12@gmail.com",
 "amandamatluck@gmail.com",
 "katelynnemugler@gmail.com",
 "brookehreg@gmail.com",
 "ojacobs@bu.edu",
 "atryggva@gmail.com",
 "katesette@gmail.com",
 "bunmigjenfa@gmail.com",
 "matty.siegel@hotmail.com",
 "calli.novak@gmail.com",
 "wyllie.boughton@trincoll.edu",
 "nic_martinez11@aol.com",
 "leahmei999@gmail.com",
 "ivyzizhong@gmail.com",
 "harth.stephanie@gmail.com",
 "derinkaraman@icloud.com",
 "dudaakkari18@gmail.com",
 "sophiezaloom@gmail.com",
 "noafederr@gmail.com",
 "mharel2012@gmail.com",
 "lauryndonnelly10@gmail.com",
 "chestergabriella123@gmail.com",
 "kelly28869@gmail.com",
 "qgordinier17@gmail.com",
 "coditoppin@hotmail.com",
 "lovefloriedaine@gmail.com",
 "nikki.chwatt@futurnet.com",
 "mazowg@bc.edu",
 "sewonprk@gmail.com",
 "izzymarks12@gmail.com",
 "nick.yoko.808@gmail.com",
 "ayueh2022@gmail.com",
 "shira.minsk@yale.edu",
 "juliarginsberg@gmail.com",
 "elldobs@udel.edu",
 "melinamelissinos@gmail.com",
 "jnorris0305@gmail.com",
 "ccscarrone@gmail.com",
 "briana.a.charles@gmail.com",
 "jennakurz3@gmail.com",
 "hutchsam6@gmail.com",
 "erica.wilson.660@gmail.com",
 "la8tbug@icloud.com",
 "amdiazbusiness@gmail.com",
 "willowkroger@gmail.com",
 "charlize.deluca@aol.com",
 "kate@99angelsnyc.com",
 "hannah41699@gmail.com",
 "ginalmarini@gmail.com",
 "sofiaisabel11@icloud.com",
 "loud_bevy9@icloud.com",
 "nbucjleyb@gmail.com",
 "ariosmanaj@gmail.com",
 "marinahou@hotmail.com",
 "sophie.marston7@gmail.com",
 "jojo.yu0627@outlook.com",
 "telster@me.com",
 "yasmeen.alwani@moodys.com",
 "laraberns@gmail.com",
 "gmarraccini@icloud.com",
 "caroline.ammarell@gmail.com",
 "nemy84@aol.com",
 "adrianamarraccini1@gmail.com",
 "sammy.macedo8@gmail.com",
 "miapoley@yahoo.com",
 "anna@vintage-girlfriend.com",
 "jordyn.gaitman@icloud.com",
 "reese.mastellon@gmail.com",
 "anikagupta11@yahoo.com",
 "jimeneza089@gmail.com",
 "lily.friedland@icloud.com",
 "roxanna@bagherzadeh.org",
 "kally_sanchez@fitnyc.edu",
 "rockssamandy@gmail.com",
 "jgrubman@innovativephilanthropy.net",
 "chloe1428@yahoo.com",
 "miarose@bu.edu",
 "lgjika37@gmail.com",
 "skylardoss31@gmail.com",
 "isabeldavidson23@gmail.com",
 "mlake171@gmail.com",
 "sanjanadas07@gmail.com",
 "charlottejcasdin@gmail.com",
 "mzhong2216@gmail.com",
 "seemapisciotta318@gmail.com",
 "lamyar7@gmail.com",
];

function getDatabaseUrl() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return url;
}

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === hashPassword(adminPassword)) return true;
 return false;
}

async function ensureSentTable() {
 const sql = neon(getDatabaseUrl());
 await sql`
 CREATE TABLE IF NOT EXISTS email_campaign_sends (
 id SERIAL PRIMARY KEY,
 campaign VARCHAR(100) NOT NULL,
 email VARCHAR(255) NOT NULL,
 sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 UNIQUE (campaign, email)
 )
 `;
}

async function getAlreadySentEmails(campaign: string): Promise<Set<string>> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT LOWER(email) AS email FROM email_campaign_sends
 WHERE campaign = ${campaign}
 `;
 return new Set(rows.map((r) => r.email as string));
}

async function markEmailsAsSent(campaign: string, emails: string[]) {
 if (emails.length === 0) return;
 const sql = neon(getDatabaseUrl());
 for (const email of emails) {
 await sql`
 INSERT INTO email_campaign_sends (campaign, email)
 VALUES (${campaign}, ${email.toLowerCase()})
 ON CONFLICT (campaign, email) DO NOTHING
 `;
 }
}

async function getUnsentEmails(campaign: string): Promise<string[]> {
 const alreadySent = await getAlreadySentEmails(campaign);
 return POPUP_ATTENDEE_EMAILS.filter((e) => !alreadySent.has(e.toLowerCase()));
}

/**
 * POST /api/admin/send-popup-email
 *
 * { testEmail: "you@example.com" }: test send only, not tracked
 * { send: true }: sends only to people who haven't received this campaign yet
 * { preview: true }: returns counts without sending
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 await ensureSentTable();

 const body = await request.json().catch(() => ({}));
 const testEmail: string | undefined = body?.testEmail;
 const sendForReal: boolean = body?.send === true;
 const preview: boolean = body?.preview === true;
 const backfill: boolean = body?.backfill === true;

 if (!testEmail && !sendForReal && !preview) {
 return NextResponse.json(
 { error: "Provide { testEmail }, { send: true }, or { preview: true }." },
 { status: 400 }
 );
 }

 // Test send, not tracked so it won't block the real send later
 if (testEmail) {
 const { sent, failed } = await sendPopupThankYouEmail([testEmail]);
 return NextResponse.json({ success: true, test: true, testEmail, sent, failed });
 }

 const unsent = await getUnsentEmails(CAMPAIGN);

 if (preview) {
 const alreadySent = await getAlreadySentEmails(CAMPAIGN);
 return NextResponse.json({
 preview: true,
 campaign: CAMPAIGN,
 alreadySent: alreadySent.size,
 toSend: unsent.length,
 });
 }

 // Real send, only to people who haven't received this campaign
 if (unsent.length === 0) {
 return NextResponse.json({ success: true, message: "Everyone has already been sent this email.", sent: 0 });
 }

 const { sent, failed } = await sendPopupThankYouEmail(unsent);

 // Mark successfully sent emails (approximate: mark all unsent since we don't get per-email status back)
 await markEmailsAsSent(CAMPAIGN, unsent);

 return NextResponse.json({ success: true, campaign: CAMPAIGN, toSend: unsent.length, sent, failed });
}
