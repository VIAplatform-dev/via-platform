import { NextRequest } from "next/server";
import { markListedOnPlatform } from "@/app/lib/cross-listing-handlers";

export const dynamic = "force-dynamic";

/** The extension reporting a Vestiaire listing went live. */
export async function POST(request: NextRequest) {
 return markListedOnPlatform(request, "vestiaire");
}
