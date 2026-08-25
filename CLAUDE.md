# VYA — Codebase Guide

VYA is a platform for vintage-fashion sellers (pilot launched 2026-03-19). ~45 onboarded
stores, each with a storefront VYA builds and hosts, plus a curated marketplace where buyers
browse and favorite across every store.

**Revenue: a subscription fee per store, plus 1% commission on every transaction.** Both
halves matter when reasoning about cost. A subscription business is judged on cost to SERVE
a store per month, not cost per sale — so `api_costs` (which logs every paid Anthropic /
SerpApi / Voyage call) is attributed per store via `cost-context.ts`, and
`scripts/unit-economics.ts` reports it. AI features are cost of goods, not tooling: pricing
one piece costs ~$0.09 today, charged per LISTING rather than per sale.

(The earlier click-through model — ~6.7% commission on attributed orders — is history. The
attribution machinery below still exists and still runs.)

## Stack
- **Next.js** App Router (web) + **Expo/React Native** app in a sibling repo (`../via-app`).
- **Neon serverless Postgres** (`@neondatabase/serverless`), tagged-template SQL via `neon()`.
- Deployed on Vercel. **Deploy = `git push` to `main`** (the user's mental model; CLI not installed here).
- Node 24 — supports native TS execution and `node --test`.

## Run / verify
- Typecheck: `npx tsc --noEmit` (ignore stale `.next/types/*` errors).
- Lint: `npx eslint <files>`.
- Tests: `npm test` → `node --test` (Node-native, runs `*.test.ts`; no jest/vitest).

## Hard rules (from the user — do not violate)
- **NEVER `git commit` or `git push` unless told to in that exact message.** "Commit and push"
  never carries forward. Make changes, then stop.
- **Never read `.env`/secrets or hit production** (HTTP or DB writes) without explicit confirmation.
  Build admin/cron endpoints; the user triggers prod writes (often via `! curl`).
- Many files use **1-space indentation** — match the file you're editing.

## Key domains
- **Store portal**: `app/store/dashboard/page.tsx` (sidebar + tabs), auth via `/api/store/me`
  (email→store match in `stores.ts` `storeContactEmails`); analytics from `/api/store/analytics`.
- **Attribution**: buyers click `/api/track` → routed to seller (Shopify Collabs `collabs.shop`
  / `dt_id`, Stripe, etc.). Orders arrive via `/api/webhooks/shopify` (per-store HMAC secret).
- **Brand/category are inferred, not stored**: canonical `inferBrandFromTitle` + `normalizeCategory`
  in `app/lib/market-data-db.ts`. Reuse these everywhere so numbers reconcile.
- **Sizing**: `deriveSize` (seller fit-note > tag > description > title > variant), `expandSizeKeys`
  (ranges → every size, "US 2-4" → {2,3,4}); `products.size_keys TEXT[]` powers SQL size filters.

## Event data (the analytics foundation)
Four capture tables (`app/lib/analytics-db.ts`, `favorites-db.ts`):
`product_views`, `product_favorites`, `clicks`, `conversions`. Plus `products`, `searches`,
`utm_visits`. Product keys are inconsistent across them (composite string vs INT vs name) — see
the unified `events` table in `app/lib/data-layer/`.

## The Data Layer (B2B sourcing intelligence)
A monetizable seller-facing product built **into the store portal** (never a separate app).
- **Admin/internal** (built first): `/admin/data` → `brand-heat-db.ts` (Demand Index),
  `demand-db.ts` (whitespace/supply-gap), `data-products-db.ts` (funnel, price/velocity, search
  trends, sizing), `data-snapshots-db.ts` (daily snapshot history).
- **Seller-facing** (in progress): `app/lib/data-layer/` — unified `events` table (single source
  of truth, ETL-built daily), `market_metrics`, seller Market Insights + demand search + alerts,
  Stripe tiers, and a privacy guardrail (never expose < N=5 stores/transactions).
- **Config is centralized**: `app/lib/data-layer/config.ts` holds privacy N, era buckets (seed),
  condition taxonomy, and (later) pricing tiers + feature mapping. **Never hardcode** prices or
  the privacy threshold elsewhere.
- **Privacy**: sellers may NEVER see another individual store's numbers — only aggregated,
  anonymized, market-level signal (min N stores/transactions).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
