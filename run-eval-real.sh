#!/bin/bash
cd "$(dirname "$0")"
cp /Users/hanaelster/dev/via/.env.local .env.local
trap 'rm -f .env.local' EXIT

for i in 1 2; do
  echo "########## BATCH $i — title-ctx, 40 items ##########"
  npx tsx --env-file=.env.local scripts/run-price-eval.ts --mode title-ctx --sample 40 2>&1 | grep -E '"(requested|graded|skipped|within10Pct|medianErrorPct|mode)"'
  echo ""
done

echo "########## ACCUMULATED ##########"
npx tsx --env-file=.env.local scripts/read-accuracy.ts 2>&1 | tail -30

echo ""
echo "########## SERPAPI CALLS THIS RUN ##########"
npx tsx --env-file=.env.local scripts/serp-window.ts 2>&1 | tail -10
