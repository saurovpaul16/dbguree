from pathlib import Path
from typing import Generator, Optional

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def init_engine(db_path: str) -> Engine:
    """Create SQLAlchemy engine with WAL mode enabled on every connection."""
    global _engine, _SessionLocal

    resolved = str(Path(db_path).expanduser())
    Path(resolved).parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        f"sqlite:///{resolved}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_wal(dbapi_conn, _conn_record):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    _engine = engine
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("Engine not initialised — call init_engine() first")
    return _engine


def get_db() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        raise RuntimeError("Session factory not initialised — call init_engine() first")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def alembic_upgrade_to_head(engine: Engine) -> None:
    """Run all pending Alembic migrations programmatically."""
    import os

    cfg = AlembicConfig()
    # Alembic script location relative to this file
    migrations_dir = Path(__file__).parent.parent / "alembic"
    cfg.set_main_option("script_location", str(migrations_dir))
    cfg.set_main_option("sqlalchemy.url", str(engine.url))

    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")


def init_fts5(engine: Engine) -> None:
    """Create FTS5 virtual table and sync triggers if they don't exist yet."""
    with engine.connect() as conn:
        conn.execute(
            text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts
            USING fts5(
                content,
                sql_generated,
                session_id UNINDEXED,
                content='chat_messages',
                content_rowid='rowid'
            )
        """)
        )
        conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS chat_messages_fts_insert
            AFTER INSERT ON chat_messages BEGIN
                INSERT INTO chat_messages_fts(rowid, content, sql_generated, session_id)
                VALUES (new.rowid, new.content, new.sql_generated, new.session_id);
            END
        """)
        )
        conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS chat_messages_fts_delete
            AFTER DELETE ON chat_messages BEGIN
                INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, sql_generated, session_id)
                VALUES ('delete', old.rowid, old.content, old.sql_generated, old.session_id);
            END
        """)
        )
        conn.execute(
            text("""
            CREATE TRIGGER IF NOT EXISTS chat_messages_fts_update
            AFTER UPDATE ON chat_messages BEGIN
                INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, sql_generated, session_id)
                VALUES ('delete', old.rowid, old.content, old.sql_generated, old.session_id);
                INSERT INTO chat_messages_fts(rowid, content, sql_generated, session_id)
                VALUES (new.rowid, new.content, new.sql_generated, new.session_id);
            END
        """)
        )
        conn.commit()
