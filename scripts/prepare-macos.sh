#!/usr/bin/env bash
# Bundles the official Node runtime for macOS (arm64 or x64) and stages the app, like prepare-windows.ps1.
set -euo pipefail
arch="${1:?usage: prepare-macos.sh arm64|x64}"
node_version="24.22.3"
archive="node-v${node_version}-darwin-${arch}.tar.gz"
base="https://nodejs.org/dist/v${node_version}"
tmp="${RUNNER_TEMP:-/tmp}/mark-node-${arch}"
mkdir -p "$tmp" staging/runtime
curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
expected="$(grep "  ${archive}\$" "$tmp/SHASUMS256.txt" | awk '{print $1}')"
[ -n "$expected" ] || { echo "Node checksum not found"; exit 1; }
curl -fsSL "$base/$archive" -o "$tmp/$archive"
actual="$(shasum -a 256 "$tmp/$archive" | awk '{print $1}')"
[ "$actual" = "$expected" ] || { echo "Node SHA256 mismatch"; exit 1; }
tar -xzf "$tmp/$archive" -C "$tmp"
cp "$tmp/node-v${node_version}-darwin-${arch}/bin/node" staging/runtime/node
cp "$tmp/node-v${node_version}-darwin-${arch}/LICENSE" staging/runtime/NODE-LICENSE.txt
chmod 755 staging/runtime/node
node scripts/stage.mjs
