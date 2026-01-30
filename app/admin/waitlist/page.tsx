"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface EmailEntry {
  email: string;
  signupDate: string;
  source?: string;
}

export default function AdminWaitlistPage() {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [addMessage, setAddMessage] = useState("");

  const fetchEmails = async () => {
    try {
      const res = await fetch("/api/waitlist");
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (err) {
      console.error("Failed to fetch waitlist:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setAddStatus("loading");
    setAddMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, source: "manual" }),
      });

      const data = await res.json();

      if (res.ok) {
        setAddStatus("success");
        setAddMessage(data.message);
        setNewEmail("");
        fetchEmails();
        setTimeout(() => {
          setAddStatus("idle");
          setAddMessage("");
        }, 2000);
      } else {
        setAddStatus("error");
        setAddMessage(data.error || "Failed to add email");
      }
    } catch {
      setAddStatus("error");
      setAddMessage("Failed to add email");
    }
  };

  const handleExportCSV = () => {
    if (emails.length === 0) return;

    const header = "email,signup_date,source";
    const rows = emails.map(
      (e) => `${e.email},${e.signupDate},${e.source || "waitlist"}`
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `via-waitlist-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-serif mb-1">Waitlist</h1>
            <p className="text-neutral-500 text-sm">
              {loading ? "Loading..." : `${emails.length} email${emails.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              disabled={emails.length === 0}
              className="px-4 py-2 border border-black text-sm uppercase tracking-wide hover:bg-black hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <Link
              href="/admin/sync"
              className="px-4 py-2 text-sm text-neutral-500 hover:text-black transition"
            >
              Admin Home
            </Link>
          </div>
        </div>

        {/* Add Email Form */}
        <div className="mb-8 p-6 bg-neutral-50 border border-neutral-200">
          <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-4">
            Add Email Manually
          </h2>
          <form onSubmit={handleAddEmail} className="flex gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (addStatus === "error") setAddStatus("idle");
              }}
              placeholder="email@example.com"
              required
              className="flex-1 px-4 py-3 border border-neutral-200 text-sm outline-none focus:border-black transition-colors"
            />
            <button
              type="submit"
              disabled={addStatus === "loading" || !newEmail.trim()}
              className="px-6 py-3 bg-black text-white text-sm uppercase tracking-wide hover:bg-neutral-800 transition disabled:opacity-50"
            >
              {addStatus === "loading" ? "Adding..." : "Add"}
            </button>
          </form>
          {addMessage && (
            <p className={`text-sm mt-2 ${addStatus === "error" ? "text-red-600" : "text-green-600"}`}>
              {addMessage}
            </p>
          )}
        </div>

        {/* Email Table */}
        {loading ? (
          <p className="text-neutral-500 text-center py-12">Loading...</p>
        ) : emails.length === 0 ? (
          <p className="text-neutral-500 text-center py-12">No emails yet.</p>
        ) : (
          <div className="border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-normal">
                    #
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-normal">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-normal">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-normal">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {emails.map((entry, i) => (
                  <tr
                    key={entry.email}
                    className="border-b border-neutral-100 last:border-b-0"
                  >
                    <td className="px-4 py-3 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-3">{entry.email}</td>
                    <td className="px-4 py-3 text-neutral-500">
                      {new Date(entry.signupDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {entry.source || "waitlist"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
