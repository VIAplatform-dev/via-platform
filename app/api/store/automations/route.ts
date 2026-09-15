import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getAutomations, setBuiltinEnabled, setCustomEnabled, addCustomAutomation, removeCustomAutomation, CUSTOM_TRIGGERS } from "@/app/lib/automations-db";

export const dynamic = "force-dynamic";

// GET: built-in flows (with on/off state) + the store's custom automations.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, ...(await getAutomations(slug)), triggers: CUSTOM_TRIGGERS });
}

// PATCH { kind, key|id, enabled }: toggle a built-in flow or a custom automation.
export async function PATCH(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const enabled = b?.enabled !== false;
 if (b?.kind === "builtin" && typeof b?.key === "string") await setBuiltinEnabled(slug, b.key, enabled);
 else if (b?.kind === "custom" && Number.isFinite(Number(b?.id))) await setCustomEnabled(slug, Number(b.id), enabled);
 else return NextResponse.json({ error: "Bad request" }, { status: 400 });
 return NextResponse.json({ ok: true, ...(await getAutomations(slug)) });
}

// POST { name, trigger, subject, body }. Create a custom automation.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const name = String(b?.name || "").trim();
 const trigger = String(b?.trigger || "").trim();
 const subject = String(b?.subject || "").trim();
 const body = String(b?.body || "").trim();
 if (!name || !trigger || !subject || !body) return NextResponse.json({ error: "Name, trigger, subject, and message are all required." }, { status: 400 });
 if (!CUSTOM_TRIGGERS.some((t) => t.value === trigger)) return NextResponse.json({ error: "Unknown trigger." }, { status: 400 });
 await addCustomAutomation(slug, { name, trigger, subject, body });
 return NextResponse.json({ ok: true, ...(await getAutomations(slug)) });
}

// DELETE { id }: remove a custom automation.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 if (!Number.isFinite(Number(b?.id))) return NextResponse.json({ error: "Bad request" }, { status: 400 });
 await removeCustomAutomation(slug, Number(b.id));
 return NextResponse.json({ ok: true, ...(await getAutomations(slug)) });
}
