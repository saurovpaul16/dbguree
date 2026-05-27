"""
DBGuree FastAPI backend entry point.

On startup:
1. SQLite WAL mode
2. Path isolation assertion [TR-13]
3. Alembic migrations to head
4. FTS5 virtual table init [TR-11]

Port communication [TR-3]:
  Prints {"status": "ready", "port": N} to stdout BEFORE starting uvicorn.
  Electron main.js parses this exact JSON line to discover the port.
"""

import json
import os
import socket
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Add project root to sys.path so 'backend.xxx' imports work when run directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.db.session import alembic_upgrade_to_head, get_engine, init_engine, init_fts5


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _startup()
    yield
    # No teardown needed — engines are per-request or short-lived


async def _startup() -> None:
    settings = get_settings()

    # Step 1: Initialise SQLite engine with WAL mode
    engine = init_engine(settings.SQLITE_DB_PATH)

    # Step 2: Explicit path isolation assertion [TR-13]
    sqlite_path = os.path.abspath(Path(settings.SQLITE_DB_PATH).expanduser())
    chroma_path = os.path.abspath(Path(settings.CHROMA_PERSIST_DIR).expanduser())
    assert sqlite_path != chroma_path, (
        f"FATAL: SQLite and ChromaDB paths must differ. "
        f"SQLite: {sqlite_path}, ChromaDB: {chroma_path}"
    )

    # Step 3: Run Alembic migrations to latest
    alembic_upgrade_to_head(engine)

    # Step 4: Ensure FTS5 virtual table exists (idempotent) [TR-11]
    init_fts5(engine)


app = FastAPI(
    title="DBGuree Backend",
    description="Local-first SQL workbench backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Electron renderer — local only
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────────────────────────────────────
from backend.api.chat import router as chat_router
from backend.api.connections import router as connections_router
from backend.api.llm import router as llm_router
from backend.api.query import router as query_router
from backend.api.rag import router as rag_router
from backend.api.system import router as system_router

app.include_router(connections_router)
app.include_router(chat_router)
app.include_router(query_router)
app.include_router(rag_router)
app.include_router(system_router)
app.include_router(llm_router)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    # Use 64430 by default, or an environment variable if set
    port = int(os.getenv("PORT", 64430))

    # Print ready signal BEFORE starting uvicorn.
    # Electron main.js parses this exact JSON format. [TR-3]
    print(json.dumps({"status": "ready", "port": port}), flush=True)

    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=port,
        log_level=get_settings().LOG_LEVEL,
    )
