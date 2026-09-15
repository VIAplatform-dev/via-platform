// Client-side helper to read the acquisition channel that GlobalPageTracker
// captured on page load (utm_source / referrer / in-app-browser inference).
//
// Waitlist + giveaway signups have no `users` row yet, so there's no utm_visits
// row to join on. The channel we record at signup time is the ONLY acquisition
// signal we get for them. Without this they all defaulted to the form name
// ("waitlist" / "giveaway_modal"), which reads as "unknown" on the customer page.

function readSource(): string | null {
 if (typeof window === "undefined") return null;
 // Primary: the in-session window global the tracker sets. This is the ONLY
 // channel that survives Instagram/TikTok in-app browsers, which block
 // session/localStorage: exactly the /IG and /TT bio-link traffic we most need
 // to attribute. Without this they all fell back to the form name ("waitlist").
 try {
  const w = (window as unknown as { __viaUtmSource?: string }).__viaUtmSource;
  if (w && typeof w === "string") return w;
 } catch {}
 // Secondary: the full payload the tracker writes for the current tab/session.
 try {
  const raw = sessionStorage.getItem("via_utm_data");
  if (raw) {
   const d = JSON.parse(raw);
   if (d?.utm_source) return String(d.utm_source);
  }
 } catch {}
 // Fallback: the 30-day localStorage copy (survives across tabs, e.g. a magic
 // link opened in a new tab of the same browser).
 try {
  const raw = localStorage.getItem("via_utm");
  if (raw) {
   const d = JSON.parse(raw);
   if (d?.utm_source) return String(d.utm_source);
  }
 } catch {}
 return null;
}

// Returns the real acquisition channel when we captured a meaningful one
// (instagram, tiktok, a referrer, …); otherwise the form-specific fallback so
// we at least know which surface they signed up through.
export function acquisitionSource(fallback: string): string {
 const s = readSource();
 if (s && s !== "direct") return s;
 return fallback;
}
