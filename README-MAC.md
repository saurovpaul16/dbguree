# DBGuree for Mac Users

Quick guide to build and run DBGuree on macOS (Intel or Apple Silicon).

## Option 1: Run in Browser (Development Mode)

Fastest way to test — no installation needed.

### Prerequisites

- **Python 3.9+** — [Download](https://www.python.org/downloads/)
- **Node.js 18+** — [Download](https://nodejs.org/)

### Quick start (5 minutes)

```bash
# 1. Clone the repository
git clone --branch feature/ui https://github.com/tanmayghosh91/dbguree.git
cd dbguree2

# 2. Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install Python dependencies
pip install -r backend/requirements.txt

# 4. Start the dev server
python dev-server.py
```

Then open your browser: **http://localhost:8080**

Server runs at: http://127.0.0.1:64430/docs (API docs)

**Stop the server:** Press `Ctrl+C`

---

## Option 2: Build as macOS App (20 minutes)

Create a native `.dmg` installer for distribution.

### Prerequisites

Same as Option 1:
- Python 3.9+
- Node.js 18+

### Build steps

```bash
# 1. Clone and setup
git clone --branch feature/ui https://github.com/tanmayghosh91/dbguree.git
cd dbguree2

# 2. Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# 3. Install frontend dependencies
cd electron
npm install

# 4. Build and package
npm run build
npm run build:mac

# Done! Find your app in:
# electron/dist/DBGuree-0.1.0-arm64.dmg (Apple Silicon)
# electron/dist/DBGuree-0.1.0-x64.dmg (Intel)
```

### Run the app

- Double-click the `.dmg` file
- Drag DBGuree into Applications
- Open from Applications or Spotlight (`Cmd+Space` → type "DBGuree")

### Share the .dmg

Users on macOS can:
- Download the `.dmg`
- Double-click to install
- Run from Applications

---

## Option 3: Run from Command Line (Development)

Perfect for developers who want to modify code.

```bash
cd dbguree2

# Activate environment
source .venv/bin/activate

# Start dev server with hot reload
npm run dev
```

This opens Electron with hot-reload enabled — changes to code automatically reload.

---

## Project structure

```
dbguree2/
├── backend/              # Python FastAPI backend
│   ├── main.py          # Entry point
│   ├── requirements.txt  # Python dependencies
│   └── ...
├── electron/
│   ├── src/             # React source code
│   ├── main.js          # Electron main process
│   └── package.json     # Frontend dependencies
├── README.md            # Architecture & features
├── dev-server.py        # Browser-mode development server
└── build-mac.command    # macOS build script
```

---

## Common Tasks

### Connect to a database

1. Launch DBGuree
2. Click "New Connection"
3. Enter:
   - Database type (PostgreSQL, MySQL, SQL Server)
   - Host, port, username, password
   - Database name
4. Click "Test Connection" → "Save"

### Ask a natural language question

1. Open the Chat panel
2. Type: "Show me all users created in 2025"
3. DBGuree generates SQL
4. Review and click "Move to Query Window"
5. Click "Run Query"
6. Results appear in grid below

### Approve and learn

After running a query:
1. Click "Approve & Learn"
2. Query is stored for future similar questions
3. Next time you ask something similar, DBGuree remembers

---

## Troubleshooting

### Python not found

```bash
python3 --version  # Check if installed
```

If not installed:
- Download from https://www.python.org/downloads/
- Or use Homebrew: `brew install python@3.10`

### Node.js not found

```bash
node --version  # Check if installed
```

If not installed:
- Download from https://nodejs.org/
- Or use Homebrew: `brew install node`

### "Permission denied" when running python

Make sure you're using the virtual environment:
```bash
source .venv/bin/activate
python dev-server.py  # Should work now
```

### Port 8080 already in use

Change the port:
```bash
python dev-server.py --port 3000
# Open http://localhost:3000
```

### Build fails with "webpack not found"

```bash
cd electron
npm install  # Reinstall dependencies
npm run build
```

### macOS warns "app is damaged" on launch

This is a code signing issue. Right-click the app → Open (not just double-click).

Or allow in System Preferences:
- System Settings → Privacy & Security
- Scroll to DBGuree → Click "Open Anyway"

---

## System Requirements

- **macOS 10.13+** (Intel or Apple Silicon)
- **Python 3.9+**
- **Node.js 18+**
- **1 GB free disk space**

---

## Architecture & Features

For detailed architecture, API endpoints, and feature documentation, see [README.md](README.md).

---

## For Windows users

See [README-WINDOWS.md](README-WINDOWS.md) for Windows-specific instructions.

---

## Next steps

1. **Start with Option 1** (dev server) to test the app
2. **Build Option 2** (macOS app) if distributing to other Mac users
3. **Explore the code** in `electron/src/` and `backend/`
4. **Submit pull requests** for improvements!

---

## Questions?

- Check [README.md](README.md) for architecture details
- Review [CLAUDE.md](CLAUDE.md) for project specification
- Open an issue on GitHub
