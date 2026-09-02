// Single product, re-exported under the public /api/mobile prefix.
//
// app/api/products/[id]/route.ts already calls itself "public ... for the mobile
// app", but /api/products is not in PUBLIC_ROUTES, so the proxy 307s it to /login
// and the app's fetch lands on an HTML page. Serving it here honours that intent
// without unlocking /api/products for the gated web marketplace.
export { GET } from "@/app/api/products/[id]/route";
