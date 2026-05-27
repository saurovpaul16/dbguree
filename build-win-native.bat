@echo off
REM DBGuree -- Windows Standalone Executable Builder
REM Run this on Windows to build a complete installer + portable exe
REM Output: electron\dist\DBGuree Setup *.exe  +  electron\dist\DBGuree *.exe (portable)

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ==========================================
echo   DBGuree - Building Windows Executable
echo ==========================================
echo.

REM Configuration
set PYTHON_VERSION=3.10.11
set PYTHON_ZIP=python-%PYTHON_VERSION%-embed-amd64.zip
set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/%PYTHON_ZIP%
set BACKEND_WIN_DIR=backend-win
set SITE_PACKAGES=%BACKEND_WIN_DIR%\python\Lib\site-packages
set NODE_VERSION=20.9.0
set NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%

REM Create necessary directories
if not exist "%BACKEND_WIN_DIR%" mkdir "%BACKEND_WIN_DIR%"

REM -- Step 1: Set up Node.js -------------------------------------------
echo [1/5] Setting up Node.js %NODE_VERSION%...

if exist "%BACKEND_WIN_DIR%\node\node.exe" (
  echo   Already installed
) else (
  echo   Downloading Node.js...
  powershell -Command "(New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%BACKEND_WIN_DIR%\%NODE_ZIP%')"
  if not exist "%BACKEND_WIN_DIR%\%NODE_ZIP%" (
    echo   ERROR: Failed to download Node.js
    goto error
  )
  echo   Extracting Node.js...
  powershell -Command "Expand-Archive -Path '%BACKEND_WIN_DIR%\%NODE_ZIP%' -DestinationPath '%BACKEND_WIN_DIR%' -Force"
  for /d %%D in ("%BACKEND_WIN_DIR%\node-v*") do (
    move "%%D" "%BACKEND_WIN_DIR%\node" >nul
  )
  del "%BACKEND_WIN_DIR%\%NODE_ZIP%"
  echo   Node.js ready
)

set NODE_BIN=%CD%\%BACKEND_WIN_DIR%\node
set PATH=%NODE_BIN%;%NODE_BIN%\npm;%PATH%

REM -- Step 2: Set up Python embeddable --------------------------------
echo.
echo [2/5] Setting up Python %PYTHON_VERSION% embeddable...

if exist "%BACKEND_WIN_DIR%\python\python.exe" (
  echo   Already extracted
) else (
  echo   Downloading Python embeddable...
  powershell -Command "(New-Object Net.WebClient).DownloadFile('%PYTHON_URL%', '%temp%\%PYTHON_ZIP%')"
  if not exist "%temp%\%PYTHON_ZIP%" (
    echo   ERROR: Failed to download Python
    goto error
  )
  echo   Extracting Python...
  powershell -Command "Expand-Archive -Path '%temp%\%PYTHON_ZIP%' -DestinationPath '%BACKEND_WIN_DIR%\python' -Force"
  del "%temp%\%PYTHON_ZIP%"
  echo   Python extracted
)

set PYTHON=%CD%\%BACKEND_WIN_DIR%\python\python.exe

REM Fix _pth to explicitly include Lib\site-packages.
REM Embedded Python does not ship site.py so "import site" alone is unreliable.
echo python310.zip> "%BACKEND_WIN_DIR%\python\python310._pth"
echo .>> "%BACKEND_WIN_DIR%\python\python310._pth"
echo Lib\site-packages>> "%BACKEND_WIN_DIR%\python\python310._pth"
echo.>> "%BACKEND_WIN_DIR%\python\python310._pth"
echo import site>> "%BACKEND_WIN_DIR%\python\python310._pth"
echo   Fixed python310._pth

if not exist "%SITE_PACKAGES%" mkdir "%SITE_PACKAGES%"

REM -- Step 3: Install Python packages ---------------------------------
echo.
echo [3/5] Installing Python packages into embedded Python...
echo   This may take 5-15 minutes on first run.

REM Bootstrap pip if not present
if not exist "%BACKEND_WIN_DIR%\python\Scripts\pip.exe" (
  echo   Bootstrapping pip...
  powershell -Command "(New-Object Net.WebClient).DownloadFile('https://bootstrap.pypa.io/get-pip.py', '%temp%\get-pip.py')"
  if not exist "%temp%\get-pip.py" (
    echo   ERROR: Could not download get-pip.py
    goto error
  )
  "%PYTHON%" "%temp%\get-pip.py" --no-warn-script-location
  if errorlevel 1 (
    echo   ERROR: pip bootstrap failed
    goto error
  )
  del "%temp%\get-pip.py"
  echo   pip ready
)

set PIP=%CD%\%BACKEND_WIN_DIR%\python\Scripts\pip.exe

echo   Installing core packages...
"%PIP%" install --no-warn-script-location --target "%SITE_PACKAGES%" ^
  "fastapi>=0.110,<0.120" ^
  "uvicorn[standard]>=0.29" ^
  "sqlalchemy>=2.0,<3.0" ^
  "alembic>=1.13" ^
  "psycopg2-binary>=2.9" ^
  "pymysql>=1.1" ^
  "keyring>=25.0" ^
  "keyrings.alt" ^
  "psutil>=5.9" ^
  "sqlglot>=23.0" ^
  "pypdf>=4.0" ^
  "python-docx>=1.0" ^
  "markdown-it-py>=3.0" ^
  "requests>=2.31" ^
  "pydantic>=2.0,<3.0" ^
  "pydantic-settings>=2.0" ^
  "python-multipart" ^
  "aiofiles"
if errorlevel 1 (
  echo   WARNING: Some core packages failed - continuing...
)

echo   Installing LangChain and ChromaDB...
"%PIP%" install --no-warn-script-location --target "%SITE_PACKAGES%" ^
  "langchain>=0.3,<0.4" ^
  "langchain-community>=0.3,<0.4" ^
  "chromadb>=0.5,<0.6"
if errorlevel 1 (
  echo   WARNING: LangChain/ChromaDB had issues - continuing...
)

echo   Installing llama-cpp-python...
"%PIP%" install --no-warn-script-location --target "%SITE_PACKAGES%" "llama-cpp-python>=0.2.80"
if errorlevel 1 (
  echo   Retrying llama-cpp-python with CPU wheel index...
  "%PIP%" install --no-warn-script-location --target "%SITE_PACKAGES%" ^
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu ^
    "llama-cpp-python>=0.2.80"
)

echo   Installing pyodbc (SQL Server support)...
"%PIP%" install --no-warn-script-location --target "%SITE_PACKAGES%" "pyodbc>=5.0" 2>nul

echo   Packages installed.

REM -- Step 4: Copy backend source -------------------------------------
echo.
echo [4/5] Copying backend source code...

REM IMPORTANT: copy as app\backend\ so "from backend.xxx import" resolves correctly.
REM main.py adds its parent dir to sys.path; parent must contain a "backend" subdir.
if exist "%BACKEND_WIN_DIR%\app" rmdir /s /q "%BACKEND_WIN_DIR%\app"
mkdir "%BACKEND_WIN_DIR%\app"
mkdir "%BACKEND_WIN_DIR%\app\backend"

xcopy "backend" "%BACKEND_WIN_DIR%\app\backend" /e /i /q /y >nul
if exist "backend\alembic.ini" copy "backend\alembic.ini" "%BACKEND_WIN_DIR%\app\" >nul 2>&1

echo   Backend source copied to app\backend\

REM -- Step 5: Build frontend and package ------------------------------
echo.
echo [5/5] Building frontend bundle and Windows installer...

cd electron

if not exist node_modules (
  echo   Installing npm dependencies...
  call "%NODE_BIN%\npm.cmd" install
  if errorlevel 1 (
    echo   ERROR: npm install failed
    cd ..
    goto error
  )
)

echo   Building webpack bundle...
call "%NODE_BIN%\npm.cmd" run build
if errorlevel 1 (
  echo   ERROR: webpack build failed
  cd ..
  goto error
)

echo   Packaging with electron-builder...
call "%NODE_BIN%\npx.cmd" electron-builder --win --x64
if errorlevel 1 (
  echo   WARNING: electron-builder had issues - check output above
)

cd ..

echo.
echo ==========================================
echo   Build complete!
echo ==========================================
echo.
echo   Output: electron\dist\
echo     DBGuree Setup *.exe  (installer)
echo     DBGuree *.exe        (portable)
echo.
goto end

:error
echo.
echo   BUILD FAILED. See errors above.
echo.
exit /b 1

:end
endlocal
