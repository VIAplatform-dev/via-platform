"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type EmailEntry = {
  email: string;
  signupDate: string;
  source?: string;
};

export default function EmailsAdminPage() {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  useEffect(() => {
    async function fetchEmails() {
      try {
        const res = await fetch("/api/newsletter");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setEmails(data.emails || []);
      } catch (err) {
        setError("Failed to load emails");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchEmails();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const exportToCSV = () => {
    if (emails.length === 0) return;

    const headers = ["Email", "Signup Date", "Source"];
    const rows = emails.map((e) => [
      e.email,
      formatDate(e.signupDate),
      e.source || "website",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `via-emails-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <main className="bg-white min-h-screen text-black">
      {/* Header */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-12 sm:py-20">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <Link
                href="/admin/sync"
                className="text-neutral-400 hover:text-black transition-colors min-h-[44px] flex items-center"
              >
                Sync
              </Link>
              <span className="text-neutral-300">/</span>
              <Link
                href="/admin/analytics"
                className="text-neutral-400 hover:text-black transition-colors min-h-[44px] flex items-center"
              >
                Analytics
              </Link>
              <span className="text-neutral-300">/</span>
              <span className="text-black">Emails</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-neutral-400 hover:text-black transition-colors"
            >
              Logout
            </button>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif mb-3 sm:mb-4">
            Email Signups
          </h1>
          <p className="text-neutral-600 text-base sm:text-lg">
            Manage newsletter subscribers and waitlist signups.
          </p>
        </div>
      </section>

      {/* Stats & Actions */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-3xl font-serif">{emails.length}</p>
              <p className="text-sm text-neutral-500">Total signups</p>
            </div>
            {emails.length > 0 && (
              <div className="hidden sm:block">
                <p className="text-lg font-serif">
                  {formatDate(emails[emails.length - 1]?.signupDate)}
                </p>
                <p className="text-sm text-neutral-500">Latest signup</p>
              </div>
            )}
          </div>
          <button
            onClick={exportToCSV}
            disabled={emails.length === 0}
            className="px-6 py-3 min-h-[48px] border border-black text-sm uppercase tracking-wide hover:bg-black hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </section>

      {/* Content */}
      {loading ? (
        <div className="max-w-7xl mx-auto px-6 py-16 text-center text-neutral-500">
          Loading emails...
        </div>
      ) : error ? (
        <div className="max-w-7xl mx-auto px-6 py-16 text-center text-red-600">
          {error}
        </div>
      ) : emails.length === 0 ? (
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="border border-dashed border-neutral-300 p-8 text-center">
            <p className="text-neutral-500 mb-2">No email signups yet.</p>
            <p className="text-sm text-neutral-400">
              Signups will appear here once visitors subscribe.
            </p>
          </div>
        </div>
      ) : (
        <section className="py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="border border-neutral-200">
              {/* Desktop Header */}
              <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Email</div>
                <div className="col-span-4">Signup Date</div>
                <div className="col-span-2">Source</div>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {emails
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <div
                      key={entry.email}
                      className="px-4 sm:px-6 py-4 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                    >
                      {/* Mobile Layout */}
                      <div className="sm:hidden">
                        <p className="font-medium truncate">{entry.email}</p>
                        <div className="flex items-center justify-between mt-1 text-xs text-neutral-500">
                          <span>{formatDate(entry.signupDate)}</span>
                          <span className="capitalize">
                            {entry.source || "website"}
                          </span>
                        </div>
                      </div>
                      {/* Desktop Layout */}
                      <div className="hidden sm:grid grid-cols-12 gap-4 text-sm">
                        <div className="col-span-1 text-neutral-400">
                          {emails.length - index}
                        </div>
                        <div className="col-span-5 truncate">{entry.email}</div>
                        <div className="col-span-4 text-neutral-500">
                          {formatDate(entry.signupDate)}
                        </div>
                        <div className="col-span-2 text-neutral-500 capitalize">
                          {entry.source || "website"}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Admin Navigation */}
      <section className="border-t border-neutral-200 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap gap-4 sm:gap-6 text-sm">
            <Link
              href="/admin/sync"
              className="text-neutral-500 hover:text-black transition-colors min-h-[44px] flex items-center"
            >
              Inventory Sync
            </Link>
            <Link
              href="/admin/analytics"
              className="text-neutral-500 hover:text-black transition-colors min-h-[44px] flex items-center"
            >
              Analytics
            </Link>
            <span className="text-black min-h-[44px] flex items-center">
              Emails
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
