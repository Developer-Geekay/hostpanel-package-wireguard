#!/usr/bin/env bash
# Build hostpanel-wireguard-<version>.zip for upload via the HostPanel Package Manager.
# The repo layout IS the zip layout — no staging needed.
# bin/wg must be a compiled ARM64 binary committed to the repo.
# bin/wg-quick is the wg-quick bash script from wireguard-tools.
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('plugin/setup.py').read()).group(1))")
OUT="hostpanel-wireguard-${VERSION}.zip"

echo "Building ${OUT}..."
rm -f "$OUT"

zip -r "$OUT" plugin/ bin/ service/ frontend/ sudoers/ \
    --exclude "*/__pycache__/*" --exclude "*.pyc"

echo "Done -> ${OUT}"
