/**
 * Pull the first complete JSON object out of a model reply.
 *
 * The old approach was `text.match(/\{[\s\S]*\}/)` — first "{" to LAST "}". That works until the
 * reply contains anything after the object: a markdown code fence, a closing note, a second example.
 * Then the captured string runs past the end of the JSON and `JSON.parse` throws, the valuation is
 * discarded, and the pricer silently substitutes a raw comp median. Observed live:
 *
 *   [pricing] FELL BACK: JSON.parse failed. chars=2709
 *     tail="…at the specialist ceiling.\"\n}\n```"
 *
 * The model had answered correctly. Three trailing backticks threw the answer away.
 *
 * This walks the text and returns the first BALANCED object instead, respecting strings and escapes
 * so a brace inside a rationale ("sizes {S,M}") can't end the scan early.
 */
export function extractFirstJsonObject(text: string): string | null {
 const s = text || "";
 const start = s.indexOf("{");
 if (start < 0) return null;

 let depth = 0, inString = false, escaped = false;
 for (let i = start; i < s.length; i++) {
  const ch = s[i];
  if (escaped) { escaped = false; continue; }
  if (ch === "\\") { if (inString) escaped = true; continue; }
  if (ch === '"') { inString = !inString; continue; }
  if (inString) continue;
  if (ch === "{") depth++;
  else if (ch === "}") {
   depth--;
   if (depth === 0) return s.slice(start, i + 1);
  }
 }
 return null; // genuinely truncated — no balanced object to salvage
}

/** Parse the first JSON object in a model reply, or null. Never throws. */
export function parseFirstJsonObject<T = unknown>(text: string): T | null {
 const raw = extractFirstJsonObject(text);
 if (!raw) return null;
 try { return JSON.parse(raw) as T; } catch { return null; }
}
