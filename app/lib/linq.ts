// Linq — multi-channel messaging transport (iMessage / RCS / SMS) for OUTBOUND
// notifications only. We send exact content; protocol auto-selects (iMessage → RCS → SMS).
// ONE shared VYA number (LINQ_FROM_NUMBER) sends nudges like "[Store] new message";
// the conversation itself lives in the VYA inbox, so there's no inbound routing here.
// Fully dormant (no calls, no spend) until LINQ_API_KEY + LINQ_FROM_NUMBER are set.

const LINQ_API = "https://api.linqapp.com/api/partner/v3";

export function linqConfigured(): boolean {
 return Boolean(process.env.LINQ_API_KEY && process.env.LINQ_FROM_NUMBER);
}

// Normalize a US-ish phone to E.164. Returns null if it clearly isn't a phone.
export function toE164(raw: string | null | undefined): string | null {
 const s = (raw || "").trim();
 if (!s) return null;
 if (s.startsWith("+")) {
  const d = s.replace(/[^\d]/g, "");
  return d.length >= 8 ? `+${d}` : null;
 }
 const digits = s.replace(/\D/g, "");
 if (digits.length === 10) return `+1${digits}`;
 if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
 return digits.length >= 8 ? `+${digits}` : null;
}

// Send a text to one recipient. Best-effort — returns a result, never throws, and
// no-ops (ok:false, not_configured) when Linq isn't set up.
export async function sendLinqText(to: string, text: string): Promise<{ ok: boolean; detail?: string }> {
 const key = process.env.LINQ_API_KEY?.trim();
 const from = process.env.LINQ_FROM_NUMBER?.trim();
 if (!key || !from) return { ok: false, detail: "not_configured" };
 const dest = toE164(to);
 if (!dest) return { ok: false, detail: "bad_phone" };
 try {
  const res = await fetch(`${LINQ_API}/chats`, {
   method: "POST",
   headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
   body: JSON.stringify({ from, to: [dest], message: { parts: [{ type: "text", value: text }] } }),
   signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, detail: `http_${res.status}` };
  return { ok: true };
 } catch (e) {
  return { ok: false, detail: e instanceof Error ? e.message : String(e) };
 }
}
