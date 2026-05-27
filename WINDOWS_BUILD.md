# Building DBGuree on Windows

This guide covers building a **completely standalone Windows executable** that requires no pre-installed dependencies.

## Quick start (5-15 minutes)

1. On a Windows machine, download this repository as a `.zip` and extract it.
2. Open the folder and **double-click `build-win-native.bat`**.
3. Wait for the build to complete.
4. Find your executables in `electron\dist\`:
   - **DBGuree Setup *.exe** — installer for distribution
   - **DBGuree *.exe** — portable executable

That's it. Users can run either `.exe` on any Windows machine with no additional software.

---

## What the build script does

`build-win-native.bat` automates:

1. **Downloads Node.js** (~200 MB) — needed to build the frontend
2. **Downloads Python 3.10 embeddable** (~100 MB) — the runtime
3. **Downloads all Python dependencies** (~500 MB) — FastAPI, SQLAlchemy, LangChain, ChromaDB, llama-cpp-python, etc.
4. **Builds the frontend** — React + Monaco editor + AG Grid bundle
5. **Packages with Electron** — creates NSIS installer + portable exe

**Total download**: ~800–1000 MB
**Total disk space needed**: ~3 GB
**Time**: 5–15 minutes (mostly downloading)

---

## System requirements

- Windows 10 or later (x64 only)
- **10 GB free disk space** (temporary; final executables are ~150 MB)
- Internet connection (required for downloading dependencies)
- PowerShell (built into Windows 7+)

**No need to pre-install:**
- Python
- Node.js
- Visual C++ redistributables
- Any database clients

---

## Running the build

### Option 1: Double-click (easiest)

In File Explorer, navigate to the extracted `dbguree2` folder and double-click:
```
build-win-native.bat
```

A command window opens and shows progress. Read any errors if they appear.

### Option 2: Command prompt

```cmd
cd path\to\dbguree2
build-win-native.bat
```

---

## Output

After the build completes, look in `electron\dist\`:

```
electron/dist/
├── DBGuree Setup 0.1.0.exe    ← Installer (recommended)
├── DBGuree 0.1.0.exe          ← Portable, no installation
└── ...other files
```

### For end users

Share **`DBGuree Setup 0.1.0.exe`**:
- Users download it
- Double-click to install
- No admin privileges needed
- Creates a Start Menu shortcut
- Clean uninstall via Control Panel

### For portable distribution

Share **`DBGuree 0.1.0.exe`**:
- No installation
- Can run from USB drive
- Works on any Windows machine

---

## Troubleshooting

### Build hangs downloading wheels

The script is downloading 50+ Python packages. This is normal and may take 5–10 minutes on slower internet.

**If it stops:**
- Check your internet connection
- Delete `backend-win\_wheels_tmp` and try again
- Some optional packages (like `pyodbc` for SQL Server) may be skipped — this is OK

### "Python download failed"

Your internet may be blocking python.org. Options:
1. Run the script again — it may retry
2. Manually download `python-3.10.11-embed-amd64.zip` from https://python.org/downloads/ and place it in `%TEMP%`
3. Use a VPN or corporate proxy if behind a firewall

### "npm install failed"

This usually means a missing package on PyPI. The build will continue — most packages succeeded.

### "electron-builder failed"

This often happens but still produces valid executables. Check if `.exe` files exist in `electron\dist\`.

### The final .exe won't run

Make sure:
- You're on Windows 10 or later (x64)
- You have 500 MB free disk space
- Windows Defender isn't blocking it (try "Run as administrator")
- Try the portable `.exe` instead of the installer

---

## What's inside the .exe

The final executable contains:
- **Electron shell** — lightweight Chromium browser
- **React app** — the UI
- **Python 3.10** — embedded runtime
- **All Python packages** — FastAPI, SQLAlchemy, LangChain, ChromaDB, llama-cpp-python, etc.
- **Model files** — downloaded on first run (optional)

Total size: ~150 MB

---

## Advanced: Building without automatic downloads

If you have connectivity issues or want to use a custom Python build:

1. **Provide Python manually**:
   - Extract Python 3.10 embeddable to `backend-win\python\`
   - The script will skip the download

2. **Provide wheels manually**:
   - Place all `.whl` files in `backend-win\_wheels_tmp\`
   - The script will extract them instead of downloading

---

## Signing the executable (optional)

By default, the `.exe` is unsigned. To add a code signature:

1. Obtain a Windows code signing certificate
2. Edit `electron\package.json`:
   ```json
   "win": {
     "certificateFile": "path/to/cert.pfx",
     "certificatePassword": "your_password",
     ...
   }
   ```
3. Re-run the build

---

## Distributing updates

To make a new version:

1. Update `electron\package.json` version field
2. Commit and push
3. Run `build-win-native.bat` again
4. Upload the new `.exe` to your website

Users can run the new installer over the old version — it will update or reinstall cleanly.

---

## Tips for developers

- **Keep `build-win-native.bat` running occasionally** to catch dependency issues early
- **Test both `.exe` outputs** — the installer and the portable version may behave differently
- **Check `electron/dist/latest.yml`** after each build for version metadata
- **Use the portable `.exe` for testing** — faster than the installer

---

## Questions?

Refer to the main [README.md](README.md) for architecture and feature details.
