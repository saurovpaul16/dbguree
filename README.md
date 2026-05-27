# DBGuree

A local-first, privacy-first desktop SQL workbench with an on-device AI assistant. Ask questions in plain English, get SQL back — all inference runs on your machine, nothing leaves your network.

## How it works

```
Natural language question
  → RAG retrieves schema + learned query pairs
  → On-device SLM generates SQL
  → sqlglot validates syntax
  → You review, edit (Monaco editor), and run
  → Results appear in-app
  → "Approve & Learn" stores the pair for future queries
```

The AI never touches your database directly. All database context is passed via RAG. Only you can trigger query execution.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 29 + React 18 |
| SQL editor | Monaco Editor |
| Results grid | AG Grid |
| Backend API | FastAPI + uvicorn |
| ORM | SQLAlchemy 2 |
| Migrations | Alembic |
| Vector store | ChromaDB |
| AI pipeline | LangChain |
| Inference | llama-cpp-python (Qwen2.5-Coder) |
| Embeddings | nomic-embed-text-v1.5 |
| Query safety | sqlglot AST |
| Credentials | OS keychain (macOS Keychain / Windows DPAPI) |
| App DB | SQLite (WAL + FTS5) |

Supported databases: PostgreSQL, MySQL, SQL Server (via pyodbc).

---

## Prerequisites

- **Python 3.9+**
- **Node.js 18+** and npm
- macOS or Windows

---

## Running locally (browser / dev mode)

This is the fastest way to get started — no Electron needed.

### 1. Set up the Python environment

```bash
cd dbguree
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 2. Start the dev server

```bash
python dev-server.py
```

This starts the FastAPI backend on port `64430` and serves the frontend on port `8080`.

Open **http://localhost:8080** in your browser.

You can change the frontend port:

```bash
python dev-server.py --port 3000
```

The backend API docs (Swagger UI) are available at **http://localhost:64430/docs**.

---

## Running as an Electron app (desktop)

### 1. Set up the Python environment (same as above)

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. Install frontend dependencies

```bash
cd electron
npm install
```

### 3. Build the frontend bundle

```bash
npm run build
```

### 4. Launch

```bash
npm start
```

Or for hot-reload during development:

```bash
npm run dev
```

---

## Building a distributable

### Windows (standalone — no dependencies)

**On a Windows machine, double-click:**

```
build-win-native.bat
```

This downloads Node.js, Python 3.10, all dependencies, and packages everything into:
- **DBGuree Setup *.exe** — NSIS installer (recommended for end users)
- **DBGuree *.exe** — Portable executable (no installation needed)

No pre-installed software required. Users on any Windows machine can run either exe with nothing else installed.

See [WINDOWS_BUILD.md](WINDOWS_BUILD.md) for detailed build instructions and troubleshooting.

**From command line:**

```bash
build-win-native.bat
```

The build takes 5–15 minutes depending on internet speed. Output is in `electron/dist/`.

### macOS

```bash
./build-mac.command
```

Produces a `.dmg` and `.zip` in `electron/dist/`.

### Windows (cross-compile from macOS)

If building Windows executables from a Mac:

```bash
./build-win.command
```

Same output as above, but requires `curl` and `unzip` on macOS.

---

## Project structure

```
dbguree/
├── backend/                  # FastAPI backend
│   ├── main.py               # Entry point — prints port to stdout on ready
│   ├── requirements.txt
│   ├── api/                  # Route handlers (chat, query, connections, RAG…)
│   ├── core/                 # Inference, embeddings, NL→SQL pipeline, safety
│   ├── db/                   # SQLAlchemy models, session, Alembic migrations
│   └── distribution/         # Model download + SHA-256 verification
├── electron/
│   ├── main.js               # Main process — sidecar lifecycle + IPC
│   ├── preload.js            # Context bridge
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── layout/           # Sidebar, StatusBar, IconBar
│       ├── panels/           # Chat, Query, History, RAG, Settings panels
│       └── components/       # SqlBlock, SchemaTree, ConnectionForm…
├── backend-win/              # Bundled Python runtime for Windows builds
├── dev-server.py             # Dev-mode launcher (backend + frontend)
├── build-mac.command         # macOS build script
└── build-win.command         # Windows build script
```

---

## Key design decisions

- **LLM isolation** — the AI has zero database access at any point. Schema context is passed only through RAG retrieval.
- **Two-layer read-only enforcement** — sqlglot AST check for UX warnings + read-only SQLAlchemy transaction for actual DB-level enforcement.
- **Credentials never in plaintext** — passwords go to OS-level encrypted storage (macOS Keychain, Windows DPAPI) via `keyring`, never SQLite.
- **On-device inference** — uses Qwen2.5-Coder (1.5B or 0.5B, Q4 quantised) via llama.cpp. No API keys, no cloud calls.
- **Per-connection RAG isolation** — each connection profile gets its own ChromaDB collection so learned query pairs don't bleed across databases.
