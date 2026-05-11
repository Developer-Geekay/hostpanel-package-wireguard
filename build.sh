#!/usr/bin/env bash
# Builds hostpanel-wireguard-<version>.zip for upload via the HostPanel Package Manager
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('setup.py').read()).group(1))")
OUT="hostpanel-wireguard-${VERSION}.zip"

echo "Building ${OUT}..."
rm -f "$OUT"
zip -r "$OUT" \
    hostpanel_wireguard/ \
    setup.py \
    conf/ \
    frontend/ \
    --exclude "**/__pycache__/*" --exclude "**/*.pyc"

echo "Done → ${OUT}"
