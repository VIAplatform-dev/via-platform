#!/bin/bash
cd "$(dirname "$0")"
cp /Users/hanaelster/dev/via/.env.local .env.local
trap 'rm -f .env.local' EXIT

echo "########## BATCH 1 — title-ctx, 40 items ##########"
npx tsx --env-file=.env.local scripts/run-price-eval.ts --mode title-ctx --sample 40 2>&1 | tail -60

echo ""
echo "########## BATCH 2 — title-ctx, 40 more ##########"
npx tsx --env-file=.env.local scripts/run-price-eval.ts --mode title-ctx --sample 40 2>&1 | tail -60

echo ""
echo "########## NOISE FLOOR (the ceiling) ##########"
npx tsx --env-file=.env.local scripts/noise-floor.ts 2>&1 | tail -18
