#!/usr/bin/env bash
# Build hostpanel-wireguard-<version>.zip for upload via the HostPanel Package Manager.
# bin/wg  — compiled ARM64 binary from wireguard-tools
# bin/wg-quick — bash script from wireguard-tools
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('plugin/setup.py').read()).group(1))")
OUT="hostpanel-wireguard-${VERSION}.zip"

echo "Building frontend (React)..."
(cd frontend && npm ci && npm run build)

echo "Building ${OUT}..."
rm -f "$OUT"

zip -r "$OUT" plugin/ bin/ service/ sudoers/ \
    --exclude "*/__pycache__/*" --exclude "*.pyc"
zip "$OUT" frontend/main.js

echo "Done -> ${OUT}"
