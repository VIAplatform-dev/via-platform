#!/bin/bash
cd "$(dirname "$0")"
cp /Users/hanaelster/dev/via/.env.local .env.local
trap 'rm -f .env.local' EXIT
npx tsx --env-file=.env.local scripts/run-price-eval.ts --mode title-ctx --sample 20 2>&1 | grep -E '"(graded|within10Pct|medianErrorPct)"' | head -3
echo ""
npx tsx --env-file=.env.local scripts/band-compare.ts 2>&1 | tail -12
