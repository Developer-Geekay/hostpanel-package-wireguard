#!/usr/bin/env bash
# Builds hostpanel-wireguard-<version>.zip for upload via the HostPanel Package Manager
#
# Before running, place pre-compiled WireGuard binaries in:
#   bin/wg          ← wg userspace tool (compiled for target arch)
#   bin/wg-quick    ← wg-quick shell script (from wireguard-tools)
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('setup.py').read()).group(1))")
OUT="hostpanel-wireguard-${VERSION}.zip"

echo "Building ${OUT}..."
rm -f "$OUT"

# Assemble plugin/ subdir (pip-installable root expected by package manager)
mkdir -p plugin
cp -r hostpanel_wireguard setup.py plugin/

zip -r "$OUT" \
    plugin/ \
    service/ \
    bin/ \
    frontend/ \
    sudoers/ \
    --exclude "**/__pycache__/*" --exclude "**/*.pyc"

rm -rf plugin/
echo "Done → ${OUT}"
