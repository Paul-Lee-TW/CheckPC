#!/bin/bash
# Build deployment package for Windows
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/dist-deploy/CheckPC"

echo "=== Building CheckPC Deployment Package ==="

# Clean
rm -rf "$SCRIPT_DIR/dist-deploy"
mkdir -p "$DEPLOY_DIR/src/routes"
mkdir -p "$DEPLOY_DIR/src/services"
mkdir -p "$DEPLOY_DIR/src/scripts"
mkdir -p "$DEPLOY_DIR/frontend/dist"

# Copy backend
cp "$SCRIPT_DIR/package.json" "$DEPLOY_DIR/"
cp "$SCRIPT_DIR/src/server.js" "$DEPLOY_DIR/src/"
cp "$SCRIPT_DIR/src/routes/"*.js "$DEPLOY_DIR/src/routes/"
cp "$SCRIPT_DIR/src/services/"*.js "$DEPLOY_DIR/src/services/"
cp "$SCRIPT_DIR/src/scripts/CheckPC.ps1" "$DEPLOY_DIR/src/scripts/"
cp "$SCRIPT_DIR/src/scripts/config.json" "$DEPLOY_DIR/src/scripts/"
cp "$SCRIPT_DIR/src/scripts/Run_CheckPC.bat" "$DEPLOY_DIR/src/scripts/"

# Copy frontend build
cp -r "$SCRIPT_DIR/frontend/dist/"* "$DEPLOY_DIR/frontend/dist/"

# Copy deploy scripts
cp "$SCRIPT_DIR/deploy/setup.bat" "$DEPLOY_DIR/"
cp "$SCRIPT_DIR/deploy/start.bat" "$DEPLOY_DIR/"

# Copy Install_OpenSSH.bat if exists
[ -f "$SCRIPT_DIR/src/scripts/Install_OpenSSH.bat" ] && cp "$SCRIPT_DIR/src/scripts/Install_OpenSSH.bat" "$DEPLOY_DIR/src/scripts/"

# Create .env
echo "PORT=3001" > "$DEPLOY_DIR/.env"

# Convert all .bat files to Windows CRLF line endings
echo "Converting .bat files to CRLF..."
find "$DEPLOY_DIR" -name "*.bat" -exec sh -c 'tr -d "\r" < "$1" > "$1.tmp" && awk "{printf \"%s\\r\\n\", \$0}" "$1.tmp" > "$1" && rm "$1.tmp"' _ {} \;

echo ""
echo "=== Deployment package created ==="
echo "Location: $SCRIPT_DIR/dist-deploy/CheckPC/"
echo ""
echo "Contents:"
find "$DEPLOY_DIR" -type f | sed "s|$DEPLOY_DIR/||" | sort
echo ""
echo "=== Deployment Instructions ==="
echo "1. Copy the 'CheckPC' folder to the target Windows PC"
echo "2. Install Node.js (https://nodejs.org) on the target PC"
echo "3. Run setup.bat (first time only)"
echo "4. Run start.bat to start the server"
echo "5. Open browser: http://localhost:3001"
