import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/app/lib/settings-db";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${adminPassword}`) return true;
  const token = request.cookies.get("via_admin_token")?.value;
  return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";
const GROUPS = ["NEXT_PAYOUT", "IN_HOLDING_PERIOD", "PAYOUT_REQUESTED", "CREATOR_ACTION_REQUIRED", "PAID_OUT"];

// GET /api/admin/collabs-commission-lookup?commissionId=16327811&partnershipName=Scarz+Vintage
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commissionId = request.nextUrl.searchParams.get("commissionId");
  const partnershipName = request.nextUrl.searchParams.get("partnershipName");

  if (!commissionId) return NextResponse.json({ error: "commissionId required" }, { status: 400 });

  const [cookie, csrfToken, collabsDataRaw] = await Promise.all([
    getSetting("collabs_cookie"),
    getSetting("collabs_csrf_token"),
    getSetting("collabs_data"),
  ]);

  if (!cookie || !csrfToken) {
    return NextResponse.json({ error: "No Collabs credentials stored" }, { status: 400 });
  }

  // Find the partnership ID from stored snapshot
  let partnershipId: string | null = null;
  if (collabsDataRaw) {
    try {
      const collabsData = JSON.parse(collabsDataRaw) as Array<{ id: string; name: string }>;
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = partnershipName
        ? collabsData.find((p) => normalize(p.name) === normalize(partnershipName))
        : null;
      partnershipId = match?.id ?? null;

      // If no name match, we'll search all partnerships
      if (!partnershipId) {
        // Try all partnerships — return their IDs and names for debugging
        const ids = collabsData.map((p) => ({ id: p.id, name: p.name }));
        // Use all of them in our search below
        const headers = {
          "content-type": "application/json",
          cookie,
          "x-csrf-token": csrfToken,
          "origin": "https://collabs.shopify.com",
          "referer": "https://collabs.shopify.com/",
          "x-client-type": "web",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        };

        // Search each partnership for the commission
        for (const p of collabsData) {
          for (const group of GROUPS) {
            try {
              const res = await fetch(COLLABS_GRAPHQL_URL, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  query: `query {
                    payouts {
                      partnershipCommissions(group: ${group}, partnershipId: "${p.id}", first: 100) {
                        nodes {
                          id commissionUsd { amount } earnedAt lineItemTitle lineItemPrice { amount }
                          order { name total { amount currency } lineItems { nodes { title quantity price { amount } } } }
                        }
                      }
                    }
                  }`,
                }),
              });
              const json = await res.json();
              if (json.errors) continue;
              const nodes = json?.data?.payouts?.partnershipCommissions?.nodes ?? [];
              const found = nodes.find((n: { id: string }) =>
                n.id === commissionId ||
                n.id.endsWith(`/${commissionId}`) ||
                n.id === `gid://shopify/PartnershipCommission/${commissionId}`
              );
              if (found) {
                return NextResponse.json({
                  found: true,
                  partnership: { id: p.id, name: p.name },
                  group,
                  commission: {
                    id: found.id,
                    earnedAt: found.earnedAt,
                    commissionUsd: found.commissionUsd?.amount,
                    lineItemTitle: found.lineItemTitle ?? null,
                    lineItemPrice: found.lineItemPrice?.amount ?? null,
                    shopifyOrderName: found.order?.name ?? null,
                    orderTotal: found.order?.total ?? null,
                    lineItems: found.order?.lineItems?.nodes ?? null,
                  },
                });
              }
            } catch { continue; }
          }
        }

        return NextResponse.json({ found: false, searched: ids, commissionId });
      }
    } catch {}
  }

  if (!partnershipId) {
    return NextResponse.json({ error: "Could not find partnership. Pass partnershipName param or ensure collabs_data is populated." }, { status: 404 });
  }

  const headers = {
    "content-type": "application/json",
    cookie,
    "x-csrf-token": csrfToken,
    "origin": "https://collabs.shopify.com",
    "referer": "https://collabs.shopify.com/",
    "x-client-type": "web",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  };

  // Surface Collabs failures instead of hiding them: a stale cookie/CSRF token makes every
  // group query error, which otherwise looks identical to a genuine "not found".
  const collabsErrors: string[] = [];
  let nodesScanned = 0;
  for (const group of GROUPS) {
    try {
      const res = await fetch(COLLABS_GRAPHQL_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `query {
            payouts {
              partnershipCommissions(group: ${group}, partnershipId: "${partnershipId}", first: 100) {
                nodes {
                  id commissionUsd { amount } earnedAt lineItemTitle lineItemPrice { amount }
                  order { name total { amount currency } lineItems { nodes { title quantity price { amount } } } }
                }
              }
            }
          }`,
        }),
      });
      if (!res.ok) {
        collabsErrors.push(`${group}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      if (json.errors) {
        collabsErrors.push(`${group}: ${JSON.stringify(json.errors).slice(0, 300)}`);
        continue;
      }
      const nodes = json?.data?.payouts?.partnershipCommissions?.nodes ?? [];
      nodesScanned += nodes.length;
      const found = nodes.find((n: { id: string }) =>
        n.id === commissionId ||
        n.id.endsWith(`/${commissionId}`) ||
        n.id === `gid://shopify/PartnershipCommission/${commissionId}`
      );
      if (found) {
        return NextResponse.json({
          found: true,
          group,
          commission: {
            id: found.id,
            earnedAt: found.earnedAt,
            commissionUsd: found.commissionUsd?.amount,
            lineItemTitle: found.lineItemTitle ?? null,
            lineItemPrice: found.lineItemPrice?.amount ?? null,
            shopifyOrderName: found.order?.name ?? null,
            orderTotal: found.order?.total ?? null,
            lineItems: found.order?.lineItems?.nodes ?? null,
          },
        });
      }
    } catch (e) {
      collabsErrors.push(`${group}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }

  // If every group errored (and none returned data), it's almost certainly a stale Collabs
  // session (refresh collabs_cookie / collabs_csrf_token) — not a real miss.
  const likelyAuthFailure = collabsErrors.length === GROUPS.length && nodesScanned === 0;
  return NextResponse.json({
    found: false,
    partnershipId,
    commissionId,
    nodesScanned,
    likelyAuthFailure,
    collabsErrors: collabsErrors.length ? collabsErrors : undefined,
  });
}
