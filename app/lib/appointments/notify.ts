// ───────────────────────────────────────────────────────────────────────────
// Everything an appointment sends.
//
// One module, because a booking has three audiences and they are easy to half-build: the CUSTOMER
// (a confirmation they can find again), the STORE (a to-do — someone is coming, or is waiting on an
// answer), and the store's own EMAIL FLOWS (whatever they wrote themselves, fired through the same
// automation engine as every other trigger).
//
// Every send is best-effort and awaited nowhere that matters: a mail outage must never lose a
// booking that is already in the diary.
// ───────────────────────────────────────────────────────────────────────────
import { sendStoreBrandedTransactional, sendStoreOwnerAlert, ownerAlertButton, osAdminUrl } from "@/app/lib/email";
import { fireAutomationTrigger } from "@/app/lib/automation-engine";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import type { Appointment } from "./appointments-db";
import type { AppointmentSettings } from "./settings-core";

const DIARY_URL = osAdminUrl("/appointments");

/** "Thursday, 11 September" — the store's clock, which is the only one either party is thinking in. */
export function longDate(day: string): string {
 return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
 });
}
/** 24h "14:30" → "2:30 PM". Shops write their hours in 24h; nobody reads a confirmation that way. */
export function clockTime(t: string): string {
 const [h, m] = t.split(":").map(Number);
 if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
 const ampm = h < 12 ? "AM" : "PM";
 return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
}
export const when = (a: Pick<Appointment, "day" | "start">) => `${longDate(a.day)} at ${clockTime(a.start)}`;

const money = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

/**
 * The variables a store can drop into its own appointment emails. Kept in one place so the
 * settings screen can list exactly what will work — an automation that silently fills {{when}}
 * with nothing is worse than one that never offered it.
 */
export const APPOINTMENT_VARS = ["name", "store", "date", "time", "when", "type", "note"] as const;

export function appointmentVars(a: Appointment, storeName: string): Record<string, string> {
 return {
  name: a.customerName || "there",
  store: storeName,
  date: longDate(a.day),
  time: clockTime(a.start),
  when: when(a),
  type: a.kind,
  note: a.note || "",
 };
}

async function storeName(storeSlug: string): Promise<string> {
 const sender = await resolveStoreSender(storeSlug).catch(() => null);
 return sender?.fromName || storeSlug;
}

/** Fire a store's own flows for an appointment event. Silent when they've written none. */
async function fireFlows(storeSlug: string, trigger: string, a: Appointment): Promise<void> {
 if (!a.customerEmail) return;
 const name = await storeName(storeSlug);
 await fireAutomationTrigger(storeSlug, trigger, { email: a.customerEmail, name: a.customerName }, appointmentVars(a, name))
  .catch(() => 0);
}

/**
 * Someone booked.
 *
 * Two different emails, because the two sides need different things: the customer needs the time
 * written down and to know whether it's settled; the store needs to know a stranger is coming and,
 * when it approves bookings, that one is waiting.
 */
export async function notifyAppointmentBooked(
 storeSlug: string,
 a: Appointment,
 settings: AppointmentSettings,
): Promise<void> {
 const name = await storeName(storeSlug).catch(() => storeSlug);
 const pending = a.status === "pending";

 if (a.customerEmail) {
  const lines = [
   `Hi ${a.customerName || "there"},`,
   "",
   pending
    ? `Thanks for asking for a time with ${name}. Here's what you've requested:`
    : `You're booked in with ${name}. Here are the details:`,
   "",
   `${a.kind} — ${when(a)}`,
   ...(a.note ? ["", `You told us: ${a.note}`] : []),
   "",
   pending
    ? "We'll email you the moment it's confirmed — your slot is held until then."
    : "See you then. Just reply to this email if anything changes.",
   ...(a.depositCents > 0
    ? ["", settings.depositCredits
      ? `Your ${money(a.depositCents)} deposit comes off anything you buy on the day.`
      : `Your ${money(a.depositCents)} deposit holds the slot.`]
    : []),
  ];
  await sendStoreBrandedTransactional(storeSlug, {
   to: a.customerEmail,
   subject: pending ? `Your appointment request — ${longDate(a.day)}` : `You're booked: ${when(a)}`,
   body: lines.join("\n"),
  }).catch((e) => console.error("[appointments] customer confirmation failed", a.id, e));
 }

 if (settings.notifyOnBooking) {
  const who = esc(a.customerName || a.customerEmail || "Someone");
  await sendStoreOwnerAlert(storeSlug, {
   to: settings.notifyEmail,
   subject: pending ? `Appointment to approve: ${who}, ${longDate(a.day)}` : `New appointment: ${who}, ${longDate(a.day)}`,
   html: `<p><b>${who}</b> ${pending ? "asked for" : "booked"} <b>${esc(a.kind)}</b> on <b>${esc(when(a))}</b>.</p>
   ${a.customerEmail ? `<p>${esc(a.customerEmail)}${a.customerPhone ? ` · ${esc(a.customerPhone)}` : ""}</p>` : ""}
   ${a.note ? `<p><i>“${esc(a.note)}”</i></p>` : ""}
   ${a.depositCents > 0 ? `<p>Deposit ${money(a.depositCents)} — ${a.depositPaid ? "paid" : "not yet paid"}.</p>` : ""}
   <p>${ownerAlertButton(DIARY_URL, pending ? "Approve or decline" : "Open your diary")}</p>`,
  });
 }

 await fireFlows(storeSlug, "appointment_booked", a);
}

/** The store answered. Only the customer needs this one — the store is the one who just clicked. */
export async function notifyAppointmentDecision(
 storeSlug: string,
 a: Appointment,
 status: "booked" | "cancelled",
): Promise<void> {
 if (!a.customerEmail) return;
 const name = await storeName(storeSlug).catch(() => storeSlug);
 const confirmed = status === "booked";
 const body = confirmed
  ? [`Hi ${a.customerName || "there"},`, "", `${name} has confirmed your appointment:`, "", `${a.kind} — ${when(a)}`, "", "See you then. Reply to this email if you need to move it."].join("\n")
  : [`Hi ${a.customerName || "there"},`, "", `${name} can't make ${when(a)} after all, so that appointment has been cancelled.`, "", "Reply to this email and we'll find another time."].join("\n");

 await sendStoreBrandedTransactional(storeSlug, {
  to: a.customerEmail,
  subject: confirmed ? `Confirmed: ${when(a)}` : `Cancelled: ${when(a)}`,
  body,
 }).catch((e) => console.error("[appointments] decision email failed", a.id, e));

 await fireFlows(storeSlug, confirmed ? "appointment_confirmed" : "appointment_cancelled", a);
}

/**
 * The nudge before the day. Sent by the cron, at whatever lead time the store set.
 *
 * The store's own flows fire alongside it, so a shop that wrote "bring the dress you're matching"
 * gets that sent too rather than instead.
 */
export async function notifyAppointmentReminder(storeSlug: string, a: Appointment): Promise<void> {
 if (!a.customerEmail) return;
 const name = await storeName(storeSlug).catch(() => storeSlug);
 await sendStoreBrandedTransactional(storeSlug, {
  to: a.customerEmail,
  subject: `Reminder: ${when(a)}`,
  body: [
   `Hi ${a.customerName || "there"},`,
   "",
   `A quick reminder about your appointment with ${name}:`,
   "",
   `${a.kind} — ${when(a)}`,
   "",
   "Reply to this email if you need to move it.",
  ].join("\n"),
 }).catch((e) => console.error("[appointments] reminder failed", a.id, e));

 await fireFlows(storeSlug, "appointment_reminder", a);
}
