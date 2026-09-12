import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { createSiteBuilderTables, siteBuilderTablesReady } from "@/app/lib/site-builder/pages-db";

export const dynamic = "force-dynamic";

// THE BUILDER'S TABLES, CREATED ONCE, BY THE OWNER.
//
// Most of this schema is self-healing DDL that runs on first use. That rule is wrong here: the dev
// server points at the PRODUCTION database, so "created on first request" means a developer opening
// a page runs DDL against live stores. So the builder's tables are created only from here, only by an
// admin, and only when asked — and every feature that needs them fails soft until then (a seller sees
// "not switched on yet"; a shopper's page is served exactly as it always was).
//
// Idempotent: CREATE TABLE IF NOT EXISTS. Running it twice does nothing the second time.
//
// GET  → whether the tables are there yet.
// POST → create them.

export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, ready: await siteBuilderTablesReady() });
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const before = await siteBuilderTablesReady();
 try {
  await createSiteBuilderTables();
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Migration failed." }, { status: 500 });
 }
 return NextResponse.json({ ok: true, ready: await siteBuilderTablesReady(), alreadyExisted: before, tables: ["site_pages", "site_menus"] });
}
