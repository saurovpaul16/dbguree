"""Initial schema with FTS5 session search. [TR-11]

Revision ID: 0001
Revises:
Create Date: 2026-03-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Regular tables ────────────────────────────────────────────────────────
    op.create_table(
        "connection_profiles",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("db_type", sa.String, nullable=False),
        sa.Column("host", sa.String, nullable=False),
        sa.Column("port", sa.Integer, nullable=False),
        sa.Column("database", sa.String, nullable=False),
        sa.Column("username", sa.String, nullable=False),
        sa.Column("credential_key", sa.String, nullable=False),
        sa.Column("read_only", sa.Boolean, default=False),
        sa.Column("row_limit", sa.Integer, default=1000),
        sa.Column("query_timeout_seconds", sa.Integer, default=30),
        sa.Column("persona_mode", sa.String, default="analyst"),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("connection_profile_id", sa.String, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime),
        sa.Column("last_active_at", sa.DateTime),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("session_id", sa.String, nullable=False),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("sql_generated", sa.Text, nullable=True),
        sa.Column("originated_from_ai", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime),
    )

    op.create_table(
        "learned_pairs",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("connection_profile_id", sa.String, nullable=False),
        sa.Column("chroma_id", sa.String, nullable=False),
        sa.Column("nl_question", sa.Text, nullable=False),
        sa.Column("sql", sa.Text, nullable=False),
        sa.Column("schema_hash", sa.String, nullable=False),
        sa.Column("session_id", sa.String, nullable=False),
        sa.Column("is_flagged", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )

    op.create_table(
        "schema_snapshots",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("connection_profile_id", sa.String, nullable=False),
        sa.Column("schema_hash", sa.String, nullable=False),
        sa.Column("schema_json", sa.Text, nullable=False),
        sa.Column("captured_at", sa.DateTime),
    )

    op.create_table(
        "uploaded_documents",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("connection_profile_id", sa.String, nullable=False),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("file_type", sa.String, nullable=False),
        sa.Column("indexing_status", sa.String, default="pending"),
        sa.Column("chroma_ids", sa.Text, nullable=True),
        sa.Column("uploaded_at", sa.DateTime),
    )

    # ── FTS5 virtual table for session keyword search [TR-11] ─────────────────
    # Cannot be created via SQLAlchemy ORM — must use raw SQL.
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

    op.execute("""
        CREATE TRIGGER IF NOT EXISTS chat_messages_fts_insert
        AFTER INSERT ON chat_messages BEGIN
            INSERT INTO chat_messages_fts(rowid, content, sql_generated, session_id)
            VALUES (new.rowid, new.content, new.sql_generated, new.session_id);
        END
    """)

    op.execute("""
        CREATE TRIGGER IF NOT EXISTS chat_messages_fts_delete
        AFTER DELETE ON chat_messages BEGIN
            INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, sql_generated, session_id)
            VALUES ('delete', old.rowid, old.content, old.sql_generated, old.session_id);
        END
    """)

    op.execute("""
        CREATE TRIGGER IF NOT EXISTS chat_messages_fts_update
        AFTER UPDATE ON chat_messages BEGIN
            INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, sql_generated, session_id)
            VALUES ('delete', old.rowid, old.content, old.sql_generated, old.session_id);
            INSERT INTO chat_messages_fts(rowid, content, sql_generated, session_id)
            VALUES (new.rowid, new.content, new.sql_generated, new.session_id);
        END
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS chat_messages_fts_update")
    op.execute("DROP TRIGGER IF EXISTS chat_messages_fts_delete")
    op.execute("DROP TRIGGER IF EXISTS chat_messages_fts_insert")
    op.execute("DROP TABLE IF EXISTS chat_messages_fts")
    op.drop_table("uploaded_documents")
    op.drop_table("schema_snapshots")
    op.drop_table("learned_pairs")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("connection_profiles")
