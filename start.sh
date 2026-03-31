#!/bin/bash
cd "$(dirname "$0")"
echo "================================"
echo "  CheckPC - PC Audit Tool"
echo "================================"
echo ""
echo "Starting server..."
echo "Open browser: http://localhost:3001"
echo "Network:      http://$(ipconfig getifaddr en0 2>/dev/null || echo 'localhost'):3001"
echo ""
echo "Press Ctrl+C to stop"
echo "================================"
node src/server.js
