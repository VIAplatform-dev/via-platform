import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { getMobileUserId } from "@/app/lib/mobileAuth";
import { getUserTasteProfile, setUserTasteProfile, type TasteProfile } from "@/app/lib/taste-db";
import { VIBES, COLORS, ERAS, TASTE_CATEGORIES, TASTE_SIZE_GROUPS } from "@/app/lib/tasteVibes";
import { brands } from "@/app/lib/brandData";

export const dynamic = "force-dynamic";

const opt = (arr: { key: string; label: string }[]) => arr.map((v) => ({ key: v.key, label: v.label }));
const DESIGNERS = brands.map((b) => ({ key: b.slug, label: b.label }));
const VALID_DESIGNERS = new Set(brands.map((b) => b.slug));

const OPTIONS = {
 vibes: opt(VIBES),
 categories: opt(TASTE_CATEGORIES),
 colors: opt(COLORS),
 eras: opt(ERAS),
 designers: DESIGNERS,
 sizeGroups: TASTE_SIZE_GROUPS,
};

const EMPTY: TasteProfile = { vibes: [], sizes: [], categories: [], designers: [], colors: [], eras: [] };
const isTaken = (p: TasteProfile) => p.vibes.length + p.sizes.length + p.categories.length + p.designers.length + p.colors.length + p.eras.length > 0;

// GET: the user's saved taste profile + all the option sets for the quiz.
export async function GET(request: Request) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ ...EMPTY, taken: false, options: OPTIONS.vibes, sizeGroups: OPTIONS.sizeGroups, tasteOptions: OPTIONS });
 try {
 const p = await getUserTasteProfile(userId);
 return NextResponse.json({ ...p, taken: isTaken(p), options: OPTIONS.vibes, sizeGroups: OPTIONS.sizeGroups, tasteOptions: OPTIONS });
 } catch {
 return NextResponse.json({ ...EMPTY, taken: false, options: OPTIONS.vibes, sizeGroups: OPTIONS.sizeGroups, tasteOptions: OPTIONS });
 }
}

// POST: save any subset of taste dimensions. Body: { vibes?, sizes?, categories?,
// designers?, colors?, eras? }. Designers are validated against the catalog.
export async function POST(request: Request) {
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const body = await request.json().catch(() => ({}));
 const p = await setUserTasteProfile(userId, body, VALID_DESIGNERS);
 return NextResponse.json({ ...p, taken: isTaken(p) });
 } catch (err) {
 console.error("[taste] save error:", err);
 return NextResponse.json({ error: "Failed to save" }, { status: 500 });
 }
}
