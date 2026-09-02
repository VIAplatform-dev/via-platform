// The marketplace search, re-exported under the public /api/mobile prefix.
//
// The Expo app browses without a session, but /api/search sits behind the
// catch-all gate in proxy.ts — the pilot marketplace is invite-only on the web,
// and opening that path would expose the whole catalogue. /api/mobile is already
// public (PUBLIC_ROUTES), so the app reaches the same handler here instead.
// Re-export, not a copy: the 660 lines of query-building stay in one place.
export { GET } from "@/app/api/search/route";
