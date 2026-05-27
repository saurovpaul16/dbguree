# DBGuree for Windows Users

Quick guide to build and run DBGuree on Windows.

## Option 1: Quick Build (Recommended for most users)

### Download & Build (20 minutes)

1. **Download the repository**
   - Visit: https://github.com/tanmayghosh91/dbguree
   - Click green `Code` button → `Download ZIP`
   - Extract to a folder (e.g., `C:\Users\YourName\Desktop\dbguree2`)

2. **Open Command Prompt**
   - Navigate to the extracted folder
   - Right-click in the folder → `Open in Terminal` (Windows 11)
   - Or: Start → type `cmd` → navigate with `cd C:\path\to\dbguree2`

3. **Run the build script**
   ```cmd
   build-win-native.bat
   ```
   - A command window opens
   - Automatically downloads Node.js, Python, and all dependencies
   - Takes 15-20 minutes (mostly downloading)
   - Watch for `✓ Build Complete!` message

4. **Get your executables**
   - Open folder: `electron\dist\`
   - You'll see:
     - `DBGuree Setup 0.1.0.exe` ← **Installer (share this)**
     - `DBGuree 0.1.0.exe` ← Portable (no installation)

### Run the app

**First time setup:**
- Double-click `DBGuree Setup 0.1.0.exe`
- Click `Install`
- App opens automatically

**Later runs:**
- Start Menu → Search for "DBGuree" → Click

### Distribute to others

Share `DBGuree Setup 0.1.0.exe` with users:
- They download it
- Double-click to install
- No admin privileges needed
- Works on any Windows 10+ machine

---

## Option 2: Git Clone (For developers)

If you have Git installed:

```cmd
git clone --branch feature/ui https://github.com/tanmayghosh91/dbguree.git
cd dbguree2
build-win-native.bat
```

---

## Troubleshooting

### Build hangs downloading wheels

The script is downloading ~50 Python packages. This can take 5-10 minutes on slower internet.
- **Just wait** — don't close the window
- If it truly hangs (no activity for 5+ minutes), press `Ctrl+C` to stop, then re-run

### "Python download failed" or "Node.js download failed"

Your internet may be blocking downloads from python.org or nodejs.org:
- Try again (may be temporary)
- If behind corporate firewall, check with your IT
- Manually download:
  - Python: https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip → place in `%TEMP%\`
  - Node.js: https://nodejs.org/dist/v20.9.0/node-v20.9.0-win-x64.zip → place in `backend-win\`

### "electron-builder failed"

The build likely still succeeded. Check `electron\dist\` for `.exe` files anyway.

### The .exe won't run / "Windows protected your PC"

1. Click `More info` → `Run anyway`
2. Or right-click the .exe → Properties → uncheck "Block this file" → Apply

This is normal for unsigned applications.

### "Permission denied" when installing

- You likely need to restart your computer after installation
- Try a different user account

---

## System Requirements

- **Windows 10 or later** (64-bit)
- **10 GB free disk space** (for build; final app is ~150 MB)
- **Internet connection** (for downloading dependencies)

### Optional: Run the app locally (browser mode)

If you just want to test without building:

1. Install Python 3.9+ and Node.js 18+ manually
2. Open Command Prompt in `dbguree2` folder
3. Run:
   ```cmd
   python dev-server.py
   ```
4. Open browser: http://localhost:8080

---

## What's inside the .exe?

The executable contains:
- **Electron shell** — lightweight browser window
- **React frontend** — the user interface
- **Python 3.10 runtime** — bundled, no installation needed
- **FastAPI backend** — SQL AI generation
- **All dependencies** — SQLAlchemy, LangChain, ChromaDB, llama-cpp-python, etc.

**Total size:** ~150 MB (downloads ~1 GB during build)

---

## Next steps

1. **Build the app** using the steps above
2. **Test it**: Open DBGuree, connect to a database
3. **Share** `DBGuree Setup 0.1.0.exe` with colleagues
4. **Questions?** Check [README.md](README.md) for architecture details

---

## For developers

See [README.md](README.md) for development setup, architecture, and feature details.
