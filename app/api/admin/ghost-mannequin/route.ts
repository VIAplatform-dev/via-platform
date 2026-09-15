import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Prototype: convert an on-model product photo into a ghost-mannequin cover image
// using Photoroom's Image Editing API (the same effect sprl.shop uses. Body removed,
// garment shape reconstructed, clean background). This is a throwaway evaluation tool
// so we can judge quality before wiring it into the product pipeline.
//
// Setup: add PHOTOROOM_API_KEY to the environment. Then, signed into admin, open
//   /api/admin/ghost-mannequin
// paste a product image URL (garment on a model) and compare the result.

export const runtime = "nodejs";
export const maxDuration = 60;

const PHOTOROOM_ENDPOINT = "https://image-api.photoroom.com/v2/edit";

function isAdminAuthenticated(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 return !!adminToken && adminToken === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

function esc(s: string): string {
 return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// SSRF guard: this endpoint fetches a caller-supplied URL server-side. Even though it's
// admin-gated, restrict it to public https hosts so it can't be used to reach internal
// services or cloud metadata (169.254.169.254, localhost, private IP ranges).
function isSafePublicHttpUrl(raw: string): boolean {
 let u: URL;
 try { u = new URL(raw); } catch { return false; }
 if (u.protocol !== "https:") return false;
 const host = u.hostname.toLowerCase();
 if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") return false;
 if (host.includes(":")) return false; // IPv6 literal (::1, fc00::/7, etc.): reject
 const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if (v4) {
  const a = Number(v4[1]), b = Number(v4[2]);
  if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
 }
 return true;
}

async function generate(srcBlob: Blob, prompt: string | null, size: string | null): Promise<
 { ok: true; png: ArrayBuffer } | { ok: false; status: number; detail: string }
> {
 const apiKey = process.env.PHOTOROOM_API_KEY;
 if (!apiKey) return { ok: false, status: 500, detail: "PHOTOROOM_API_KEY not set in the environment" };

 const form = new FormData();
 form.append("imageFile", srcBlob, "input.png");
 form.append("ghostMannequin.mode", "ai.auto");
 if (prompt) form.append("ghostMannequin.prompt", prompt);
 if (size) form.append("ghostMannequin.size", size);

 const res = await fetch(PHOTOROOM_ENDPOINT, {
  method: "POST",
  headers: { "x-api-key": apiKey },
  body: form,
 });
 if (!res.ok) {
  const detail = await res.text().catch(() => "");
  return { ok: false, status: res.status, detail: detail.slice(0, 600) || res.statusText };
 }
 return { ok: true, png: await res.arrayBuffer() };
}

export async function GET(request: NextRequest) {
 if (!isAdminAuthenticated(request)) {
  return new NextResponse("Unauthorized. Open this while signed into the admin.", { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const url = searchParams.get("url");
 const raw = searchParams.get("raw");
 const prompt = searchParams.get("prompt");
 const size = searchParams.get("size");

 // No image yet → show the input form.
 if (!url) {
  return new NextResponse(formPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
 }

 // raw=1 → fetch the source image, run it through Photoroom, stream back the PNG.
 if (raw === "1") {
  if (!isSafePublicHttpUrl(url)) {
   return new NextResponse("Blocked: only public https image URLs are allowed.", { status: 400 });
  }
  let srcBlob: Blob;
  try {
   const srcRes = await fetch(url, { headers: { Accept: "image/*" } });
   if (!srcRes.ok) return new NextResponse(`Failed to fetch source image (${srcRes.status})`, { status: 502 });
   srcBlob = await srcRes.blob();
  } catch (e) {
   return new NextResponse(`Error fetching source image: ${String(e)}`, { status: 502 });
  }
  const result = await generate(srcBlob, prompt, size);
  if (!result.ok) {
   return new NextResponse(`Photoroom error ${result.status}: ${result.detail}`, { status: result.status });
  }
  return new NextResponse(Buffer.from(result.png), {
   headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
 }

 // Otherwise → side-by-side comparison page.
 return new NextResponse(comparePage(url, prompt, size), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function shell(body: string): string {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ghost Mannequin prototype</title>
<style>
 body{font-family:-apple-system,system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 16px;color:#18181b}
 h1{font-size:22px} label{font-weight:600;display:block;margin:14px 0 6px}
 input{width:100%;padding:10px;font-size:15px;border:1px solid #d4d4d8;border-radius:8px;box-sizing:border-box}
 button{margin-top:14px;padding:10px 18px;font-size:15px;border:0;border-radius:8px;background:#18181b;color:#fff;cursor:pointer}
 .hint{color:#71717a;font-size:13px;margin-top:24px;line-height:1.6}
 .row{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
 .col{flex:1;min-width:300px} .col h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#71717a}
 img{width:100%;border-radius:10px;border:1px solid #eee;background:#fafafa}
 a{color:#2563eb} .err{color:#b91c1c;font-size:14px}
</style></head><body>${body}</body></html>`;
}

function formPage(): string {
 return shell(`<h1>Ghost Mannequin prototype</h1>
<p>Paste a product image URL (a garment shown <strong>on a model</strong>). It'll be converted into a ghost-mannequin cover via Photoroom. Body removed, garment shape kept, clean background.</p>
<label for="u">On-model image URL</label>
<input id="u" placeholder="https://….jpg">
<label for="p">Optional style prompt</label>
<input id="p" placeholder="e.g. neutral light-grey background, soft shadow">
<button onclick="go()">Generate</button>
<p class="hint">Requires <code>PHOTOROOM_API_KEY</code> in the environment. Generation takes ~10–30s. Tip: on the live site, right-click a product photo → “Copy Image Address”.</p>
<script>function go(){var u=document.getElementById('u').value.trim();if(!u)return;var p=document.getElementById('p').value.trim();var q='?url='+encodeURIComponent(u);if(p)q+='&prompt='+encodeURIComponent(p);location.href=q;}</script>`);
}

function comparePage(url: string, prompt: string | null, size: string | null): string {
 let rawSrc = "?url=" + encodeURIComponent(url) + "&raw=1";
 if (prompt) rawSrc += "&prompt=" + encodeURIComponent(prompt);
 if (size) rawSrc += "&size=" + encodeURIComponent(size);
 return shell(`<h1>Ghost Mannequin</h1>
<div class="row">
 <div class="col"><h2>Original (on model)</h2><img src="${esc(url)}" alt="original"></div>
 <div class="col"><h2>Generated (ghost mannequin)</h2><img src="${esc(rawSrc)}" alt="generated" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<p class=err>Generation failed. Check PHOTOROOM_API_KEY and the server logs.</p>')"></div>
</div>
<p style="margin-top:18px"><a href="?">← try another image</a></p>`);
}
