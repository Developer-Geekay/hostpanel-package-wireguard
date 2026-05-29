#!/usr/bin/env bash
# Build hostpanel-wireguard-<version>.zip for upload via the HostPanel Package Manager.
# No build step required — frontend/main.js is a plain SDK-pattern JS file.
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('plugin/setup.py').read()).group(1))")
OUT="hostpanel-wireguard-${VERSION}.zip"

echo "Building ${OUT}..."
rm -f "$OUT"

zip -r "$OUT" plugin/ bin/ service/ sudoers/ \
    --exclude "*/__pycache__/*" --exclude "*.pyc"
zip "$OUT" frontend/main.js

echo "Done -> ${OUT}"
