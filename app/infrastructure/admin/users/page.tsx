"use client";

import { useEffect, useState } from "react";

// Who at VYA can sign in to this workspace.
//
// The invite API and a page for it already existed at vyaplatform.com/admin/users — the LEGACY
// panel, on the other host. This workspace is where the owner actually works, and getvya.ai rewrites
// /admin/* here, so that page was simply unreachable from the place it was needed and admin could
// only be granted by curl.
//
// TWO LISTS, DELIBERATELY SEPARATE. "Should have access" is app/lib/admin-emails.ts — a code
// constant, reviewable in a diff, naming VYA's own people. "Accounts" is the database: who has
// actually accepted an invite and set a password. Being named in the first grants nothing; the
// gap between them is the actionable thing this page exists to close.

type Admin = { id: number; email: string; active: boolean; hasPassword: boolean; createdAt: string };

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [expected, setExpected] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The first read lives inside the effect, guarded by `active`, rather than in a callback the
  // effect then calls — the lint rule that objects to the latter is right that a setState reached
  // synchronously from an effect body cascades renders.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/users", { cache: "no-store" });
        if (!active) return;
        if (r.ok) {
          const d = await r.json();
          if (!active) return;
          setAdmins(d.admins || []);
          setExpected(d.expected || []);
        } else if (r.status === 401) {
          setErr("Sign in as an admin to manage admin access.");
        }
      } catch {
        if (active) setErr("Couldn't load admin access.");
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function invite(who: string) {
    const address = who.trim();
    if (!address) return;
    setBusy(address);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || "Couldn't send the invite.");
      else {
        setAdmins(d.admins || []);
        setMsg(`Invite emailed to ${d.invited}. They set their own password, then sign in with a code sent to that address.`);
        setEmail("");
      }
    } catch {
      setErr("Couldn't send the invite.");
    }
    setBusy(null);
  }

  async function remove(who: string) {
    setBusy(who);
    setErr(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: who }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d) setAdmins(d.admins || []);
    } catch {
      setErr("Couldn't remove them.");
    }
    setBusy(null);
  }

  const have = new Set(admins.map((a) => a.email.toLowerCase()));
  const missing = expected.filter((e) => !have.has(e.toLowerCase()));

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <h1 className="text-[26px] leading-tight text-stone-900" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
        Admin access
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-stone-500">
        Everyone here can sign in to this workspace and see every store. They set their own password
        from the invite, then sign in with a one-time code sent to their address.
      </p>

      {err ? <p className="mt-5 rounded-lg bg-red-50 px-3.5 py-3 text-[13px] text-red-800">{err}</p> : null}
      {msg ? <p className="mt-5 rounded-lg bg-stone-100 px-3.5 py-3 text-[13px] text-stone-700">{msg}</p> : null}

      {/* Named in code, no account yet — the one actionable gap. */}
      {missing.length > 0 && (
        <div className="mt-7 rounded-xl border border-stone-200 bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Should have access</p>
          <div className="mt-2 divide-y divide-stone-100">
            {missing.map((em) => (
              <div key={em} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-stone-900">{em}</p>
                  <p className="text-[12px] text-stone-400">No account yet</p>
                </div>
                <button
                  onClick={() => void invite(em)}
                  disabled={busy !== null}
                  className="shrink-0 rounded-lg bg-stone-900 px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
                >
                  {busy === em ? "Sending…" : "Send invite"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Accounts</p>
        {loading ? (
          <p className="mt-3 text-[13px] text-stone-400">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="mt-3 text-[13px] text-stone-400">
            Nobody has set a password yet. The shared admin password still works in the meantime.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-stone-900">{a.email}</p>
                  <p className="text-[12px] text-stone-400">
                    {a.active ? "Active" : a.hasPassword ? "Set up" : "Invited — waiting on their password"}
                  </p>
                </div>
                <button
                  onClick={() => void remove(a.email)}
                  disabled={busy !== null}
                  className="shrink-0 text-[12px] text-stone-400 transition hover:text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The other thing being on the code list buys you. Discoverable here because this is the
          page about VYA's own people; the flag is deliberately explicit so no ordinary visit to
          onboarding can fork a real store. */}
      <div className="mt-7 rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Testing the signup flow</p>
        <p className="mt-2 text-[13px] leading-relaxed text-stone-500">
          Anyone above can walk seller signup again, as many times as they like, even with a store
          already — just go to <span className="font-mono text-[12px]">/onboarding</span>. Each run
          builds a separate test store and switches you into it; your real store is untouched, and the
          shop name at the top of the sidebar switches you back.
        </p>
        <a
          href="/onboarding"
          className="mt-3 inline-block rounded-lg border border-stone-200 px-3.5 py-2 text-[12px] font-medium text-stone-700 transition hover:border-stone-400"
        >
          Run signup again →
        </a>
      </div>

      {/* Anyone not on the code list — a contractor, a temporary hand. */}
      <div className="mt-7 rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">Invite someone else</p>
        <div className="mt-2.5 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[14px] outline-none focus:border-stone-400"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void invite(email)}
            placeholder="name@vyaplatform.com"
          />
          <button
            onClick={() => void invite(email)}
            disabled={busy !== null || !email.trim()}
            className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-[12px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {busy === email.trim() ? "Sending…" : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
