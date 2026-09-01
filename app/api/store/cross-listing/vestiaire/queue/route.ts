import { NextRequest } from "next/server";
import { queueForPlatform } from "@/app/lib/cross-listing-handlers";

export const dynamic = "force-dynamic";

/** Queue a piece for Vestiaire. The shared handler is in cross-listing-handlers.ts. */
export async function POST(request: NextRequest) {
 return queueForPlatform(request, "vestiaire");
}
