import { neon } from "@neondatabase/serverless";
import { sendExpoPush, type PushPayload } from "./push";

// Reaching a shopper on her phone, from code that only knows her email address.
//
// THE GAP THIS CLOSES. Every shopper-facing notification VYA sends. New arrivals, a winback, a
// piece you looked at, a last chance, something trending. Is written as an EMAIL cron, and those
// crons identify people by email address. Push tokens are keyed by `user_id`. Nothing joined the
// two, so of a dozen scheduled notifications exactly one (notify-follows, which reads tokens
// directly) ever reached a phone. Someone with the app installed got the same inbox as someone
// without it, and none of the moments the app exists for.
//
// So: email in, devices out. Every email cron can now add two lines and also buzz the phone.
//
// PUSH IS AN ADDITION, NOT A REPLACEMENT. The email still sends. A phone is where she is, but a
// push is gone the moment it is swiped away, and an inbox is not.

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL");
  return neon(url);
}

/**
 * Registered devices for these email addresses, as `email -> tokens`.
 *
 * One query for the whole batch. A cron mailing four hundred people must not make four hundred
 * round trips to discover that nine of them have the app.
 */
export async function tokensByEmail(emails: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return out;

  try {
    const rows = (await db()`
      SELECT LOWER(u.email) AS email, t.token
      FROM users u
      JOIN user_push_tokens t ON t.user_id = u.id::text
      WHERE LOWER(u.email) = ANY(${wanted})
    `) as { email: string; token: string }[];
    for (const r of rows) {
      const list = out.get(r.email) ?? [];
      list.push(r.token);
      out.set(r.email, list);
    }
  } catch {
    /* allow-swallow: push is a courtesy. A DB blip must never stop the email that is already sending. */
  }
  return out;
}

/**
 * Push one person, found by email. Returns whether anything was sent, so a caller can log how
 * much of its audience it actually reached on a phone.
 */
export async function pushToEmail(email: string, payload: PushPayload): Promise<boolean> {
  const map = await tokensByEmail([email]);
  const tokens = map.get(email.trim().toLowerCase()) ?? [];
  if (tokens.length === 0) return false;
  await sendExpoPush(tokens, payload);
  return true;
}

/**
 * Push a whole audience at once, each person getting their own message.
 *
 * `build` returns null to skip somebody. A copy line that needs a piece name has nothing to say
 * when that person's list came back empty, and a push saying "undefined" is worse than silence.
 */
export async function pushToEmails<T extends { email: string }>(
  people: T[],
  build: (person: T) => PushPayload | null,
): Promise<number> {
  const map = await tokensByEmail(people.map((p) => p.email));
  let reached = 0;
  for (const person of people) {
    const tokens = map.get(person.email.trim().toLowerCase()) ?? [];
    if (tokens.length === 0) continue;
    const payload = build(person);
    if (!payload) continue;
    await sendExpoPush(tokens, payload);
    reached += 1;
  }
  return reached;
}

/** Does this person have the app? Useful for deciding how loud an email should be. */
export async function hasApp(email: string): Promise<boolean> {
  const map = await tokensByEmail([email]);
  return (map.get(email.trim().toLowerCase()) ?? []).length > 0;
}
