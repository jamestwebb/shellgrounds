#!/usr/bin/env bash
# Local dev stack for The Gauntlet.
#   9999 = node scripts/dev-functions.mjs (the Netlify v2 functions)
#   3000 = vite with hot reload, proxying /api -> 9999
cd the repository root
SP="${GAUNTLET_LOG_DIR:-/tmp/gauntlet-dev}"; mkdir -p "$SP"
pkill -f '[d]ev-functions.mjs' 2>/dev/null
pkill -f '[b]in/vite' 2>/dev/null
pkill -f '[n]etlify-cli' 2>/dev/null
sleep 2
set -a; . ./.env; set +a
NETLIFY_DEV=true setsid nohup env NETLIFY_DEV=true node scripts/dev-functions.mjs 9999 > "$SP/functions.log" 2>&1 < /dev/null &
setsid nohup env VITE_API_BASE=http://127.0.0.1:9999/api node_modules/.bin/vite > "$SP/vite.log" 2>&1 < /dev/null &
# Probe both loopback families explicitly and accept either. Each server binds
# ONE address: vite takes whatever `localhost` resolves to (::1 on this host),
# dev-functions.mjs takes 127.0.0.1. A probe pinned to one family therefore
# reports 000 for a server that is serving perfectly, which is how this script
# once declared a healthy stack dead. Do not route these through `localhost`:
# its resolution order is the variable being removed.
probe() {  # probe <port> <path> -> prints "<code> via <host>"; 0 when a 200 lands
  local port="$1" path="$2" host code=000
  for host in '[::1]' '127.0.0.1'; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 2 "http://${host}:${port}${path}" 2>/dev/null)
    if [ "$code" = "200" ]; then echo "200 via ${host}"; return 0; fi
  done
  echo "${code} — no loopback family answered"
  return 1
}
for i in $(seq 1 30); do
  a=$(probe 3000 /); ra=$?
  b=$(probe 9999 /api/leaderboard); rb=$?
  [ $ra -eq 0 ] && [ $rb -eq 0 ] && break
  sleep 1
done
echo "vite      3000: $a"
echo "functions 9999: $b"
echo "proxied   3000/api/leaderboard: $(probe 3000 /api/leaderboard)"
