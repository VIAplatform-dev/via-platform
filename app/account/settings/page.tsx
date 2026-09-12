import { redirect } from "next/navigation";
import { auth } from "@/app/lib/auth";
import { neon } from "@neondatabase/serverless";
import { getReferralInfo } from "@/app/lib/pilot-db";
import Link from "next/link";
import AccountActions from "../AccountActions";
import InviteButton from "../InviteButton";

async function getUserSettings(userId: string) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return { notificationsEnabled: true, phone: "" };
  const sql = neon(url);
  const rows = await sql`SELECT notification_emails_enabled, phone FROM users WHERE id = ${userId}`;
  return {
    notificationsEnabled: rows[0]?.notification_emails_enabled !== false,
    phone: (rows[0]?.phone as string) || "",
  };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id!;
  const [settings, referralInfo] = await Promise.all([
    getUserSettings(userId),
    session.user.email ? getReferralInfo(session.user.email).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
      <div className="max-w-2xl mx-auto px-6 pt-8 pb-16">
        <Link
          href="/account"
          className="text-xs uppercase tracking-widest text-[#5D0F17]/40 hover:text-[#5D0F17] transition inline-block mb-8"
        >
          ← Account
        </Link>

        <h1 className="font-serif text-3xl mb-10">Settings</h1>

        <div className="space-y-8">
          {/* Invite */}
          <section className="border border-[#5D0F17]/15 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div>
              <h3 className="font-serif text-base mb-1">Invite a Friend</h3>
              <p className="text-xs text-[#5D0F17]/50 leading-relaxed">
                Know someone who&apos;d love VYA? Share the link and shop together.
              </p>
            </div>
            <div className="shrink-0 sm:w-44">
              <InviteButton referralCode={referralInfo?.referralCode ?? null} />
            </div>
          </section>

          {/* Feedback */}
          <section className="border border-[#5D0F17]/15 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div>
              <h3 className="font-serif text-base mb-1">Have feedback for us?</h3>
              <p className="text-xs text-[#5D0F17]/50 leading-relaxed">
                Submit your recommendations, we&apos;d love to hear from you.
              </p>
            </div>
            <div className="shrink-0 sm:w-44">
              <a
                href="https://form.typeform.com/to/ssrEgHZ1"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full border border-[#5D0F17] text-[#5D0F17] text-xs uppercase tracking-[0.15em] py-3 text-center hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition"
              >
                Send Feedback
              </a>
            </div>
          </section>

          {/* Account actions: phone, notifications, sign out, delete */}
          <AccountActions
            notificationsEnabled={settings.notificationsEnabled}
            initialPhone={settings.phone}
          />
        </div>
      </div>
    </main>
  );
}
