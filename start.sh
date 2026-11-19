#!/usr/bin/env bash
# Omni Bus Review Request Sender Launcher

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Load NVM Node if present
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null 2>&1 || true

echo "=========================================================="
echo "🚌 Starting Omni Bus Review Sender..."
echo "=========================================================="

# Check if node_modules exists, otherwise install
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first time only)..."
  npm install
fi

# Build frontend if dist doesn't exist
if [ ! -d "dist" ]; then
  echo "Building web interface..."
  npm run build
fi

# Open Chrome in background after 1.5 seconds
(sleep 2 && (google-chrome http://localhost:5000 >/dev/null 2>&1 || xdg-open http://localhost:5000 >/dev/null 2>&1)) &

# Start backend server
node server.js
