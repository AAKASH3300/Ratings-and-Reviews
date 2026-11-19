#!/usr/bin/env bash
# Omni Ratings & Reviews Suite Launcher

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "🌟 Omni Business Ratings & Review Senders"
echo "=========================================================="
echo "1) Start 🚌 SpyderZ Link (Bus Service)  -> http://localhost:5001"
echo "2) Start 🏨 Le Royal Suite (Hotel Stay) -> http://localhost:5002"
echo "3) Start BOTH services simultaneously"
echo "=========================================================="
read -p "Select option [1, 2, or 3] (default 3): " choice
choice=${choice:-3}

if [ "$choice" == "1" ]; then
  cd "$DIR/Spyderzlink" && ./start.sh
elif [ "$choice" == "2" ]; then
  cd "$DIR/Le Royal Suite" && ./start.sh
else
  echo "Starting both SpyderZ Link and Le Royal Suite..."
  (cd "$DIR/Spyderzlink" && ./start.sh) &
  (cd "$DIR/Le Royal Suite" && ./start.sh) &
  wait
fi
