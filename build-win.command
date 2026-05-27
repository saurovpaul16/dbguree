#!/bin/bash
# DBGuree — Windows installer builder (runs on macOS, cross-compiles for Windows x64)
# Double-click this file in Finder to build the Windows .exe installer.
# Requirements: Python 3.10+, Node.js 18+, curl, unzip
# Output: electron/dist/DBGuree Setup *.exe  +  electron/dist/DBGuree *.exe (portable)

set -e
cd "$(dirname "$0")"

echo ""
echo "=========================================="
echo "  DBGuree — Building Windows Installer"
echo "  (cross-compiling from macOS)"
echo "=========================================="
echo ""

PYTHON_VERSION="3.10.11"
PYTHON_ZIP="python-${PYTHON_VERSION}-embed-amd64.zip"
PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ZIP}"
BACKEND_WIN_DIR="backend-win"
WHEELS_TMP="${BACKEND_WIN_DIR}/_wheels_tmp"
SITE_PACKAGES="${BACKEND_WIN_DIR}/python/Lib/site-packages"

# ── Detect pip ────────────────────────────────────────────────────────────────
if command -v pip3 &>/dev/null; then
  PIP="pip3"
elif command -v pip &>/dev/null; then
  PIP="pip"
else
  echo "ERROR: pip not found. Please install Python 3."
  exit 1
fi

# ── Step 1: Python Windows embeddable ─────────────────────────────────────────
echo "[1/4] Setting up Python ${PYTHON_VERSION} Windows embeddable..."

if [ -d "${BACKEND_WIN_DIR}/python" ] && [ -f "${BACKEND_WIN_DIR}/python/python.exe" ]; then
  echo "  ✓ Already extracted, skipping."
else
  rm -rf "${BACKEND_WIN_DIR}/python"

  if [ ! -f "/tmp/${PYTHON_ZIP}" ]; then
    echo "  Downloading ${PYTHON_ZIP}..."
    curl -L --progress-bar -o "/tmp/${PYTHON_ZIP}" "${PYTHON_URL}"
  else
    echo "  ✓ Cached at /tmp/${PYTHON_ZIP}"
  fi

  echo "  Extracting..."
  mkdir -p "${BACKEND_WIN_DIR}/python"
  unzip -q "/tmp/${PYTHON_ZIP}" -d "${BACKEND_WIN_DIR}/python"

  # Enable site-packages — the embeddable zip has '#import site' commented out
  PTH_FILE="${BACKEND_WIN_DIR}/python/python310._pth"
  if [ -f "${PTH_FILE}" ]; then
    sed -i.bak 's/#import site/import site/' "${PTH_FILE}"
    rm -f "${PTH_FILE}.bak"
    echo "  ✓ Enabled site-packages in python310._pth"
  fi

  mkdir -p "${SITE_PACKAGES}"
  echo "  ✓ Python embeddable ready."
fi

# ── Step 2: Cross-download Windows wheels ─────────────────────────────────────
echo ""
echo "[2/4] Downloading Windows (win_amd64 / cp310) wheels..."

mkdir -p "${WHEELS_TMP}"
mkdir -p "${SITE_PACKAGES}"

# Core packages — all have prebuilt Windows wheels on PyPI
echo "  Downloading core packages (this may take a few minutes)..."

$PIP download \
  --quiet \
  --dest "${WHEELS_TMP}" \
  --platform win_amd64 \
  --python-version 310 \
  --implementation cp \
  --only-binary :all: \
  "fastapi>=0.110,<0.120" \
  "uvicorn>=0.29" \
  "httptools>=0.5.0" \
  "websockets>=11.0" \
  "sqlalchemy>=2.0,<3.0" \
  "alembic>=1.13" \
  "psycopg2-binary>=2.9" \
  "pymysql>=1.1" \
  "keyring>=25.0" \
  "keyrings.alt" \
  "langchain>=0.3,<0.4" \
  "langchain-community>=0.3,<0.4" \
  "chromadb>=0.5,<0.6" \
  "psutil>=5.9" \
  "sqlglot>=23.0" \
  "pypdf>=4.0" \
  "python-docx>=1.0" \
  "markdown-it-py>=3.0" \
  "requests>=2.31" \
  "pydantic>=2.0,<3.0" \
  "pydantic-settings>=2.0" \
  "python-multipart"

echo "  Downloading llama-cpp-python (CPU build for Windows)..."
# llama-cpp-python ships prebuilt CPU wheels; if the default PyPI wheel is missing,
# fall back to the project's own release index.
$PIP download \
  --quiet \
  --dest "${WHEELS_TMP}" \
  --platform win_amd64 \
  --python-version 310 \
  --implementation cp \
  --only-binary :all: \
  "llama-cpp-python>=0.2.80" \
  || $PIP download \
    --quiet \
    --dest "${WHEELS_TMP}" \
    --platform win_amd64 \
    --python-version 310 \
    --implementation cp \
    --only-binary :all: \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu \
    "llama-cpp-python>=0.2.80"

# pyodbc — optional (MSSQL support); skip if no Windows wheel available
echo "  Attempting pyodbc (MSSQL driver, optional)..."
$PIP download \
  --quiet \
  --dest "${WHEELS_TMP}" \
  --platform win_amd64 \
  --python-version 310 \
  --implementation cp \
  --only-binary :all: \
  "pyodbc>=5.0" \
  2>/dev/null && echo "  ✓ pyodbc downloaded." \
  || echo "  ⚠ pyodbc wheel not available; MSSQL connections will not work on Windows."

echo "  Extracting wheels into site-packages..."
COUNT=0
for wheel in "${WHEELS_TMP}"/*.whl; do
  [ -f "$wheel" ] || continue
  unzip -q -o "$wheel" -d "${SITE_PACKAGES}" 2>/dev/null || true
  COUNT=$((COUNT + 1))
done
echo "  ✓ Extracted ${COUNT} wheels."

rm -rf "${WHEELS_TMP}"

# ── Step 3: Copy backend source ───────────────────────────────────────────────
echo ""
echo "[3/4] Copying backend source to ${BACKEND_WIN_DIR}/app/..."

mkdir -p "${BACKEND_WIN_DIR}/app"
rsync -a --delete \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.venv' \
  --exclude '.venv-linux' \
  --exclude 'backend.spec' \
  backend/ "${BACKEND_WIN_DIR}/app/"

echo "  ✓ Backend source ready."

# ── Step 4: Webpack + electron-builder ────────────────────────────────────────
echo ""
echo "[4/4] Building frontend bundle and packaging Windows installer..."

cd electron
[ ! -d node_modules ] && { echo "  Installing npm dependencies..."; npm install; }
npm run build
echo "  ✓ Webpack bundle built."

echo "  Running electron-builder --win --x64..."
npx electron-builder --win --x64
cd ..

echo ""
echo "=========================================="
echo "  ✓ Done! Installer is in electron/dist/"
echo "=========================================="
echo ""
echo "  Files created:"
ls -lh electron/dist/*.exe 2>/dev/null || echo "  (check electron/dist/ for output)"
echo ""
read -p "Press Enter to close..."
