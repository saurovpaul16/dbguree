#!/bin/bash
# DBGuree — macOS DMG builder
# Double-click this file in Finder to build the DMG.
# Requirements: Python 3.10+, Node.js 18+

set -e
cd "$(dirname "$0")"

echo ""
echo "======================================"
echo "  DBGuree — Building macOS DMG"
echo "======================================"
echo ""

# ── Step 1: Package Python backend with PyInstaller ───────────────────────
echo "[1/3] Packaging Python backend with PyInstaller..."

# Use project venv if available, else system Python
if [ -f ".venv/bin/python3" ]; then
  PY=".venv/bin/python3"
  PIP=".venv/bin/pip"
else
  PY="python3"
  PIP="pip3"
fi

$PIP install --quiet pyinstaller keyrings.alt
$PY -m PyInstaller backend/backend.spec \
  --distpath backend-dist \
  --workpath build-tmp \
  --noconfirm

echo "Backend packaged."

# ── Step 2: Webpack bundle ─────────────────────────────────────────────────
echo ""
echo "[2/3] Building frontend bundle..."
cd electron
[ ! -d node_modules ] && npm install
npm run build
cd ..

# ── Step 3: electron-builder DMG ──────────────────────────────────────────
echo ""
echo "[3/3] Creating DMG with electron-builder..."
cd electron
npx electron-builder --mac --arm64
cd ..

echo ""
echo "======================================"
echo "  Done! DMG is in electron/dist/"
echo "======================================"
echo ""
read -p "Press Enter to close..."
