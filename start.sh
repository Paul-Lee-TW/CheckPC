#!/bin/bash
cd "$(dirname "$0")"
echo "================================"
echo "  CheckPC - PC Audit Tool"
echo "================================"
echo ""
echo "Starting server..."
echo "Open browser: http://localhost:3001"
# The server binds to loopback by default; it is only reachable over the LAN
# when started with HOST=0.0.0.0. Show the network URL only in that case.
if [ "${HOST:-127.0.0.1}" = "0.0.0.0" ]; then
  echo "Network:      http://$(ipconfig getifaddr en0 2>/dev/null || echo 'localhost'):3001"
fi
echo ""
echo "Press Ctrl+C to stop"
echo "================================"
node src/server.js
