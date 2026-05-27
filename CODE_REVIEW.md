# DBGuree - Complete Code Review & Architecture Overview

**Date:** April 1, 2026  
**Project:** DBGuree - Local-first SQL workbench with on-device AI  
**Spec Version:** 0.3 (Tech Review Incorporated)

---

## Executive Summary

DBGuree is a sophisticated **Electron + FastAPI desktop application** that enables users to query databases using natural language. The system prioritizes **privacy, security, and local-first computation**:

- 🔐 **Zero LLM-Database Connection**: AI never touches the DB directly
- 🏠 **Local Models Only**: All inference runs on-device using quantized LLMs
- 🛡️ **AST-Based Safety**: Destructive query detection via sqlglot, not string matching
- 📚 **RAG Learning Loop**: Approved queries teach the system schema patterns
- 🔒 **Encrypted Credentials**: Passwords stored in OS keychains, never in plaintext

---

## Architecture Overview

### System Topology

```
┌─────────────────────────────────────────────┐
│  Electron Desktop Client (Chromium + Node) │
│  ├─ Monaco Editor (SQL editing)            │
│  ├─ AG Grid (results visualization)        │
│  └─ Schema Browser (sidebar)               │
└────────────────┬────────────────────────────┘
                 │ HTTP (localhost, parsed port)
┌────────────────▼────────────────────────────┐
│  Python FastAPI Backend (Sidecar Process)  │
│  ├─ NL-to-SQL Service                      │
│  ├─ LangChain + ChromaDB (RAG)             │
│  ├─ SQLAlchemy (DB connections)           │
│  └─ Safety Layer (sqlglot AST)             │
└────────────────┬────────────────────────────┘
                 │ llama-cpp-python (threaded)
┌────────────────▼────────────────────────────┐
│  Local Inference (quantized LLMs)           │
│  ├─ Qwen2.5-Coder-1.5B (Q4) [1GB]          │
│  ├─ Qwen2.5-Coder-0.5B (Q4) [400MB]       │
│  └─ nomic-embed-text-v1.5 [550MB]         │
└─────────────────────────────────────────────┘
```

### Core Loop

```
User Question
    ↓
RAG Retrieval (schema + learned pairs)
    ↓
LLM Generation (single pass + retry on error)
    ↓
Syntax Validation (sqlglot AST)
    ↓
Display SQL + Explanation in Chat
    ↓
User Action: "Push to Edit" or "Move to Query"
    ↓
Optional Editing in Monaco
    ↓
User Clicks "Run Query"
    ↓
Destructive Check (AST-based)
    ↓
Execute in Read-Only Transaction (if needed)
    ↓
Display Results
    ↓
"Approve & Learn" → Store in ChromaDB
```

---

## Backend Architecture (Python/FastAPI)

### 1. Entry Point: `backend/main.py`

**Responsibilities:**
- Initialize SQLite engine in WAL mode for concurrency
- Assert path isolation (SQLite ≠ ChromaDB directories)
- Run Alembic migrations to HEAD
- Initialize FTS5 virtual table for session search
- Start FastAPI server
- **Port discovery mechanism (TR-3):** Print JSON `{"status": "ready", "port": N}` to stdout for Electron to parse

**Key Code:**
```python
async def _startup():
    engine = init_engine(settings.SQLITE_DB_PATH)
    
    # Path isolation assertion [TR-13]
    assert sqlite_path != chroma_path
    
    # Migrations
    alembic_upgrade_to_head(engine)
    
    # FTS5 for search
    init_fts5(engine)

# Prints: {"status": "ready", "port": 64430}
print(json.dumps({"status": "ready", "port": port}))
```

---

### 2. Database Layer: `backend/db/`

#### Models (`models.py`)
- **ConnectionProfile**: Stores DB connection details (host, port, credentials via keyring reference)
- **ConnectionStatus (Pydantic, NOT SQLAlchemy)**: In-memory connection health (latency, errors)
- **ChatSession**: Conversation groupings per connection
- **ChatMessage**: Individual messages with `originated_from_ai` flag for learning prompts
- **LearnedPair**: NL question ↔ SQL pairs stored in ChromaDB for RAG
- **SchemaSnapshot**: Cached schema for fast indexing status display

**Critical Design Decision:**
```python
class ConnectionStatus(BaseModel):  # Pydantic, NOT SQLAlchemy
    """In-memory ONLY. Resets on backend restart. [TR-1]"""
    status: str  # "connected" | "error" | "disconnected"
    latency_ms: Optional[int]
```

#### Repositories (Repository Pattern)

- **`chat_repository.py`**: CRUD for chat sessions & messages
- **`connection_repository.py`**: CRUD for connection profiles
- **`schema_repository.py`**: Store/retrieve schema snapshots
- **`rag_repository.py`**: Metadata for learned pairs

**All database access goes through these repos** — no raw queries in controllers.

#### Credentials Management (`db/credentials.py`)

- **store_credential(id, password)** → Stores in OS keychain, returns reference key
- **retrieve_credential(key)** → Retrieves from OS keychain securely
- **delete_credential(key)** → Removes from OS keychain

Supports: macOS Keychain, Windows DPAPI, Linux libsecret via `keyring` library.

---

### 3. Connection Management: `backend/connections/manager.py`

**In-Memory State (reset on every backend restart):**
- `connection_status_store`: `dict[str, ConnectionStatus]` — live health per connection
- `indexing_status_store`: `dict[str, dict]` — async indexing progress

**Core Class: `ConnectionManager`**

**Methods:**
1. **`get_engine(profile)`** → Creates SQLAlchemy engine with correct dialect
2. **`test_connection(profile)`** → Health check, returns latency & DB version
3. **`execute_query(engine, sql, ...)`** → 
   - Enforce read-only transaction if needed [TR-16]
   - Apply row limit
   - Apply query timeout
   - Return `QueryResult` with row count, execution time, messages
4. **`index_schema_async(profile)`** → Background task for schema extraction & RAG indexing
5. **`get_schema_async(profile)`** → Full schema extraction

**Database URL Templates:**
```python
"postgresql": "postgresql+psycopg2://{user}:{pwd}@{host}:{port}/{db}"
"mysql": "mysql+pymysql://{user}:{pwd}@{host}:{port}/{db}"
"mssql": "mssql+pyodbc://{user}:{pwd}@{host}:{port}/{db}?driver=ODBC+Driver+17"
```

---

### 4. Core Inference & NL-to-SQL

#### Inference Layer (`backend/core/inference.py`)

**`LocalLlamaInference`**
- Wraps `llama-cpp-python` for on-device inference
- Lazy-loads model on first call (thread-safe)
- Supports **cancellation** via `threading.Event` checked between tokens [TR-12]
- Chooses model based on available RAM:
  - **≥8 GB**: Qwen2.5-Coder-1.5B (better quality)
  - **<8 GB**: Qwen2.5-Coder-0.5B (faster, smaller)

```python
class LocalLlamaInference(InferenceBackend):
    def __init__(self, model_path: str):
        self._model = None  # Lazy-loaded
        self._cancel_event = threading.Event()
    
    async def generate(self, prompt: str, max_tokens: int) -> str:
        return await asyncio.to_thread(self._run_inference_sync, prompt, max_tokens)
    
    def cancel(self):
        self._cancel_event.set()  # Stops generation
```

#### Embeddings (`backend/core/embeddings.py`)

- Wraps `nomic-embed-text-v1.5` for document & schema chunking
- Runs locally, no external API calls
- Abstracted via `EmbeddingProvider` interface

#### NL-to-SQL Service (`backend/core/nl_to_sql.py`)

**Strategy: Single generation + one validation retry [TR-2]** (no self-consistency)

```python
class NLToSQLService:
    def generate_sql(
        self,
        question: str,
        connection_id: str,
        persona: str = "analyst"
    ) -> NLToSQLResult:
        # 1. RAG retrieval
        schema_docs = self._rag_manager.similarity_search(question, connection_id, k=5)
        pair_docs = self._rag_manager.similarity_search(question, connection_id, k=3)
        
        # 2. Prompt construction
        prompt = _PROMPT_TEMPLATE.format(
            persona_instruction=_PERSONA_INSTRUCTIONS[persona],
            db_type=profile.db_type,
            schema_context="\n".join(d.page_content for d in schema_docs),
            pair_context="\n".join(d.page_content for d in pair_docs),
            question=question
        )
        
        # 3. Generate
        response = await self._inference.generate(prompt, max_tokens=2048)
        
        # 4. Parse & validate
        sql = self._parse_sql_from_response(response)
        validation = self._validator.validate(sql, profile.db_type)
        
        # 5. Retry once on syntax error
        if not validation.is_valid:
            response = await self._inference.generate(retry_prompt, max_tokens=2048)
            sql = self._parse_sql_from_response(response)
        
        return NLToSQLResult(sql=sql, explanation=explanation)
```

**Prompt Format:**
```
{persona_instruction}

You are generating SQL for a {db_type} database.

## Schema context:
{relevant_tables_and_columns}

## Similar past queries (for reference):
{learned_nl_sql_pairs}

## User question:
{user_question}

Respond with ONLY the following format — no extra text:
SQL:
```sql
<your SQL here>
```
EXPLANATION:
<one sentence explaining what this query does>
```

---

### 5. Safety & Validation

#### SQL Validation (`backend/core/sql_validator.py`)

- Syntax checking using `sqlglot.parse()`
- Returns `SQLValidationResult` with error details if invalid

#### Destructive Query Detection (`backend/core/safety.py`)

**Critical: AST-based, NOT string-based [TR-7]**

```python
DESTRUCTIVE_NODE_TYPES = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,      # CREATE TABLE, CREATE INDEX, etc.
    exp.Alter,
    exp.TruncateTable,
)

def is_destructive(sql: str, db_type: str) -> tuple[bool, list[str]]:
    """Returns (is_destructive, list_of_detected_operations)."""
    statements = sqlglot.parse(sql, dialect=_DIALECT_MAP[db_type])
    
    detected = []
    for stmt in statements:
        for node_type in DESTRUCTIVE_NODE_TYPES:
            if stmt.find(node_type):  # AST search
                detected.append(node_type.__name__.upper())
    
    return len(detected) > 0, detected
```

**Key Benefits:**
- ✅ Handles keywords in string literals safely
- ✅ Detects DML inside CTEs
- ✅ Multi-statement query support
- ✅ Dialect-aware parsing

**Read-Only Enforcement (Two-Layer) [TR-16]:**

1. **Layer 1 (UX):** AST-based check warns user before execution
2. **Layer 2 (DB):** SQLAlchemy executes in read-only transaction

```python
# In ConnectionManager.execute_query():
if profile.read_only:
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION READ ONLY;")
            result = conn.execute(text(sql))
```

---

### 6. RAG System (LangChain + ChromaDB)

#### RAG Manager (`backend/core/rag_manager.py`)

**VectorStore Interface Only** — no direct ChromaDB API calls

```python
class RAGManager(VectorStoreProvider):
    """One Chroma collection per connection_profile_id [TR-6]"""
    
    def __init__(self, persist_directory: str, embedding_provider):
        self._stores: dict[str, Chroma] = {}  # Lazy-loaded per connection
    
    def _get_or_create_store(self, connection_id: str) -> Chroma:
        if connection_id not in self._stores:
            self._stores[connection_id] = Chroma(
                collection_name=f"conn_{connection_id}",
                persist_directory=self._persist_directory,
                embedding_function=self._embeddings,
            )
        return self._stores[connection_id]
    
    # LangChain interface methods:
    def add_documents(self, docs: list[Document], connection_id: str) -> list[str]:
        store = self._get_or_create_store(connection_id)
        return store.add_documents(docs)
    
    def similarity_search(self, query: str, connection_id: str, k: int = 5) -> list[Document]:
        store = self._get_or_create_store(connection_id)
        return store.similarity_search(query, k=k)
```

**Isolation Strategy [TR-6]:**
- One collection per connection prevents cross-contamination
- Simpler metadata filtering
- Clean deletion drops entire collection

**What Gets Indexed:**
1. **Schema documents** → One document per table with column descriptions
2. **Learned pairs** → NL questions + approved SQL from user interactions
3. **User documents** → PDFs, Word docs, Markdown uploaded for knowledge base

#### Text Chunking (`backend/utils/text_chunker.py`)

- Splits large documents into ~1000-token chunks with overlap
- Preserves semantic boundaries

---

### 7. API Routes

#### Chat API (`backend/api/chat.py`)

- `GET /sessions` → List chat sessions
- `POST /sessions` → Create new session
- `GET /sessions/{id}/messages` → Get messages in session
- `POST /sessions/{id}/message` → Send user message, trigger NL-to-SQL generation
- `POST /chat/cancel` → Cancel in-flight generation [TR-12]

**Key Endpoint: `POST /sessions/{id}/message`**
```python
@router.post("/sessions/{id}/message", response_model=ChatMessageResponse)
async def send_message(
    id: str,
    body: NLQueryRequest,
    repo: ChatRepository = Depends(get_chat_repo),
    rag: RAGManager = Depends(get_rag_manager),
    nl_service: NLToSQLService = Depends(get_nl_service),
):
    """
    1. Store user message
    2. RAG retrieve context
    3. Generate SQL (with cancellation support [TR-12])
    4. Validate syntax
    5. Return AI message with SQL & explanation
    """
    # Create & store user message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=id,
        role="user",
        content=body.question
    )
    repo.create(user_msg)
    
    # Generate SQL
    try:
        result = await nl_service.generate_sql(
            question=body.question,
            connection_id=session.connection_profile_id,
            persona=session.persona_mode
        )
    except GenerationCancelledError:
        return ChatMessageResponse(content="[Generation cancelled]")
    
    # Store AI message with originated_from_ai=True [TR-14]
    ai_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=id,
        role="assistant",
        content=result.explanation,
        sql_generated=result.sql,
        originated_from_ai=True  # Used for "Approve & Learn" prompt
    )
    repo.create(ai_msg)
    
    return ChatMessageResponse.from_orm(ai_msg)
```

#### Connections API (`backend/api/connections.py`)

- `GET /connections` → List all connection profiles
- `POST /connections` → Create (stores password in keychain)
- `GET /connections/{id}` → Get profile
- `PUT /connections/{id}` → Update profile
- `DELETE /connections/{id}` → Delete (removes from keychain)
- `GET /connections/{id}/status` → Connection health
- `POST /connections/{id}/test` → Test connection, return latency & version
- `POST /connections/{id}/index` → Trigger async schema indexing
- `GET /connections/{id}/indexing-status` → Poll indexing progress [TR-4]

**Indexing Status Polling [TR-4]:**
```python
@router.get("/{id}/indexing-status", response_model=IndexingStatusResponse)
def get_indexing_status(
    id: str,
    manager: ConnectionManager = Depends(get_connection_manager),
):
    status = indexing_status_store.get(id, {})
    return IndexingStatusResponse(
        status=status.get("status", "idle"),  # "idle" | "in_progress" | "complete" | "error"
        progress=status.get("progress"),      # e.g., "Indexed 5/12 tables"
        current_table=status.get("current_table"),
        error_message=status.get("error_message")
    )
```

#### Query Execution API (`backend/api/query.py`)

- `POST /query/execute` → Execute SQL with safety checks

**Execution Flow:**
```python
@router.post("/query/execute", response_model=QueryExecuteResponse)
def execute_query(body: QueryExecuteRequest):
    profile = conn_repo.get_by_id(body.connection_id)
    
    # Step 1: AST-based destructive check [TR-7]
    destructive, operations = is_destructive(body.sql, profile.db_type)
    
    # Step 2: Hard block for read-only + destructive
    if profile.read_only and destructive:
        raise HTTPException(status_code=400, detail={
            "error": "read_only_violation",
            "operations": operations
        })
    
    # Step 3: Require confirmation for destructive
    if destructive and not body.confirmed:
        return QueryExecuteResponse(
            rows=[],
            columns=[],
            require_confirmation=True,
            operations=operations
        )
    
    # Step 4: Execute (with Layer 2 read-only enforcement inside manager)
    result = manager.execute_query(engine, sql, read_only=profile.read_only)
    return QueryExecuteResponse(
        rows=result.rows,
        columns=result.columns,
        row_count=result.row_count,
        execution_time_ms=result.execution_time_ms
    )
```

#### RAG API (`backend/api/rag.py`)

- `POST /rag/document` → Upload & index document
- `POST /rag/schema` → Index database schema
- `DELETE /rag/{connection_id}` → Clear all RAG data for connection
- `POST /rag/approve-pair` → Store NL-SQL pair from user-approved query

**Approve & Learn:**
```python
@router.post("/rag/approve-pair")
def approve_pair(body: ApprovePairRequest):
    """
    Called after user reviews & executes AI-generated SQL.
    Stores (question, sql) pair in ChromaDB for future RAG retrieval.
    """
    doc = Document(
        page_content=f"Q: {body.question}\nA: {body.sql}",
        metadata={
            "connection_id": body.connection_id,
            "type": "learned_pair",
            "approved_at": datetime.utcnow().isoformat()
        }
    )
    chroma_id = rag_manager.add_documents([doc], body.connection_id)[0]
    
    # Store metadata in SQLite
    rag_repo.create(LearnedPair(
        connection_profile_id=body.connection_id,
        chroma_id=chroma_id,
        question=body.question,
        sql=body.sql
    ))
```

#### System API (`backend/api/system.py`)

- `GET /system/info` → System health (RAM, CPU, LLM status)
- `POST /models/download` → Download LLM models with resumable support [TR-8]

---

## Frontend Architecture (React/Electron)

### 1. Electron Main Process (`electron/main.js`)

**Responsibilities:**
1. Spawn Python backend as subprocess
2. Parse port from backend stdout [TR-3]
3. Wait for health check
4. Create BrowserWindow
5. Load React UI
6. Clean shutdown on app quit (including force-quit)

**Backend Lifecycle:**
```javascript
function startBackend() {
  return new Promise((resolve, reject) => {
    pythonProcess = spawn('python3', ['../backend/main.py']);
    
    // Parse {"status": "ready", "port": N} from stdout [TR-3]
    pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        try {
          const msg = JSON.parse(line.trim());
          if (msg.status === 'ready' && msg.port) {
            backendPort = msg.port;
            resolve(msg.port);
          }
        } catch (_) {}
      }
    });
    
    setTimeout(() => reject(new Error('Timeout')), 30000);
  });
}

app.on('before-quit', () => {
  if (pythonProcess) pythonProcess.kill();
});
```

**Health Check Polling:**
```javascript
function waitForHealthCheck(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const poll = () => {
      http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    };
    
    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Health check timeout'));
      } else {
        setTimeout(poll, 500);
      }
    };
    
    poll();
  });
}
```

### 2. Context Providers

#### AppContext (`context/AppContext.jsx`)
- Global app state: `activePanel`, `activeConnectionId`, `backendReady`
- Notification system: `notifications` array with auto-dismiss
- Methods: `addNotification()`, `clearNotification()`

#### ConnectionContext (`context/ConnectionContext.jsx`)
- Active connections list
- Selected connection state
- Methods: `createConnection()`, `updateConnection()`, `deleteConnection()`, `testConnection()`

#### ChatContext (`context/ChatContext.jsx`)
- Active chat session
- Messages in session
- Methods: `createSession()`, `sendMessage()`, `cancelGeneration()`

### 3. Custom Hooks

#### `useApi.js`
Base HTTP client with:
- Automatic port discovery from `window._backendPort`
- Error handling & toast notifications
- Retry logic for transient failures

```javascript
export async function apiCall(method, endpoint, body = null) {
  const port = window._backendPort;
  const url = `http://localhost:${port}${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'API error');
  }
  
  return response.json();
}
```

#### `useChat.js`
- Manages chat session state
- `sendMessage(question)` → calls `/chat/sessions/{id}/message`
- `cancelGeneration()` → calls `/chat/cancel`
- Streams responses (if backend supports streaming)

#### `useConnections.js`
- Fetches list of connections
- Handles connection creation/update/delete
- Displays connection status with live latency

#### `useQuery.js`
- Manages query panel state
- `executeQuery(sql)` → calls `/query/execute`
- Handles destructive query warnings
- Manages result pagination & row limit

#### `usePlatform.js`
- Detects OS (macOS, Windows, Linux)
- Platform-adaptive keyboard shortcuts [TR-9]: `Ctrl/⌘+Enter`

#### Other Hooks
- `useSchema.js` → Fetch & display schema tree
- `useIndexingStatus.js` → Poll indexing progress [TR-4]
- `useSystemInfo.js` → Get system RAM, LLM model info

### 4. Layout Components

#### TitleBar (`layout/TitleBar.jsx`)
- Window controls (minimize, maximize, close)
- Current connection display
- Persona selector (analyst/developer/dba)

#### Sidebar (`layout/Sidebar.jsx`)
- Connection browser with status badges
- Chat history for selected connection
- Schema tree navigation

#### StatusBar (`layout/StatusBar.jsx`)
- Backend health indicator
- LLM inference status
- Active query indicator
- Row count display

### 5. UI Panels

#### ChatPanel (`panels/ChatPanel.jsx`)
- Message thread display
- Input box for natural language questions
- SQL block with "Copy", "Edit in Query Panel", "Execute"
- "Approve & Learn" button (shown for AI-generated SQL)

**"Approve & Learn" Logic:**
```jsx
{msg.originated_from_ai && msg.sql_generated && (
  <button onClick={() => approvePair(msg.sql_generated)}>
    ✓ Approve & Learn from this query
  </button>
)}
```

**"Push to Edit" Fallback [TR-10]:**
- If no query panel tab active → creates one
- If panel hidden → reveals it
- Pastes SQL into Monaco editor

#### QueryPanel (`panels/QueryPanel.jsx`)
- Monaco Editor for SQL editing
- **Keyboard shortcut [TR-9]:** `Ctrl/⌘+Enter` executes query
- Run Query button with loading state
- Destructive query confirmation dialog [TR-7]

```jsx
if (result.require_confirmation && result.operations.length > 0) {
  // Show warning
  return (
    <DestructiveWarning
      operations={result.operations}
      onConfirm={() => executeQuery(sql, true)}
    />
  );
}
```

#### HistoryPanel (`panels/HistoryPanel.jsx`)
- Session list with timestamps
- Search across messages using SQLite FTS5 [TR-11]
- Delete session

#### RagPanel (`panels/RagPanel.jsx`)
- Upload documents (PDF, Word, Markdown)
- View indexed knowledge graph
- Manual schema re-indexing trigger
- View learned pairs

#### SettingsPanel (`panels/SettingsPanel.jsx`)
- Connection profiles CRUD
- Model download progress [TR-8]
- Cache clearing

### 6. UI Components

#### Button (`ui/Button.jsx`)
- Variants: primary, secondary, danger
- Loading state indicator

#### Modal (`ui/Modal.jsx`)
- Generic modal wrapper
- Header, body, footer
- Auto-focus on dangerous actions

#### Spinner (`ui/Spinner.jsx`)
- Loading indicator with optional text

#### ProgressBar (`ui/ProgressBar.jsx`)
- Shows indexing progress percentage
- Animated fill

---

## Database Schema (SQLite)

### Tables

**connection_profiles**
```sql
id (PK)
name
db_type (postgresql | mysql | mssql)
host, port, database, username
credential_key (keyring reference, NOT password)
read_only (boolean)
row_limit (default 1000)
query_timeout_seconds (default 30)
persona_mode (analyst | developer | dba)
created_at, updated_at
```

**chat_sessions**
```sql
id (PK)
connection_profile_id (FK)
title
created_at, last_active_at
```

**chat_messages**
```sql
id (PK)
session_id (FK)
role (user | assistant)
content (message text)
sql_generated (nullable, SQL from AI)
originated_from_ai (boolean, used for "Approve & Learn" [TR-14])
created_at
```

**learned_pairs**
```sql
id (PK)
connection_profile_id (FK)
chroma_id (cross-reference to ChromaDB)
question, sql
approved_at
```

**schema_snapshots**
```sql
id (PK)
connection_profile_id (FK)
schema_json (full schema dump)
indexed_at, expires_at
```

**FTS5 Virtual Table (SQLite) [TR-11]**
```sql
chat_messages_fts(content, session_id, role)
-- Created in first Alembic migration
-- Used for full-text search across chat history
```

---

## Tech Stack & Dependencies

### Backend
```
fastapi>=0.110          # Web framework
uvicorn[standard]       # ASGI server
sqlalchemy>=2.0         # ORM
alembic>=1.13           # Database migrations
psycopg2-binary>=2.9    # PostgreSQL driver
pymysql>=1.1            # MySQL driver
pyodbc>=5.0             # MSSQL driver
keyring>=25.0           # OS credential storage
langchain>=0.3          # LLM orchestration
langchain-community     # Integrations
chromadb>=0.5           # Vector database
llama-cpp-python>=0.2   # Local LLM inference
sqlglot>=23.0           # SQL AST parsing [TR-7]
pypdf>=4.0              # PDF parsing [TR-5]
python-docx>=1.0        # Word doc parsing [TR-5]
markdown-it-py>=3.0     # Markdown parsing [TR-5]
psutil>=5.9             # System info for model selection
requests>=2.31          # HTTP client
pydantic>=2.0           # Data validation
```

### Frontend
```
react@18.2              # UI framework
react-dom@18.2          # React DOM renderer
@monaco-editor/react    # SQL editor
ag-grid-react@31.3      # Results table
ag-grid-community       # Grid core
```

### Development
```
electron@29.1           # Desktop shell
webpack@5.89            # Bundler
babel@7.23              # JS transpiler
concurrently@8.2        # Run multiple tasks
```

---

## Key Design Patterns & Principles

### 1. Strict Isolation: LLM ↔ Database

```python
# ✅ GOOD: RAG retrieval (context only)
retrieved_docs = rag_manager.similarity_search(question, connection_id)
context = "\n".join([doc.page_content for doc in retrieved_docs])

# ✅ GOOD: Schema comes from database snapshot in RAG
schema_context = context_docs[0].page_content  # Extracted offline

# ❌ BAD: Would pass live connection to LLM
# Never do: inference.generate(prompt, db_connection=engine)

# ❌ BAD: Would pass raw query results to LLM
# Never do: results = engine.execute(query); inference.generate(..., results=results)
```

### 2. AST-Based Safety (Not String Matching)

```python
# ✅ GOOD: sqlglot AST parsing
destructive = is_destructive("SELECT 'DELETE FROM' AS msg;")  # False (safe)
# String-based would incorrectly flag as destructive!

# ❌ BAD: String matching
if "DELETE" in sql.upper():  # Would flag the SELECT above as destructive!
    raise Exception("Destructive query")
```

### 3. Two-Layer Read-Only Enforcement

```python
# Layer 1: UX warning
is_destructive, ops = is_destructive(sql)
if is_destructive:
    show_confirmation_dialog(ops)

# Layer 2: DB enforcement
if connection.read_only:
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION READ ONLY;")
            # DB will reject any modifications at this layer
            result = conn.execute(text(sql))
```

### 4. Single Generation + One Retry (No Self-Consistency)

```python
# Attempt 1
sql = await inference.generate(prompt)
is_valid = validator.validate(sql)

# Attempt 2 (if needed)
if not is_valid:
    retry_prompt = _build_retry_prompt(sql, is_valid.errors)
    sql = await inference.generate(retry_prompt)
else:
    return sql

# Never: try 3, 4, 5, 10 times for self-consistency
```

### 5. Repository Pattern for DB Access

```python
# ✅ GOOD: All DB access through repos
profile = connection_repo.get_by_id(id)

# ❌ BAD: Raw queries
# Never do: profile = session.query(ConnectionProfile).filter(...).first()
```

### 6. Port Communication Mechanism

```python
# Backend prints JSON to stdout on startup
print(json.dumps({"status": "ready", "port": 64430}))

# Electron main.js parses this
pythonProcess.stdout.on('data', (data) => {
    const msg = JSON.parse(data);
    if (msg.status === 'ready') backendPort = msg.port;
});

# Renderer gets port via preload bridge
window._backendPort  // Set after backend ready
```

### 7. Cancellation Support

```python
# Backend: set flag during generation
class LocalLlamaInference:
    def cancel(self):
        self._cancel_event.set()

# Frontend: call API on user request
POST /chat/cancel
```

---

## Critical Constraints (Non-Negotiable)

| # | Constraint | Why |
|---|-----------|-----|
| 1 | LLM has ZERO DB access | Privacy & security |
| 2 | Only user can trigger `Run Query` | Prevents unwanted execution |
| 3 | Passwords never in plaintext | OS-level encryption |
| 4 | Safety checks are AST-based | Handles literals, CTEs, etc. |
| 5 | Read-only enforced at DB layer | Defense in depth |
| 6 | One ChromaDB collection per connection | Prevents cross-contamination |
| 7 | Port parsed from backend stdout | Avoids hardcoded port conflicts |
| 8 | All inference is local | Privacy-first |

---

## Error Handling

### Backend Error Responses

**400 Bad Request — Query Safety**
```json
{
  "status_code": 400,
  "detail": {
    "error": "read_only_violation",
    "message": "Destructive query blocked",
    "operations": ["DELETE", "UPDATE"]
  }
}
```

**400 Bad Request — Destructive Query Confirmation**
```json
{
  "status_code": 200,
  "rows": [],
  "columns": [],
  "require_confirmation": true,
  "operations": ["UPDATE"]
}
```

**500 Internal Server Error — Generation Timeout**
```json
{
  "status_code": 500,
  "detail": "LLM generation timed out after 30s"
}
```

### Frontend Error Display

- **Notification toasts** for transient errors
- **Modal dialogs** for critical errors (connection lost, etc.)
- **Inline error messages** in form fields (connection creation)

---

## Performance Considerations

### Query Execution
- **Row limit** (default 1000): Prevents memory overload on large result sets
- **Query timeout** (default 30s): Prevents hanging on expensive queries
- **Index-aware queries**: Monaco provides schema-aware autocomplete

### LLM Inference
- **Model selection by RAM:** 1.5B if ≥8GB, else 0.5B
- **Token streaming:** Tokens yielded as generated (not waiting for full completion)
- **Cancellation support:** User can stop generation mid-token

### Database Connections
- **Engine pooling:** SQLAlchemy reuses connections
- **WAL mode:** SQLite allows concurrent reads while writes are in progress
- **FTS5 indexing:** Full-text search on chat history is indexed

### RAG Performance
- **Similarity search:** ChromaDB uses approximate nearest neighbor (ANN)
- **Lazy collection creation:** Collections only created when needed
- **Per-connection isolation:** No cross-connection search overhead

---

## Security Checklist

- [x] Credentials stored in OS keychain (not plaintext)
- [x] CORS configured for local Electron only
- [x] Context isolation enabled in Electron preload
- [x] No Node integration in renderer
- [x] SQL validated with sqlglot AST parser
- [x] Destructive operations require confirmation
- [x] Read-only transactions enforced at DB layer
- [x] LLM never receives DB connection
- [x] Port communication avoids hardcoding
- [x] Generated SQL is user-reviewed before execution

---

## Remaining Considerations

### Not Implemented Yet (Phase 2+)
- Model versioning & SHA-256 hash verification [TR-8]
- Streaming token responses
- WebSocket support for real-time updates
- Multi-user/team features
- Cloud backup of learned pairs

### Known Limitations
- Single backend process per Electron app instance
- No database connection pooling across sessions
- Limited to quantized models (~1.5B parameters)
- No LLM fine-tuning on user data (privacy-first tradeoff)

---

## Summary

DBGuree is a **privacy-first, local-first SQL assistant** with:

✅ **Strong isolation** between LLM and database  
✅ **Intelligent RAG** that learns from user interactions  
✅ **Robust safety checks** using AST-based analysis  
✅ **Beautiful UI** with Monaco editor & AG Grid  
✅ **Encrypted credentials** in OS keychains  
✅ **Fast inference** with quantized local models  

The architecture prioritizes **user control, privacy, and safety** over performance or feature count.

---

**End of Code Review**
