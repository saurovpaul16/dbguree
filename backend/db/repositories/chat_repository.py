from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.db.models import ChatMessage, ChatSession
from backend.db.repositories.base import BaseRepository


class ChatRepository(BaseRepository[ChatSession]):

    def __init__(self, db: Session) -> None:
        super().__init__(db)

    # ── Sessions ──────────────────────────────────────────────────────────────

    def get_sessions(
        self, connection_profile_id: Optional[str] = None
    ) -> list[ChatSession]:
        q = self.db.query(ChatSession)
        if connection_profile_id:
            q = q.filter(ChatSession.connection_profile_id == connection_profile_id)
        return q.order_by(ChatSession.last_active_at.desc()).all()

    def get_by_id(self, id: str) -> Optional[ChatSession]:
        return self.db.query(ChatSession).filter(ChatSession.id == id).first()

    def create(self, session: ChatSession) -> ChatSession:
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def update_last_active(self, session_id: str) -> None:
        import datetime

        self.db.query(ChatSession).filter(ChatSession.id == session_id).update(
            {"last_active_at": datetime.datetime.utcnow()}
        )
        self.db.commit()

    def delete(self, id: str) -> bool:
        session = self.get_by_id(id)
        if not session:
            return False
        self.db.query(ChatMessage).filter(ChatMessage.session_id == id).delete()
        self.db.delete(session)
        self.db.commit()
        return True

    def search_sessions_fts(self, query: str) -> list[ChatSession]:
        """FTS5 keyword search across all session messages. Never uses LIKE. [TR-11]"""
        rows = self.db.execute(
            text("""
                SELECT DISTINCT cm.session_id
                FROM chat_messages_fts fts
                JOIN chat_messages cm ON cm.rowid = fts.rowid
                WHERE chat_messages_fts MATCH :query
            """),
            {"query": query},
        ).fetchall()
        session_ids = [r[0] for r in rows]
        if not session_ids:
            return []
        return (
            self.db.query(ChatSession)
            .filter(ChatSession.id.in_(session_ids))
            .all()
        )

    # ── Messages ──────────────────────────────────────────────────────────────

    def get_messages(self, session_id: str) -> list[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
            .all()
        )

    def get_message_by_id(self, id: str) -> Optional[ChatMessage]:
        return self.db.query(ChatMessage).filter(ChatMessage.id == id).first()

    def add_message(self, message: ChatMessage) -> ChatMessage:
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message
