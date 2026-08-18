#!/usr/bin/env bash
# Local dev stack for The Gauntlet.
#   9999 = node scripts/dev-functions.mjs (the Netlify v2 functions)
#   3000 = vite with hot reload, proxying /api -> 9999
cd /home/remnant/Projects/Work/Class/warren
SP="${GAUNTLET_LOG_DIR:-/tmp/gauntlet-dev}"; mkdir -p "$SP"
pkill -f '[d]ev-functions.mjs' 2>/dev/null
pkill -f '[b]in/vite' 2>/dev/null
pkill -f '[n]etlify-cli' 2>/dev/null
sleep 2
set -a; . ./.env; set +a
NETLIFY_DEV=true setsid nohup env NETLIFY_DEV=true node scripts/dev-functions.mjs 9999 > "$SP/functions.log" 2>&1 < /dev/null &
setsid nohup env VITE_API_BASE=http://127.0.0.1:9999/api node_modules/.bin/vite > "$SP/vite.log" 2>&1 < /dev/null &
for i in $(seq 1 30); do
  a=$(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:3000/ 2>/dev/null)
  b=$(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:9999/api/leaderboard 2>/dev/null)
  [ "$a" = "200" ] && [ "$b" = "200" ] && break
  sleep 1
done
echo "vite      3000: $a"
echo "functions 9999: $b"
echo "proxied   3000/api/leaderboard: $(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:3000/api/leaderboard)"
