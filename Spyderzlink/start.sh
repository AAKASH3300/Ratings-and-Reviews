#!/usr/bin/env bash
# SpyderZ Link Bus Review Sender Launcher

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null 2>&1 || true

echo "=========================================================="
echo "🚌 Starting SpyderZ Link Bus Review Sender on port 5001..."
echo "=========================================================="

(sleep 2 && (google-chrome http://localhost:5001 >/dev/null 2>&1 || xdg-open http://localhost:5001 >/dev/null 2>&1)) &

PORT=5001 node server.js
