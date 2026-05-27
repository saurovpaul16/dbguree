"""
Connection Manager — handles DB connections, schema indexing, and query execution.

In-memory stores (reset on every backend restart):
  connection_status_store  — live ConnectionStatus per profile
  indexing_status_store    — async indexing progress per profile
"""

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError

from backend.core.interfaces import VectorStoreProvider
from backend.core.rag_manager import RAGManager
from backend.db.credentials import retrieve_credential
from backend.db.models import ConnectionProfile, ConnectionStatus, SchemaSnapshot
from backend.db.repositories.rag_repository import RAGRepository
from backend.db.repositories.schema_repository import SchemaRepository
from backend.utils.schema_extractor import SchemaExtractor

# ── In-memory state (process lifetime only) ───────────────────────────────────

connection_status_store: dict[str, ConnectionStatus] = {}
indexing_status_store: dict[str, dict] = {}


class IndexingStatus(str, Enum):
    IDLE = "idle"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass
class QueryResult:
    rows: list[list[Any]]
    columns: list[str]
    row_count: int
    execution_time_ms: int
    truncated: bool
    db_messages: list[str] = field(default_factory=list)


_DB_URL_TEMPLATES: dict[str, str] = {
    "postgresql": "postgresql+psycopg2://{username}:{password}@{host}:{port}/{database}",
    "mysql": "mysql+pymysql://{username}:{password}@{host}:{port}/{database}",
    "mssql": "mssql+pyodbc://{username}:{password}@{host}:{port}/{database}?driver=ODBC+Driver+17+for+SQL+Server",
}


class ConnectionManager:
    def __init__(
        self,
        rag_manager: RAGManager,
        schema_repo: SchemaRepository,
        rag_repo: RAGRepository,
    ) -> None:
        self._rag_manager = rag_manager
        self._schema_repo = schema_repo
        self._rag_repo = rag_repo
        self._extractor = SchemaExtractor()

    # ── Engine construction ───────────────────────────────────────────────────

    def get_engine(self, profile: ConnectionProfile) -> Engine:
        password = retrieve_credential(profile.credential_key) or ""
        url_template = _DB_URL_TEMPLATES.get(profile.db_type)
        if not url_template:
            raise ValueError(f"Unsupported db_type: {profile.db_type!r}")

        url = url_template.format(
            username=profile.username,
            password=password,
            host=profile.host,
            port=profile.port,
            database=profile.database,
        )
        return create_engine(url, pool_pre_ping=True)

    # ── Connection lifecycle ──────────────────────────────────────────────────

    def test_connection(
        self, profile: ConnectionProfile
    ) -> tuple[bool, int, Optional[str], Optional[str]]:
        """
        Returns (success, latency_ms, db_version, error_message).
        Does NOT store anything — purely a probe.
        """
        engine = self.get_engine(profile)
        start = time.monotonic()
        try:
            with engine.connect() as conn:
                version_row = conn.execute(
                    text(self._version_query(profile.db_type))
                ).fetchone()
                latency_ms = int((time.monotonic() - start) * 1000)
                db_version = str(version_row[0]) if version_row else "unknown"
                return True, latency_ms, db_version, None
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            return False, latency_ms, None, str(exc)
        finally:
            engine.dispose()

    def connect(self, profile: ConnectionProfile) -> ConnectionStatus:
        connection_status_store[profile.id] = ConnectionStatus(
            connection_profile_id=profile.id, status="connecting"
        )
        success, latency_ms, db_version, error = self.test_connection(profile)
        status = ConnectionStatus(
            connection_profile_id=profile.id,
            status="connected" if success else "error",
            latency_ms=latency_ms,
            db_version=db_version,
            last_error=error,
        )
        connection_status_store[profile.id] = status
        return status

    def disconnect(self, profile_id: str) -> None:
        connection_status_store[profile_id] = ConnectionStatus(
            connection_profile_id=profile_id, status="disconnected"
        )

    def get_status(self, profile_id: str) -> ConnectionStatus:
        return connection_status_store.get(
            profile_id,
            ConnectionStatus(
                connection_profile_id=profile_id, status="disconnected"
            ),
        )

    # ── Async schema indexing [TR-4] ──────────────────────────────────────────

    def start_async_indexing(
        self, profile_id: str, profile: ConnectionProfile
    ) -> None:
        """Fire-and-forget background indexing. UI polls /indexing-status."""
        # Run in thread to avoid event loop errors in sync context
        threading = __import__('threading')
        thread = threading.Thread(target=self._index_sync, args=(profile_id, profile), daemon=True)
        thread.start()

    def _index_sync(
        self, profile_id: str, profile: ConnectionProfile
    ) -> None:
        """Synchronous schema indexing that runs in a background thread."""
        indexing_status_store[profile_id] = {
            "status": IndexingStatus.IN_PROGRESS,
            "progress_pct": 0,
            "message": "Extracting schema...",
        }
        try:
            engine = self.get_engine(profile)
            schema = self._extractor.extract(engine)
            schema_hash = self._extractor.compute_hash(schema)
            engine.dispose()

            indexing_status_store[profile_id].update(
                {"progress_pct": 30, "message": "Indexing schema into knowledge graph..."}
            )

            self._rag_manager.index_schema(schema, profile_id)

            indexing_status_store[profile_id].update(
                {"progress_pct": 70, "message": "Saving schema snapshot..."}
            )

            snapshot = SchemaSnapshot(
                connection_profile_id=profile_id,
                schema_hash=schema_hash,
                schema_json=json.dumps(schema),
            )
            self._schema_repo.create(snapshot)

            # Flag stale learned pairs if schema changed
            self._rag_repo.flag_stale_pairs(profile_id, schema_hash)

            indexing_status_store[profile_id] = {
                "status": IndexingStatus.COMPLETE,
                "progress_pct": 100,
                "message": "Knowledge graph ready",
            }
        except Exception as exc:
            indexing_status_store[profile_id] = {
                "status": IndexingStatus.ERROR,
                "progress_pct": 0,
                "message": str(exc),
            }

    def get_indexing_status(self, profile_id: str) -> dict:
        return indexing_status_store.get(
            profile_id,
            {"status": IndexingStatus.IDLE, "progress_pct": 0, "message": ""},
        )

    # ── Query execution ───────────────────────────────────────────────────────

    def execute_query(
        self,
        engine: Engine,
        sql: str,
        is_read_only: bool,
        row_limit: int,
        timeout_seconds: int,
    ) -> QueryResult:
        """
        Two-layer read-only enforcement [TR-16]:
        - Layer 1: AST check (done in API route before calling this)
        - Layer 2: Read-only SQLAlchemy transaction (here)
        """
        start = time.monotonic()
        db_messages: list[str] = []

        with engine.connect() as conn:
            if is_read_only:
                # Layer 2: enforce at DB transaction level
                if engine.dialect.name == "postgresql":
                    conn.execute(text("SET TRANSACTION READ ONLY"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text("SET SESSION TRANSACTION READ ONLY"))
                # MSSQL: use restricted DB user — SET TRANSACTION READ ONLY not supported

            try:
                result = conn.execute(text(sql))
                # Fetch row_limit + 1 to detect truncation
                rows_raw = result.fetchmany(row_limit + 1)
                truncated = len(rows_raw) > row_limit
                rows = [list(r) for r in rows_raw[:row_limit]]
                columns = list(result.keys())
            except Exception as exc:
                raise

        execution_time_ms = int((time.monotonic() - start) * 1000)
        return QueryResult(
            rows=rows,
            columns=columns,
            row_count=len(rows),
            execution_time_ms=execution_time_ms,
            truncated=truncated,
            db_messages=db_messages,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _version_query(db_type: str) -> str:
        return {
            "postgresql": "SELECT version()",
            "mysql": "SELECT version()",
            "mssql": "SELECT @@VERSION",
        }.get(db_type, "SELECT 1")
