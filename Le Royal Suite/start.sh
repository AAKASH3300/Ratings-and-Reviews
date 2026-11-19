#!/usr/bin/env bash
# Le Royal Suite Hotel Review Sender Launcher

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null 2>&1 || true

echo "=========================================================="
echo "🏨 Starting Le Royal Suite Review Sender on port 5002..."
echo "=========================================================="

(sleep 2 && (google-chrome http://localhost:5002 >/dev/null 2>&1 || xdg-open http://localhost:5002 >/dev/null 2>&1)) &

PORT=5002 node server.js
