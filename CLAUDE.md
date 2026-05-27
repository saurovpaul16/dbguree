# DBGuree — Claude Code Project Specification
## Version 0.3 — Tech Review Incorporated

> **Product:** DBGuree | **Company:** QuickMind
> **Spec Version:** 0.3 | **Date:** March 2026
> **Source documents:** HLR v0.6, Stack v0.2, Wireframe review, Tech review (16 issues)
> **Purpose:** Authoritative build spec for Claude Code. Work section by section.

---

## Changelog from v0.2

All 16 issues from the tech review have been resolved. Issues 1–3 (critical) are resolved before any other content. Changes are marked **[TR-N]** (Tech Review issue N) for traceability.

| Issue | Severity | Resolution |
|---|---|---|
| TR-1 | Critical | `ConnectionStatus` is now a Pydantic model, not a SQLAlchemy Base subclass |
| TR-2 | Critical | Self-consistency dropped for MVP. Single generation + one validation retry only |
| TR-3 | Critical | Port communication mechanism specified: stdout line parse on sidecar startup |
| TR-4 | High | Schema indexing made async with `/connections/{id}/indexing-status` poll endpoint |
| TR-5 | High | Document parsing libraries added: `pypdf`, `python-docx`, `markdown-it-py` |
| TR-6 | High | ChromaDB isolation: one collection per connection_profile_id (separate namespace) |
| TR-7 | High | Safety detection replaced with sqlglot AST-based approach |
| TR-8 | High | Model download strategy specified: versioned CDN + SHA-256 hash + resumable |
| TR-9 | Medium | Keyboard shortcut is now platform-adaptive: `Ctrl/⌘+Enter` |
| TR-10 | Medium | "Push to Edit" fallback defined: creates new tab if none active or panel hidden |
| TR-11 | Medium | SQLite FTS5 specified for session search — included in first Alembic migration |
| TR-12 | Medium | LLM generation cancel path added: `POST /chat/cancel` + thread interrupt |
| TR-13 | Medium | ChromaDB/SQLite path isolation is now an explicit startup assertion, not a note |
| TR-14 | Minor | `originated_from_ai` clarified with mandatory code comment in models.py |
| TR-15 | Minor | Phase 1 now has explicit spike gate as prerequisite step 0 |
| TR-16 | Minor | Read-only enforcement is two-layer: sqlglot AST check + read-only DB transaction |

---

## 0. Project Overview

DBGuree is a **local-first, privacy-first desktop SQL workbench** with an on-device AI assistant. The AI generates SQL from natural language. The human reviews, edits if needed, and executes. The app learns from approved queries over time.

**Core loop (must work end-to-end before anything else):**
```
User types NL question → RAG retrieves schema + learned pairs → Local SLM generates SQL
→ sqlglot validates syntax → User sees SQL + explanation in chat → "Push to Edit" (stays in chat)
OR "Move to Query Window" (shifts focus) → User edits in Monaco (optional) → User clicks Run Query
→ Safety checks (AST-based) + read-only transaction enforcement → Results + Messages tabs
→ "Approve & Learn" prompt → Pair stored in dynamic RAG
```

**Non-negotiable constraints:**
1. The LLM has zero database access at any point. All DB context via RAG only.
2. Only user-initiated action on Run Query executes SQL. LLM cannot trigger execution.

---

## 1. Architecture

### 1.1 System Topology

```
┌─────────────────────────────────────────────────────────┐
│  Electron Shell (Chromium + Node.js)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │Monaco Editor│  │  AG Grid     │  │ Schema Browser│  │
│  │(SQL editing)│  │(results grid)│  │  (sidebar)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (local only) via FastAPI
                       │ Port: parsed from sidecar stdout [TR-3]
┌──────────────────────▼──────────────────────────────────┐
│  Python Backend (FastAPI sidecar)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │LangChain │  │ChromaDB  │  │SQLAlchemy│  │sqlglot │  │
│  │(NL→SQL)  │  │(VectorDB)│  │(DB conn) │  │(AST)   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│  ┌────────────────────────────────────────────────────┐ │
│  │  SQLite (WAL) + FTS5 — chat, profiles, RAG metadata│ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ llama-cpp-python (threaded)
┌──────────────────────▼──────────────────────────────────┐
│  Inference Layer (llama.cpp — single runtime)           │
│  ├── SLM-SQL-1.5B  (Qwen2.5-Coder-1.5B, Q4, ~1.0 GB)  │
│  ├── SLM-SQL-0.5B  (Qwen2.5-Coder-0.5B, Q4, ~400 MB)  │
│  └── nomic-embed-text-v1.5  (~550 MB, all RAG ops)     │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Key Architecture Rules

1. **LLM ↔ Database isolation is absolute.** No LangChain tool, chain, or agent may hold or use a live database connection. Violation breaks the privacy and security story.
2. **All vector store access via LangChain `VectorStore` interface only.** No direct ChromaDB API calls in application code.
3. **Credentials never in plaintext.** Passwords and API keys go to OS-level encrypted storage (macOS Keychain, Windows DPAPI, Linux libsecret) via `keyring`. Never SQLite.
4. **Python sidecar lifecycle is a Day 1 requirement.** FastAPI process starts on Electron launch, cleanly terminates on quit (including force-quit and crash). Health check polling every 5 seconds.
5. **LLM cannot trigger query execution under any code path.** Only explicit user action on Run Query executes SQL.
6. **Read-only enforcement is two-layer [TR-16]:** AST-based detection (sqlglot) for UX warning + read-only SQLAlchemy transaction for actual DB-level enforcement. Keyword matching alone is not sufficient.
7. **Safety detection is AST-based, not string-based [TR-7].** `sqlglot.parse()` is used for all destructive query detection. String matching is not used anywhere in the safety layer.

---

## 2. Repository & Project Structure

```
dbguree/
├── electron/
│   ├── main.js                # Main process — sidecar lifecycle, port parsing, IPC
│   ├── preload.js             # Context bridge
│   ├── package.json           # Electron version pinned
│   └── src/
│       ├── App.jsx
│       ├── layout/
│       │   ├── Sidebar.jsx
│       │   ├── StatusBar.jsx
│       │   └── IconBar.jsx
│       ├── panels/
│       │   ├── ChatPanel.jsx
│       │   ├── QueryPanel.jsx
│       │   ├── HistoryPanel.jsx
│       │   ├── RagPanel.jsx
│       │   └── SettingsPanel.jsx
│       └── components/
│           ├── ConnectionItem.jsx
│           ├── KnowledgeGraphItem.jsx
│           ├── SqlBlock.jsx
│           ├── ApproveLearnPrompt.jsx
│           ├── DestructiveWarning.jsx
│           └── SchemaTree.jsx
│
├── backend/
│   ├── main.py                # FastAPI entry point — prints port to stdout on ready
│   ├── requirements.txt
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       └── 0001_initial_schema.py   # Includes FTS5 setup [TR-11]
│   ├── api/
│   │   ├── connections.py
│   │   ├── chat.py            # Includes /cancel endpoint [TR-12]
│   │   ├── query.py
│   │   ├── rag.py
│   │   ├── history.py
│   │   └── llm.py
│   ├── core/
│   │   ├── inference.py       # Single generation + one retry. No self-consistency. [TR-2]
│   │   ├── embeddings.py
│   │   ├── rag_manager.py     # One ChromaDB collection per connection_profile_id [TR-6]
│   │   ├── nl_to_sql.py
│   │   ├── sql_validator.py
│   │   └── safety.py          # AST-based detection via sqlglot [TR-7]
│   ├── db/
│   │   ├── models.py          # ConnectionStatus is Pydantic, not Base [TR-1]
│   │   ├── session.py
│   │   └── credentials.py
│   ├── connections/
│   │   └── manager.py         # Async schema indexing with status tracking [TR-4]
│   └── distribution/
│       └── model_download.py  # Versioned CDN + SHA-256 + resumable download [TR-8]
│
└── spikes/
    ├── spike_llm_inference.py
    ├── spike_embedding.py
    ├── spike_both_models.py
    └── spike_query_execution.py
```

---

## 3. Technology Stack

| Layer | Library / Tool | Notes |
|---|---|---|
| Orchestration | `langchain >=0.3,<0.4` | Pin major version — breaking changes between majors |
| Vector DB | `chromadb` | Via LangChain VectorStore only. One collection per connection. [TR-6] |
| Local SLM (default) | Qwen2.5-Coder-1.5B Q4 | Via llama.cpp |
| Local SLM (fallback) | Qwen2.5-Coder-0.5B Q4 | Auto on <8 GB RAM |
| Embeddings | nomic-embed-text-v1.5 | Via llama.cpp |
| Inference runtime | `llama-cpp-python` | Threaded — required for generation cancel [TR-12] |
| SQL validation | `sqlglot` | Dialect support + AST-based safety detection [TR-7] |
| DB connectivity | `sqlalchemy >=2.0` | + psycopg2, pymysql, pyodbc |
| App storage | SQLite (stdlib) | WAL mode + FTS5 for session search [TR-11] |
| Migrations | Alembic | Init on first commit. FTS5 in migration 0001. |
| Desktop shell | Electron (pinned) | Do not auto-update during build |
| SQL editor | Monaco Editor | `@monaco-editor/react` |
| Results grid | AG Grid Community | `ag-grid-community` ONLY — never enterprise |
| Backend API | FastAPI + Uvicorn | Port printed to stdout on ready [TR-3] |
| Credentials | `keyring` | macOS Keychain / Windows DPAPI / libsecret |
| PDF parsing | `pypdf` | For document upload + RAG indexing [TR-5] |
| DOCX parsing | `python-docx` | For document upload + RAG indexing [TR-5] |
| Markdown parsing | `markdown-it-py` | For document upload + RAG indexing [TR-5] |
| System info | `psutil` | RAM detection for model selection |

---

## 4. Critical Issue Resolutions (TR-1 through TR-3)

### TR-1: ConnectionStatus — Pydantic Model, Not SQLAlchemy

`ConnectionStatus` is **not** persisted to SQLite. It is held in backend process memory only and reset on each app restart. It must be a Pydantic model or dataclass — **never** a SQLAlchemy `Base` subclass.

```python
# backend/db/models.py

from pydantic import BaseModel
from typing import Optional

class ConnectionStatus(BaseModel):
    """
    In-memory only. Never persisted. Reset on backend restart.
    Held in a module-level dict: connection_status_store: dict[str, ConnectionStatus]
    """
    connection_profile_id: str
    status: str                   # "connected" | "error" | "connecting" | "disconnected"
    latency_ms: Optional[int] = None
    last_error: Optional[str] = None
    db_version: Optional[str] = None   # e.g. "PostgreSQL 15.2"

# Module-level store (backend/connections/manager.py)
connection_status_store: dict[str, ConnectionStatus] = {}
```

### TR-2: No Self-Consistency for MVP

Self-consistency (generating 2–3 candidates and picking the most consistent) is **dropped for MVP**. It would make inference 2–3× slower, breaking NFR-03 (<10 seconds). The generation strategy for MVP is:

1. Generate one SQL candidate
2. Run sqlglot validation
3. If validation fails: construct a new prompt appending the error message, retry **once**
4. Surface the result of step 3 to the user regardless of retry outcome

Self-consistency can be revisited post-MVP if users report consistent quality issues on complex queries.

```python
# backend/core/inference.py

async def generate_sql(prompt: str, db_type: str) -> tuple[str, str]:
    """
    Returns (sql, explanation). Single generation + one validation retry.
    No self-consistency. No multi-candidate generation.
    """
    result = await _run_inference(prompt)
    sql, explanation = _parse_output(result)

    is_valid, error = validate_sql(sql, db_type)
    if not is_valid:
        retry_prompt = prompt + f"\n\nThe previous SQL had a syntax error: {error}\nPlease correct it."
        result = await _run_inference(retry_prompt)
        sql, explanation = _parse_output(result)

    return sql, explanation
```

### TR-3: Port Communication via Stdout

The Python sidecar prints a single structured line to stdout when it is ready. Electron's main process parses this line to get the port. No temp files, named pipes, or env vars required.

```python
# backend/main.py

import sys, json

if __name__ == "__main__":
    import uvicorn, socket

    # Find a free port
    with socket.socket() as s:
        s.bind(('', 0))
        port = s.getsockname()[1]

    # Print ready signal BEFORE starting uvicorn
    # Electron main.js parses this exact format
    print(json.dumps({"status": "ready", "port": port}), flush=True)

    uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="warning")
```

```javascript
// electron/main.js — port parsing

function startBackend() {
  return new Promise((resolve, reject) => {
    pythonProcess = spawn(pythonExecutable, ['backend/main.py']);

    pythonProcess.stdout.on('data', (data) => {
      try {
        const msg = JSON.parse(data.toString().trim());
        if (msg.status === 'ready' && msg.port) {
          backendPort = msg.port;
          resolve(msg.port);
        }
      } catch (_) {}   // ignore non-JSON stdout lines
    });

    pythonProcess.stderr.on('data', (data) => console.error('[backend]', data.toString()));

    setTimeout(() => reject(new Error('Backend startup timeout')), 30000);
  });
}
```

---

## 5. Backend — Python FastAPI

### 5.1 Startup Sequence

```python
# backend/main.py — startup order (every step required)

@app.on_event("startup")
async def startup():
    # Step 1: Initialise SQLite with WAL mode
    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))

    # Step 2: Explicit path isolation assertion [TR-13]
    sqlite_path = os.path.abspath(SQLITE_DB_PATH)
    chroma_path = os.path.abspath(CHROMA_PERSIST_DIR)
    assert sqlite_path != chroma_path, (
        f"FATAL: SQLite and ChromaDB paths must differ. "
        f"SQLite: {sqlite_path}, ChromaDB: {chroma_path}"
    )
    assert not chroma_path.startswith(os.path.dirname(sqlite_path) + os.sep) or \
           chroma_path == os.path.dirname(sqlite_path), \
        "WARNING: ChromaDB inside SQLite directory — verify no filename collisions"

    # Step 3: Run Alembic migrations to latest
    alembic_upgrade_to_head()

    # Step 4: Initialise FTS5 virtual table if not exists
    init_fts5(engine)
```

### 5.2 SQLite Data Models

```python
# backend/db/models.py

from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
from typing import Optional
import uuid, datetime

Base = declarative_base()

class ConnectionProfile(Base):
    __tablename__ = "connection_profiles"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)            # e.g. "Production DB (AWS)"
    db_type = Column(String, nullable=False)         # "postgresql" | "mysql" | "mssql"
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    credential_key = Column(String, nullable=False)  # Keychain ref — NOT the password
    read_only = Column(Boolean, default=False)
    row_limit = Column(Integer, default=1000)
    query_timeout_seconds = Column(Integer, default=30)
    persona_mode = Column(String, default="analyst") # "analyst" | "developer" | "dba"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class ConnectionStatus(BaseModel):
    """
    In-memory ONLY. Never persisted to SQLite.
    Use a Pydantic model, NOT a SQLAlchemy Base subclass.
    Reset to 'disconnected' on every backend restart.
    """
    connection_profile_id: str
    status: str                   # "connected" | "error" | "connecting" | "disconnected"
    latency_ms: Optional[int] = None
    last_error: Optional[str] = None
    db_version: Optional[str] = None


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_profile_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_active_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    role = Column(String, nullable=False)            # "user" | "assistant"
    content = Column(Text, nullable=False)
    sql_generated = Column(Text, nullable=True)
    # True if SQL in this message was initially generated by the AI,
    # even if the user subsequently edited it before execution.
    # Used to decide whether to show the "Approve & Learn" prompt.
    # Do NOT interpret as "the current SQL is exactly as the AI wrote it." [TR-14]
    originated_from_ai = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class LearnedPair(Base):
    __tablename__ = "learned_pairs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_profile_id = Column(String, nullable=False)
    chroma_id = Column(String, nullable=False)       # ChromaDB document ID cross-reference
    nl_question = Column(Text, nullable=False)
    sql = Column(Text, nullable=False)
    schema_hash = Column(String, nullable=False)     # Schema hash at time of approval
    session_id = Column(String, nullable=False)
    is_flagged = Column(Boolean, default=False)      # True if schema changed since approval
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class SchemaSnapshot(Base):
    __tablename__ = "schema_snapshots"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_profile_id = Column(String, nullable=False)
    schema_hash = Column(String, nullable=False)
    schema_json = Column(Text, nullable=False)
    captured_at = Column(DateTime, default=datetime.datetime.utcnow)


class UploadedDocument(Base):
    __tablename__ = "uploaded_documents"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_profile_id = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)       # "pdf" | "docx" | "txt" | "md"
    indexing_status = Column(String, default="pending")  # "pending"|"indexed"|"error"
    chroma_ids = Column(Text, nullable=True)         # JSON array of chroma chunk IDs
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)
```

### 5.3 SQLite FTS5 for Session Search [TR-11]

Full-text search must be set up in the **first Alembic migration** — not retrofitted later.

```python
# backend/alembic/versions/0001_initial_schema.py

def upgrade():
    # ... create all regular tables first ...

    # FTS5 virtual table for session keyword search
    # Cannot be created via SQLAlchemy ORM — use raw SQL
    op.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts
        USING fts5(
            content,
            sql_generated,
            session_id UNINDEXED,
            content='chat_messages',
            content_rowid='rowid'
        )
    """)

    # Keep FTS index in sync via triggers
    op.execute("""
        CREATE TRIGGER chat_messages_fts_insert AFTER INSERT ON chat_messages BEGIN
            INSERT INTO chat_messages_fts(rowid, content, sql_generated, session_id)
            VALUES (new.rowid, new.content, new.sql_generated, new.session_id);
        END
    """)
    op.execute("""
        CREATE TRIGGER chat_messages_fts_delete AFTER DELETE ON chat_messages BEGIN
            INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, sql_generated, session_id)
            VALUES ('delete', old.rowid, old.content, old.sql_generated, old.session_id);
        END
    """)
```

```python
# backend/api/history.py — session search using FTS5

def search_sessions(query: str, db: Session) -> list[ChatSession]:
    """Use FTS5 for keyword search. Never use LIKE '%keyword%'."""
    result = db.execute(
        text("""
            SELECT DISTINCT cm.session_id
            FROM chat_messages_fts fts
            JOIN chat_messages cm ON cm.rowid = fts.rowid
            WHERE chat_messages_fts MATCH :query
        """),
        {"query": query}
    ).fetchall()
    session_ids = [r[0] for r in result]
    return db.query(ChatSession).filter(ChatSession.id.in_(session_ids)).all()
```

### 5.4 Credentials — OS Keychain

```python
# backend/db/credentials.py
import keyring

SERVICE_NAME = "dbguree"

def store_credential(profile_id: str, secret: str) -> str:
    key = f"connection_{profile_id}"
    keyring.set_password(SERVICE_NAME, key, secret)
    return key

def retrieve_credential(credential_key: str) -> str:
    return keyring.get_password(SERVICE_NAME, credential_key)

def delete_credential(credential_key: str) -> None:
    keyring.delete_password(SERVICE_NAME, credential_key)

def store_api_key(provider: str, api_key: str) -> None:
    keyring.set_password(SERVICE_NAME, f"api_{provider}", api_key)

def retrieve_api_key(provider: str) -> str | None:
    return keyring.get_password(SERVICE_NAME, f"api_{provider}")
```

### 5.5 Connection Manager — Async Schema Indexing [TR-4]

Schema indexing on connection must be **asynchronous**. For a 50+ table schema, embedding and indexing can take 30–60 seconds and must not block the UI.

```python
# backend/connections/manager.py

import asyncio, hashlib, json
from enum import Enum

class IndexingStatus(Enum):
    IDLE = "idle"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    ERROR = "error"

# In-memory indexing progress store (keyed by connection_profile_id)
indexing_status_store: dict[str, dict] = {}

async def connect_and_index(profile_id: str, engine):
    """
    Non-blocking. Triggers schema extraction + RAG indexing in the background.
    UI polls GET /connections/{id}/indexing-status for progress.
    """
    indexing_status_store[profile_id] = {
        "status": IndexingStatus.IN_PROGRESS,
        "progress_pct": 0,
        "message": "Extracting schema..."
    }

    try:
        schema = get_schema(engine)
        schema_hash = compute_schema_hash(schema)

        indexing_status_store[profile_id]["progress_pct"] = 30
        indexing_status_store[profile_id]["message"] = "Indexing schema into knowledge graph..."

        await rag_manager.index_schema(schema, profile_id)

        indexing_status_store[profile_id] = {
            "status": IndexingStatus.COMPLETE,
            "progress_pct": 100,
            "message": "Knowledge graph ready"
        }

        # Check for schema changes and flag stale pairs
        await rag_manager.flag_stale_pairs(profile_id, schema_hash)

    except Exception as e:
        indexing_status_store[profile_id] = {
            "status": IndexingStatus.ERROR,
            "progress_pct": 0,
            "message": str(e)
        }
```

```
# New endpoint required by TR-4:
GET /connections/{id}/indexing-status
→ {status: "idle"|"in_progress"|"complete"|"error", progress_pct: 0-100, message: str}
```

**UI behaviour:** After `POST /connections/{id}/connect`, show a progress indicator in the Knowledge Graph sidebar entry. Poll `/indexing-status` every 2 seconds until `complete` or `error`. The connection is usable immediately (can start chatting); the knowledge graph simply won't retrieve schema context until indexing completes.

### 5.6 Document Parsing [TR-5]

```python
# backend/core/document_parser.py

# Required libraries (add to requirements.txt):
# pypdf>=4.0          — PDF text extraction
# python-docx>=1.0    — DOCX text extraction
# markdown-it-py>=3.0 — Markdown to plain text

def parse_document(file_path: str, file_type: str) -> str:
    """Extract plain text from uploaded document."""
    if file_type == "pdf":
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    elif file_type == "docx":
        from docx import Document
        doc = Document(file_path)
        return "\n".join(para.text for para in doc.paragraphs)

    elif file_type == "md":
        from markdown_it import MarkdownIt
        md = MarkdownIt()
        with open(file_path) as f:
            content = f.read()
        # Strip markdown syntax for plain text embedding
        return md.render(content)  # returns HTML; strip tags for embedding
        # Alternative: use a plain regex or `markdownify` library to strip to plaintext

    elif file_type == "txt":
        with open(file_path) as f:
            return f.read()

    else:
        raise ValueError(f"Unsupported file type: {file_type}")
```

### 5.7 RAG Manager — One Collection Per Connection [TR-6]

```python
# backend/core/rag_manager.py

# ChromaDB isolation strategy: ONE COLLECTION PER connection_profile_id
# Rationale:
# - Stronger data isolation — no cross-contamination possible between schemas
# - Simpler metadata filtering — no need to filter by connection_id on every query
# - Clean deletion — dropping a connection drops its collection entirely
# - Trade-off: more ChromaDB collections to manage; acceptable at MVP scale

from langchain_community.vectorstores import Chroma

class RAGManager:
    def __init__(self, persist_directory: str):
        self.persist_directory = persist_directory
        self._stores: dict[str, Chroma] = {}   # keyed by connection_profile_id

    def _get_store(self, connection_profile_id: str) -> Chroma:
        """Get or create the VectorStore for a specific connection."""
        if connection_profile_id not in self._stores:
            self._stores[connection_profile_id] = Chroma(
                collection_name=f"conn_{connection_profile_id}",
                persist_directory=self.persist_directory,
                embedding_function=NomicEmbeddingFunction()
            )
        return self._stores[connection_profile_id]

    def index_schema(self, schema: dict, connection_profile_id: str) -> None:
        store = self._get_store(connection_profile_id)
        # Chunk by table — one document per table with columns as content
        documents = _schema_to_documents(schema, connection_profile_id)
        store.add_documents(documents)

    def index_document(self, text: str, filename: str, connection_profile_id: str) -> list[str]:
        store = self._get_store(connection_profile_id)
        chunks = _chunk_text(text, chunk_size=512, overlap=64)
        docs = [Document(page_content=c, metadata={"source": filename}) for c in chunks]
        ids = store.add_documents(docs)
        return ids   # chroma_ids to store in UploadedDocument.chroma_ids

    def add_learned_pair(self, nl: str, sql: str, connection_profile_id: str, pair_id: str) -> str:
        store = self._get_store(connection_profile_id)
        doc = Document(
            page_content=f"Question: {nl}\nSQL: {sql}",
            metadata={"type": "learned_pair", "pair_id": pair_id}
        )
        ids = store.add_documents([doc])
        return ids[0]   # chroma_id

    def retrieve_context(self, query: str, connection_profile_id: str, k: int = 5) -> list:
        store = self._get_store(connection_profile_id)
        return store.similarity_search(query, k=k)

    def delete_collection(self, connection_profile_id: str) -> None:
        """Called when a connection profile is deleted."""
        store = self._get_store(connection_profile_id)
        store.delete_collection()
        self._stores.pop(connection_profile_id, None)

    def flag_stale_pairs(self, connection_profile_id: str, current_schema_hash: str) -> list[str]:
        """Return pair IDs whose schema_hash differs from current. Called after schema refresh."""
        # Stale detection is in SQLite (LearnedPair.schema_hash), not ChromaDB
        # ChromaDB is not queried here — this is a pure SQLite operation
        ...
```

### 5.8 Inference — Single Generation + One Retry [TR-2]

```python
# backend/core/inference.py

import threading
from llama_cpp import Llama
import psutil

_llm: Llama | None = None
_llm_lock = threading.Lock()
_cancel_event = threading.Event()   # Used for generation cancel [TR-12]

def detect_model_path() -> str:
    ram_gb = psutil.virtual_memory().total / (1024 ** 3)
    return "models/slm-sql-1.5b-q4.gguf" if ram_gb >= 8 else "models/slm-sql-0.5b-q4.gguf"

def get_llm() -> Llama:
    """Lazy load — model is not loaded until first inference request."""
    global _llm
    if _llm is None:
        with _llm_lock:
            if _llm is None:
                _llm = Llama(model_path=detect_model_path(), n_ctx=4096)
    return _llm

def cancel_generation():
    """Called by POST /chat/cancel. Sets the cancel event."""
    _cancel_event.set()

def _run_inference(prompt: str) -> str:
    _cancel_event.clear()
    llm = get_llm()
    result = []
    for token in llm(prompt, max_tokens=1024, stream=True):
        if _cancel_event.is_set():
            raise GenerationCancelledError("Generation cancelled by user")
        result.append(token["choices"][0]["text"])
    return "".join(result)

async def generate_sql(prompt: str, db_type: str) -> tuple[str, str]:
    """
    Single generation + one validation retry. No self-consistency. [TR-2]
    Returns (sql, explanation).
    """
    raw = await asyncio.to_thread(_run_inference, prompt)
    sql, explanation = _parse_llm_output(raw)

    is_valid, error = validate_sql(sql, db_type)
    if not is_valid:
        retry_prompt = prompt + f"\n\nThe SQL had a syntax error: {error}\nPlease correct it."
        raw = await asyncio.to_thread(_run_inference, retry_prompt)
        sql, explanation = _parse_llm_output(raw)

    return sql, explanation

class GenerationCancelledError(Exception):
    pass
```

### 5.9 Safety Layer — AST-Based Detection [TR-7]

**String matching is not used anywhere in the safety layer.** All detection uses sqlglot's AST.

```python
# backend/core/safety.py

import sqlglot
from sqlglot import exp

DESTRUCTIVE_NODE_TYPES = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,   # CREATE TABLE, CREATE INDEX, etc.
    exp.AlterTable,
    exp.TruncateTable,
)

def is_destructive(sql: str, db_type: str = "postgresql") -> tuple[bool, list[str]]:
    """
    AST-based destructive query detection. [TR-7]
    Handles:
    - Multi-statement queries (SELECT 1; DELETE FROM ...)
    - DML inside CTEs
    - Keywords in string literals (correctly ignored by the parser)

    Returns (is_destructive, list_of_detected_operation_names).
    """
    dialect_map = {"postgresql": "postgres", "mysql": "mysql", "mssql": "tsql"}
    dialect = dialect_map.get(db_type, "postgres")

    try:
        statements = sqlglot.parse(sql, dialect=dialect)
    except Exception:
        # If parsing fails, treat as potentially destructive (fail safe)
        return True, ["PARSE_ERROR"]

    detected = []
    for stmt in statements:
        for node_type in DESTRUCTIVE_NODE_TYPES:
            if stmt.find(node_type):
                detected.append(node_type.__name__.upper())

    return len(detected) > 0, detected


def check_read_only_violation(sql: str, db_type: str) -> tuple[bool, list[str]]:
    """Alias for is_destructive — used in read-only mode enforcement."""
    return is_destructive(sql, db_type)
```

**Two-layer read-only enforcement [TR-16]:**
1. **Layer 1 (UX):** `is_destructive()` runs before execution. In read-only mode → reject with error. Outside read-only mode → show confirmation modal.
2. **Layer 2 (DB):** When a connection is configured as read-only, all queries execute inside a read-only SQLAlchemy transaction. This is the actual security control — Layer 1 is a UX guard, not a security guarantee.

```python
# backend/connections/manager.py — read-only transaction enforcement

def execute_query(engine, sql: str, is_read_only: bool, row_limit: int, timeout_seconds: int):
    with engine.connect() as conn:
        if is_read_only:
            conn.execute(text("SET TRANSACTION READ ONLY"))  # PostgreSQL
            # MySQL: SET SESSION TRANSACTION READ ONLY
            # MSSQL: use a restricted DB user — SET TRANSACTION READ ONLY not supported
        result = conn.execute(text(sql))
        rows = result.fetchmany(row_limit + 1)   # fetch one extra to detect truncation
        truncated = len(rows) > row_limit
        return rows[:row_limit], result.keys(), truncated
```

### 5.10 LLM Generation Cancel [TR-12]

```python
# backend/api/chat.py

@router.post("/chat/cancel")
async def cancel_chat_generation(session_id: str):
    """
    Cancel an in-progress LLM generation for a session.
    Sets the cancel event in inference.py — the generation thread checks this flag
    between tokens and raises GenerationCancelledError.
    """
    cancel_generation()
    return {"status": "cancelled"}
```

**Frontend:** When the user clicks a "Stop generating" button (shown during AI generation), `POST /chat/cancel` is called immediately. The UI shows a "Generation stopped" message in the chat.

### 5.11 Model Download Strategy [TR-8]

```python
# backend/distribution/model_download.py

# Model files are NOT bundled in the installer.
# They are downloaded on first launch from a versioned CDN.
# The installer is ~50 MB. Models are downloaded separately.

MODEL_MANIFEST = {
    "slm-sql-1.5b-q4": {
        "url": "https://cdn.dbguree.com/models/v1/slm-sql-1.5b-q4.gguf",
        "sha256": "PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION",
        "size_bytes": 1_073_741_824,   # ~1 GB
        "min_ram_gb": 8,
    },
    "slm-sql-0.5b-q4": {
        "url": "https://cdn.dbguree.com/models/v1/slm-sql-0.5b-q4.gguf",
        "sha256": "PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION",
        "size_bytes": 419_430_400,     # ~400 MB
        "min_ram_gb": 4,
    },
    "nomic-embed-text-v1.5": {
        "url": "https://cdn.dbguree.com/models/v1/nomic-embed-text-v1.5.gguf",
        "sha256": "PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION",
        "size_bytes": 576_716_800,     # ~550 MB
        "min_ram_gb": 4,
    }
}

import hashlib, requests
from pathlib import Path

def download_model(model_key: str, dest_dir: Path, progress_callback=None) -> Path:
    """
    Resumable download with SHA-256 integrity verification.
    - If file exists and hash matches: skip download
    - If file partially exists: resume from byte offset (Range header)
    - If hash mismatch after download: delete and raise error
    """
    manifest = MODEL_MANIFEST[model_key]
    dest_path = dest_dir / f"{model_key}.gguf"
    existing_size = dest_path.stat().st_size if dest_path.exists() else 0

    if existing_size == manifest["size_bytes"]:
        if _verify_sha256(dest_path, manifest["sha256"]):
            return dest_path   # Already downloaded and verified

    headers = {"Range": f"bytes={existing_size}-"} if existing_size > 0 else {}

    with requests.get(manifest["url"], headers=headers, stream=True) as r:
        r.raise_for_status()
        mode = "ab" if existing_size > 0 else "wb"
        downloaded = existing_size
        total = manifest["size_bytes"]

        with open(dest_path, mode) as f:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                downloaded += len(chunk)
                if progress_callback:
                    progress_callback(downloaded / total)

    if not _verify_sha256(dest_path, manifest["sha256"]):
        dest_path.unlink()
        raise ValueError(f"SHA-256 verification failed for {model_key}. File deleted.")

    return dest_path

def _verify_sha256(path: Path, expected_hash: str) -> bool:
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest() == expected_hash
```

**Distribution notes:**
- Installer is a thin shell (~50 MB). No model files bundled.
- First launch triggers model download based on detected RAM.
- Progress is shown in the first-run UI with MB downloaded / total MB.
- Models are stored in the OS-standard app data directory:
  - macOS: `~/Library/Application Support/DBGuree/models/`
  - Windows: `%APPDATA%\DBGuree\models\`
  - Linux: `~/.local/share/DBGuree/models/`
- SHA-256 hashes in `MODEL_MANIFEST` must be filled with actual values before any distribution. `PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION` is a build-time error if left unchanged.

---

## 6. API Endpoints

All served on `127.0.0.1:PORT` (port parsed from sidecar stdout [TR-3]).

### 6.1 Connections

```
GET    /connections
POST   /connections
GET    /connections/{id}
PUT    /connections/{id}
DELETE /connections/{id}             → also calls delete_collection() on RAGManager
POST   /connections/{id}/test        → {success, latency_ms, db_version, error?}
POST   /connections/{id}/connect     → triggers async indexing, returns immediately
GET    /connections/{id}/schema      → schema tree (tables, columns, types, FKs, PKs)
POST   /connections/{id}/schema/refresh
GET    /connections/{id}/indexing-status   → {status, progress_pct, message} [TR-4]
GET    /connections/{id}/status      → ConnectionStatus (in-memory)
```

### 6.2 Chat

```
GET    /sessions
POST   /sessions
GET    /sessions/{id}/messages
POST   /sessions/{id}/messages       → {sql, explanation, message_id, originated_from_ai}
DELETE /sessions/{id}
GET    /sessions/search?q=keyword    → FTS5 search [TR-11]
POST   /chat/cancel                  → cancel in-progress generation [TR-12]
```

### 6.3 Query Execution

```
POST   /query/execute
  body: {
    connection_id: str,
    sql: str,
    session_id: str,
    message_id: str | None,       # If set, enables "Approve & Learn" prompt
    confirmed: bool = False        # Must be True for destructive queries to execute
  }

  Flow:
  1. AST-based destructive check via is_destructive() [TR-7]
  2. If read_only mode AND is_destructive → 400 {error: "read_only_violation", operations: [...]}
  3. If is_destructive AND NOT confirmed → 200 {require_confirmation: true, operations: [...]}
  4. If confirmed OR not destructive → execute in read-only transaction if applicable [TR-16]
  5. Return: {rows, columns, row_count, execution_time_ms, truncated, db_messages: []}
```

### 6.4 RAG Management

```
GET    /rag/{connection_id}/documents
POST   /rag/{connection_id}/documents
DELETE /rag/{connection_id}/documents/{id}

GET    /rag/{connection_id}/pairs
POST   /rag/{connection_id}/pairs
PUT    /rag/{connection_id}/pairs/{id}
DELETE /rag/{connection_id}/pairs/{id}
GET    /rag/{connection_id}/pairs/flagged
```

### 6.5 LLM Configuration

```
GET    /llm/status           → {backend, model, tier, ram_gb}
POST   /llm/switch
POST   /llm/cloud/configure
```

### 6.6 System

```
GET    /health               → {"status": "ok"} — Electron polls every 5s
GET    /system/ram           → {ram_gb, recommended_model}
GET    /system/models        → list of models with download status and local path
POST   /system/models/download/{model_key}  → trigger download, poll progress
GET    /system/models/download/{model_key}/status → {progress_pct, downloaded_bytes, total_bytes}
```

---

## 7. Functional Requirements

### FR-SAFE — Safety-Critical

| ID | Requirement |
|---|---|
| FR-SAFE-01 | Read-only mode: two-layer enforcement [TR-16]. Layer 1: AST detection rejects query with error. Layer 2: read-only SQLAlchemy transaction for actual DB enforcement. Visible toggle per connection. |
| FR-SAFE-02 | Destructive query warning: AST-based detection [TR-7]. Modal before INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER. Handles multi-statement SQL and DML in CTEs. |
| FR-SAFE-03 | Row limit: configurable per connection (default 1000). Results truncated with visible banner. |
| FR-SAFE-04 | Query timeout + cancel: configurable timeout (default 30s). Visible cancel button during any running query. |
| FR-SAFE-04b | LLM generation cancel: "Stop generating" button during AI generation. `POST /chat/cancel` sets cancel event. Response is "Generation stopped." [TR-12] |
| FR-SAFE-05 | Audit trail: every LearnedPair records created_at, session_id, schema_hash, updated_at. |
| FR-SAFE-06 | Schema-change invalidation: flag stale pairs on schema refresh. |
| FR-SAFE-07 | Result isolation from LLM: query results never automatically sent to LLM. Enforced in nl_to_sql.py. |

### FR-CON — Connection Manager

| ID | Requirement |
|---|---|
| FR-CON-01 | PostgreSQL, MySQL/MariaDB, Microsoft SQL Server |
| FR-CON-02 | Named connection profiles — create, rename, edit, delete |
| FR-CON-03 | Credentials in OS keychain — never SQLite or plaintext |
| FR-CON-04 | Test connection before saving |
| FR-CON-05 | Multiple simultaneous active connections |
| FR-CON-06 | Auto-extract schema + async RAG index on connect [TR-4] |
| FR-CON-07 | Schema browser tree: tables, columns, types, relationships |
| FR-CON-08 | Manual schema refresh + stale pair flagging |
| FR-CON-09 | Read-only mode toggle per connection |
| FR-CON-10 | Per-connection status dot: green/red/yellow/grey in sidebar |
| FR-CON-11 | DB version + latency in query panel header |
| FR-CON-12 | Indexing progress visible in Knowledge Graph sidebar entry [TR-4] |

### FR-CHAT — AI Assistant Panel

| ID | Requirement |
|---|---|
| FR-CHAT-01 | Accept natural language input |
| FR-CHAT-02 | Multi-turn conversation context |
| FR-CHAT-03 | Generated SQL in syntax-highlighted code block with timestamp |
| FR-CHAT-04 | "Push to Edit" button on SQL block: copies to active Monaco tab, focus stays in chat. If no active tab: create new tab. If query panel hidden: reveal it. [TR-10] |
| FR-CHAT-05 | Plain-language explanation alongside SQL |
| FR-CHAT-06 | Follow-up refinements within conversation |
| FR-CHAT-07 | Chat header: active connection + model name + inference tier |
| FR-CHAT-08 | Persona mode label (DataAnalyst / Developer / DBA) |
| FR-CHAT-09 | Persistent amber "☁ Cloud Active" indicator when cloud backend active |
| FR-CHAT-10 | "Move to Query Window" CTA: copies SQL + shifts focus to query panel |
| FR-CHAT-11 | Platform-adaptive submit shortcut: `Ctrl+Enter` (Windows/Linux), `⌘+Enter` (macOS) [TR-9] |
| FR-CHAT-12 | "Stop generating" button visible during active AI generation [TR-12] |

### FR-QRY — Query Panel

| ID | Requirement |
|---|---|
| FR-QRY-01 | Receive SQL via "Push to Edit" or "Move to Query Window" |
| FR-QRY-02 | Direct editing in Monaco Editor |
| FR-QRY-03 | Execute on user action only |
| FR-QRY-04 | Results in AG Grid — sortable, filterable, virtualised |
| FR-QRY-05 | Row count + execution time in results footer |
| FR-QRY-06 | Multiple query tabs — each an independent Monaco instance |
| FR-QRY-07 | SQL syntax highlighting + schema-aware autocomplete |
| FR-QRY-08 | "Approve & Learn" prompt after successful AI-originated query |
| FR-QRY-09 | DB errors in Messages tab with original query visible |
| FR-QRY-10 | All FR-SAFE-02, FR-SAFE-03, FR-SAFE-04 controls |
| FR-QRY-11 | Messages tab for DB server notices/warnings |
| FR-QRY-12 | CSV export button |
| FR-QRY-13 | Connection info header: DB type + version + latency |
| FR-QRY-14 | Save, Copy, Reset toolbar buttons |

### FR-RAG — Knowledge Graph / RAG Management

| ID | Requirement |
|---|---|
| FR-RAG-01 | Upload documents: PDF (pypdf), DOCX (python-docx), TXT, Markdown [TR-5] |
| FR-RAG-02–13 | (Unchanged from v0.2) |
| FR-RAG-14 | Knowledge Graph sidebar shows indexing status per connection [TR-4] |
| FR-RAG-15 | One ChromaDB collection per connection — never cross-connection contamination [TR-6] |
| FR-RAG-16 | Deleting a connection deletes its ChromaDB collection entirely [TR-6] |

### FR-HIST — Chat History

| ID | Requirement |
|---|---|
| FR-HIST-01–04 | (Unchanged from v0.2) |
| FR-HIST-05 | Session keyword search via SQLite FTS5. Never use `LIKE '%keyword%'`. [TR-11] |

### FR-LLM — LLM Configuration

| ID | Requirement |
|---|---|
| FR-LLM-01–06 | (Unchanged from v0.2) |
| FR-LLM-07 | Generation cancel via "Stop generating" button + `POST /chat/cancel` [TR-12] |
| FR-LLM-08 | Model download on first launch: versioned CDN + SHA-256 + resumable + progress [TR-8] |

---

## 8. Non-Functional Requirements

| ID | Area | Target | Notes |
|---|---|---|---|
| NFR-01 | Privacy | All processing local by default | Cloud opt-in only |
| NFR-02 | Security | Credentials in OS keychain only | Two-layer read-only enforcement [TR-16] |
| NFR-03 | Performance | SQL generation <10 seconds on 16 GB / 1.5B | Single generation, no self-consistency [TR-2] |
| NFR-04 | Performance | 10k rows in AG Grid without UI blocking | AG Grid row virtualisation |
| NFR-05 | Reliability | DB drops handled gracefully | Retry + error surface |
| NFR-06 | Usability | First NL query <5 min post-install | Validate with user test |
| NFR-07 | Compatibility | macOS 12+, Win 10/11, Ubuntu 22.04+ | No user-installed dependencies |
| NFR-08 | Extensibility | LLM, vector store, DB driver as abstract interfaces | VectorStore enforced Day 1 |

---

## 9. UI Layout

### 9.1 Main Workspace

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  dG  DBGuree                                                     [icon bar]  │
├───────────────────────┬─────────────────────────┬────────────────────────────┤
│  DATABASE INSTANCE    │  AI ASSISTANT           │  QUERY PANEL               │
│                       │  ✦ DataAnalyst   ▾      │                            │
│  ● Production (AWS)   │  Production (AWS) •     │  [▶ Run Query][💾][📋][↺]  │
│    [Active]           │  SLM-1.5B • Local       │  PostgreSQL 15.2 • 24ms    │
│  ● Staging DB         │                         │                            │
│  ○ Analytics          │  ┌─────────────────┐    │  [Tab 1 ×][Tab 2 ×][+]     │
│  + Add Connection     │  │ AI response     │    │  ┌──────────────────────┐  │
│                       │  │ 10:24 AM        │    │  │ Monaco Editor        │  │
│  KNOWLEDGE GRAPH      │  │ ┌─────────────┐ │    │  │ 1  SELECT ...        │  │
│                       │  │ │ SELECT ...  │ │    │  └──────────────────────┘  │
│  ◉ Production (AWS)   │  │ │[Push to Edit│ │    │                            │
│    ████░░ Indexing 60%│  │ └─────────────┘ │    │  [Results][Messages]  [CSV]│
│  ◉ Staging DB         │  └─────────────────┘    │  ┌──────────────────────┐  │
│    ✓ Ready            │                         │  │ AG Grid              │  │
│                       │  [→ Move to Query Window│  │ 5,234 rows • 342ms   │  │
│  ─────────────────    │  [■ Stop generating]    │  └──────────────────────┘  │
│  ⚙ Settings           │  ┌─────────────────────┐│  ┌──────────────────────┐  │
│                       │  │ Ask AI... Ctrl/⌘+↵ ││  │✓ Query executed.     │  │
│                       │  └─────────────────────┘│  │[✦ Approve & Learn][Skip]│
│                       │                         │  └──────────────────────┘  │
├───────────────────────┴─────────────────────────┴────────────────────────────┤
│ STATUS: [●] SLM-SQL-1.5B • Local   │  Production DB (AWS)  │  [☁ Cloud: OFF]│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Keyboard Shortcuts [TR-9]

| Action | macOS | Windows / Linux |
|---|---|---|
| Submit NL input | `⌘+Enter` | `Ctrl+Enter` |
| Run Query | `⌘+R` | `Ctrl+R` |
| New query tab | `⌘+T` | `Ctrl+T` |
| Close query tab | `⌘+W` | `Ctrl+W` |

### 9.3 "Push to Edit" Fallback Behaviour [TR-10]

When the user clicks "Push to Edit" on a SQL block in the chat panel:

| State | Behaviour |
|---|---|
| Query panel visible, tab has focus | SQL copied to focused tab; cursor moves to end of SQL |
| Query panel visible, no tab has focus | SQL copied to last-active tab; that tab gets focus |
| Query panel visible, no tabs exist | New empty tab created; SQL copied into it |
| Query panel hidden / collapsed | Query panel revealed; new tab created if none exist; SQL copied |

### 9.4 Destructive Query Warning Modal

```
┌─────────────────────────────────────────────────┐
│  ⚠️  Destructive Query Detected                  │
│                                                  │
│  Detected operations: DELETE                    │
│                                                  │
│  DELETE FROM orders WHERE status = 'cancelled'  │
│                                                  │
│  This action may be irreversible.               │
│                                                  │
│          [Cancel]     [Run Anyway]              │
└─────────────────────────────────────────────────┘
```

---

## 10. Electron Shell

### 10.1 IPC Security (required from first commit)

```javascript
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,   // REQUIRED
    nodeIntegration: false,   // REQUIRED
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### 10.2 Python Sidecar Lifecycle

```javascript
async function startBackend() {
  pythonProcess = spawn(pythonExecutable, ['backend/main.py']);
  backendPort = await parsePortFromStdout(pythonProcess);   // [TR-3]
  await waitForHealthCheck(backendPort, 30000);
}

function stopBackend() {
  if (pythonProcess) { pythonProcess.kill('SIGTERM'); pythonProcess = null; }
}

// Register on ALL exit paths
app.on('before-quit', stopBackend);
app.on('window-all-closed', stopBackend);
process.on('exit', stopBackend);
process.on('SIGTERM', () => { stopBackend(); process.exit(0); });
```

---

## 11. Core User Flows

### 11.1 First-Time Setup
1. Install (thin installer, ~50 MB)
2. First launch: detect RAM → recommend model
3. Show download progress (resumable, SHA-256 verified) [TR-8]
4. Create first connection profile
5. Connect → async schema indexing → Knowledge Graph progress shown [TR-4]
6. Optionally upload documents
7. Ready to query

### 11.2 Natural Language → Execution
1. User types NL question, submits with `Ctrl/⌘+Enter` [TR-9]
2. "Stop generating" button appears [TR-12]
3. Backend retrieves context, runs single-generation inference [TR-2]
4. SQL + explanation shown with timestamp
5. "Push to Edit" → copies to active/new tab [TR-10]; "Move to Query Window" → shifts focus
6. User edits (optional), clicks Run Query
7. AST-based destructive check [TR-7] → modal if needed → execute in read-only transaction if applicable [TR-16]
8. Results in AG Grid, DB messages in Messages tab
9. "Approve & Learn" prompt shown if originated_from_ai [TR-14]

### 11.3 Session Search
1. Open History panel
2. Type keyword in search field
3. FTS5 search across all session messages [TR-11]
4. Results ranked by relevance, showing session title + connection

---

## 12. Wireframe Gaps to Address

| # | Missing Element | Priority |
|---|---|---|
| 1 | "Approve & Learn" prompt in results footer | Critical |
| 2 | Status bar at bottom | Critical |
| 3 | Chat header (connection + model + tier) | Critical |
| 4 | Cloud active indicator (amber) | Critical |
| 5 | "Stop generating" button during generation | High [TR-12] |
| 6 | Schema browser tree | High |
| 7 | Query tabs | High |
| 8 | Destructive query warning modal | High |
| 9 | Messages tab with error badge | High |
| 10 | Row count + execution time footer | High |
| 11 | Indexing progress in Knowledge Graph sidebar | High [TR-4] |
| 12 | Read-only toggle in connection form | Medium |
| 13 | Row limit warning banner | Medium |

---

## 13. Build Order

**PREREQUISITE — Run all four spikes and review results before Phase 1 begins. [TR-15]**
Spike results are the most critical go/no-go input in the spec. If the 1.5B model cannot run usably on target hardware, the local-inference proposition must be rethought before any code is written.

**Phase 1 — Backend (after spikes)**
1. FastAPI app — startup sequence, stdout port signal, health check [TR-3]
2. SQLite models + Alembic migration 0001 (includes FTS5) [TR-11]
3. OS keychain (`keyring`)
4. SQLAlchemy connection manager + async schema indexing [TR-4]
5. Document parser (pypdf, python-docx, markdown-it-py) [TR-5]
6. llama.cpp SLM wrapper — lazy load, cancel support [TR-12]
7. nomic-embed-text embeddings
8. ChromaDB via LangChain VectorStore — one collection per connection [TR-6]
9. NL→SQL chain — single generation + one retry [TR-2]
10. sqlglot validation + AST-based safety detection [TR-7]
11. Model download module — CDN + SHA-256 + resumable [TR-8]
12. All API endpoints

**Phase 2 — Electron shell**
1. Main process + stdout port parse + sidecar lifecycle [TR-3]
2. IPC security (contextIsolation, preload)
3. Three-panel layout
4. Sidebar: Database Instance + Knowledge Graph + indexing progress [TR-4]
5. Status bar
6. Monaco Editor + query tabs [FR-QRY-06]
7. AG Grid results + Messages tab
8. Chat panel: NL input with `Ctrl/⌘+Enter` [TR-9], SQL block with "Push to Edit" [TR-10]
9. "Stop generating" button [TR-12]

**Phase 3 — Core flows**
1. "Approve & Learn" prompt
2. Destructive query warning modal (AST-powered) [TR-7]
3. Schema browser tree
4. Read-only enforcement UI + two-layer backend [TR-16]
5. Row limit + timeout + banners
6. First-run download flow [TR-8]

**Phase 4 — Secondary panels + polish**
1. Chat History panel + FTS5 search [TR-11]
2. RAG Manager panel
3. LLM Config panel
4. Settings panel
5. Cloud LLM backend (Pro feature flag)

---

## 14. Technical Spikes

| # | Spike | What to measure |
|---|---|---|
| 1 | LLM Inference | Load 1.5B, send 10 NL→SQL prompts, measure inference time + RAM |
| 2 | Embedding | Load nomic-embed-text, embed 50-table schema, measure time + RAM |
| 3 | Both models loaded | Combined RAM on 8 GB + 16 GB — validates fallback viability |
| 4 | Query execution | PostgreSQL, 1k/10k/50k rows, time to first row, memory |

**Spike 1 should also validate the single-generation approach:** if inference time on a single generation exceeds 15 seconds on target hardware, the <10 second NFR-03 target needs to be adjusted before scaffolding.

---

## 15. Out of Scope for MVP

- Multi-user / team collaboration
- Shared RAG across machines
- Cloud deployment or web access
- Query scheduling or automation
- Result export beyond CSV
- Fine-tuning or custom model training
- Cross-connection query workflows
- Token usage dashboard
- RAG export / import
- Chat history export
- Query bookmarks
- In-app model marketplace
- Session branching

---

## 16. Watch-Out Notes

| Area | Risk | Mitigation |
|---|---|---|
| LangChain | Breaking changes between major versions | Pin `>=0.3,<0.4` |
| Electron | Version changes break IPC/packaging | Pin version, upgrade deliberately |
| Python sidecar | Leaked process on crash | Shutdown handler Day 1 |
| ChromaDB ↔ SQLite | Path collision | Explicit startup assertion in main.py [TR-13] |
| SQLite migrations | No built-in tooling | Alembic on first commit with FTS5 [TR-11] |
| SQLite WAL | Locking under concurrent access | WAL mode at connection init |
| Electron IPC | Security misconfiguration | contextIsolation before any UI code |
| AG Grid | Enterprise import | `ag-grid-community` ONLY |
| Qwen2.5-Coder | 3B+ different licensing | Verify Apache 2.0 only for 0.5B and 1.5B |
| 8 GB machines | Combined footprint tight | Lazy-load LLM on first use [TR-2] |
| Safety detection | String matching bypassed by literals/multi-statement | Use sqlglot AST only [TR-7] |
| Self-consistency | Would 3× inference time | Dropped for MVP [TR-2] |
| Read-only enforcement | Keyword check is UX only, not a security control | Two-layer: AST + read-only transaction [TR-16] |
| Model distribution | No hosting URL or hash yet | Placeholder hashes must be replaced before any distribution [TR-8] |

---

## 17. Licence Verification

| Component | Licence |
|---|---|
| LangChain | MIT |
| ChromaDB | Apache 2.0 |
| Qwen2.5-Coder-0.5B / 1.5B | Apache 2.0 |
| nomic-embed-text-v1.5 | Apache 2.0 |
| llama.cpp / llama-cpp-python | MIT |
| sqlglot | MIT |
| SQLAlchemy + Alembic | MIT |
| Monaco Editor | MIT |
| AG Grid Community | MIT |
| Electron | MIT |
| SQLite | Public Domain |
| FastAPI + Uvicorn | MIT |
| keyring | MIT |
| psutil | BSD |
| pypdf | BSD [TR-5] |
| python-docx | MIT [TR-5] |
| markdown-it-py | MIT [TR-5] |

---

*End of specification v0.3. Prerequisite: run all four spikes. Then start Phase 1, Step 1.*

