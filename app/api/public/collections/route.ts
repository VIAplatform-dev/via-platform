import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { COLLECTIONS } from "@/app/lib/collections-config";
import { getAllCollectionPicks } from "@/app/lib/editors-picks-db";

export const dynamic = "force-dynamic";

/**
 * Public collections list for the mobile app.
 * Returns the editorial collections + their first product image as a cover.
 */
export async function GET(request: Request) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 try {
 const picks = await getAllCollectionPicks();

 const collections = COLLECTIONS
 .map((col) => {
  const colPicks = picks[col.slug] ?? [];
  // The collection's own editorial art where it has some, otherwise its first piece. A commissioned
  // cover says what a collection IS; a product photo only says what happens to be first in it.
  const coverImage = (col as { image?: string }).image ?? colPicks[0]?.product?.image ?? null;
  return {
  slug: col.slug,
  name: col.name,
  curatedBy: col.curatedBy,
  description: col.description,
  coverImage,
  itemCount: colPicks.length,
  };
 })
 .filter((c) => c.itemCount > 0);

 return NextResponse.json({ collections });
 } catch {
 return NextResponse.json({ collections: [] });
 }
}
