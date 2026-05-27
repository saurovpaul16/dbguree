@echo off
REM DBGuree — Windows installer builder
REM Run this on a Windows machine to produce the installer.
REM Requirements: Python 3.10+, Node.js 18+

setlocal
cd /d "%~dp0"

echo.
echo ======================================
echo   DBGuree — Building Windows Installer
echo ======================================
echo.

REM ── Step 1: Python backend → PyInstaller ──────────────────────────────────
echo [1/3] Packaging Python backend with PyInstaller...

REM Install PyInstaller + keyrings.alt if missing
pip install --quiet pyinstaller keyrings.alt

REM Install backend dependencies
pip install --quiet -r backend\requirements.txt

REM Run PyInstaller (output goes to backend-dist\)
pyinstaller backend\backend.spec --distpath backend-dist --workpath build-tmp --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    pause
    exit /b 1
)
echo Backend packaged successfully.

REM ── Step 2: Webpack bundle ────────────────────────────────────────────────
echo.
echo [2/3] Building frontend bundle...
cd electron
if not exist node_modules (
    echo Installing npm dependencies...
    npm install
)
call npm run build
if errorlevel 1 (
    echo ERROR: Webpack build failed.
    pause
    exit /b 1
)

REM ── Step 3: electron-builder ──────────────────────────────────────────────
echo.
echo [3/3] Creating Windows installer with electron-builder...
npx electron-builder --win --x64
if errorlevel 1 (
    echo ERROR: electron-builder failed.
    pause
    exit /b 1
)

cd ..
echo.
echo ======================================
echo   Done! Installer is in electron\dist\
echo ======================================
echo.
pause
