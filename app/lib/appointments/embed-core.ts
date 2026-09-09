// ───────────────────────────────────────────────────────────────────────────
// Booking links that can be shown as a SCHEDULE rather than a link.
//
// A shop pasting its Calendly shouldn't send shoppers to a different website to pick a time —
// every hand-off loses people. The big scheduling tools all support being framed, so where we can
// recognise one we show the real calendar in place; where we can't, we fall back to a button, which
// is the honest outcome for an arbitrary URL that may refuse to be framed.
//
// Pure and unit-tested, in the same shape as backgroundEmbedSrc in storefront-blocks.
// ───────────────────────────────────────────────────────────────────────────

export type BookingProvider = "calendly" | "cal.com" | "google" | "acuity";
export type BookingEmbed = { provider: BookingProvider; src: string; minHeight: number };

/** Add a query param without disturbing one that's already there. */
function withParam(url: string, key: string, value: string): string {
 if (new RegExp(`[?&]${key}=`).test(url)) return url;
 return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}

/**
 * Turn a booking link into something framable, or null when we don't recognise it.
 *
 * Null is not a failure — it means "show the button instead", which is right for a URL whose site
 * may well send X-Frame-Options and leave a shopper staring at an empty box.
 */
export function bookingEmbed(rawUrl: string | null | undefined): BookingEmbed | null {
 const url = (rawUrl || "").trim();
 if (!/^https?:\/\//i.test(url)) return null;
 let host: string;
 try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }

 // Calendly: any scheduling link frames cleanly. Inline mode drops its own page chrome.
 if (host === "calendly.com") {
  let src = withParam(url, "embed_type", "Inline");
  src = withParam(src, "hide_gdpr_banner", "1");
  return { provider: "calendly", src, minHeight: 700 };
 }

 // Cal.com, including self-hosted subdomains (app.cal.com, book.acme.cal.com).
 if (host === "cal.com" || host.endsWith(".cal.com")) {
  return { provider: "cal.com", src: withParam(url, "embed", "true"), minHeight: 700 };
 }

 // Google: an appointment schedule, or a calendar someone already embedded.
 if (host === "calendar.google.com") {
  // Google hands out /calendar/u/0/appointments/schedules/… when you're signed into more than one
  // account, and /calendar/appointments/schedules/… when you aren't. Both are the same page.
  if (/\/calendar\/(?:u\/\d+\/)?appointments\/schedules\//.test(url)) {
   return { provider: "google", src: withParam(url, "gv", "true"), minHeight: 640 };
  }
  if (/\/calendar\/embed/.test(url)) return { provider: "google", src: url, minHeight: 600 };
  return null; // a personal calendar URL isn't a booking page
 }

 // Acuity / Squarespace Scheduling — both frame, and both are common with small shops.
 if (host === "app.acuityscheduling.com" || host.endsWith(".as.me") || host.endsWith(".acuityscheduling.com")) {
  return { provider: "acuity", src: url, minHeight: 800 };
 }

 return null;
}

const LABEL: Record<BookingProvider, string> = {
 calendly: "Calendly", "cal.com": "Cal.com", google: "Google Calendar", acuity: "Acuity",
};
export const providerLabel = (p: BookingProvider) => LABEL[p];
