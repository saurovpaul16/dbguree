import datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend.db.models import LearnedPair, UploadedDocument
from backend.db.repositories.base import BaseRepository


class RAGRepository(BaseRepository[LearnedPair]):

    def __init__(self, db: Session) -> None:
        super().__init__(db)

    # ── Learned pairs ─────────────────────────────────────────────────────────

    def get_by_id(self, id: str) -> Optional[LearnedPair]:
        return self.db.query(LearnedPair).filter(LearnedPair.id == id).first()

    def get_pairs(self, connection_profile_id: str) -> list[LearnedPair]:
        return (
            self.db.query(LearnedPair)
            .filter(LearnedPair.connection_profile_id == connection_profile_id)
            .order_by(LearnedPair.created_at.desc())
            .all()
        )

    def create(self, pair: LearnedPair) -> LearnedPair:
        self.db.add(pair)
        self.db.commit()
        self.db.refresh(pair)
        return pair

    def update(self, pair: LearnedPair) -> LearnedPair:
        self.db.merge(pair)
        self.db.commit()
        self.db.refresh(pair)
        return pair

    def delete(self, id: str) -> bool:
        pair = self.get_by_id(id)
        if not pair:
            return False
        self.db.delete(pair)
        self.db.commit()
        return True

    def get_flagged_pairs(self, connection_profile_id: str) -> list[LearnedPair]:
        return (
            self.db.query(LearnedPair)
            .filter(
                LearnedPair.connection_profile_id == connection_profile_id,
                LearnedPair.is_flagged == True,
            )
            .all()
        )

    def flag_stale_pairs(
        self, connection_profile_id: str, current_schema_hash: str
    ) -> list[str]:
        """
        Mark learned pairs whose schema_hash differs from the current schema.
        Returns list of flagged pair IDs.
        """
        stale = (
            self.db.query(LearnedPair)
            .filter(
                LearnedPair.connection_profile_id == connection_profile_id,
                LearnedPair.schema_hash != current_schema_hash,
                LearnedPair.is_flagged == False,
            )
            .all()
        )
        for pair in stale:
            pair.is_flagged = True
            pair.updated_at = datetime.datetime.utcnow()
        self.db.commit()
        return [p.id for p in stale]

    # ── Documents ─────────────────────────────────────────────────────────────

    def get_documents(self, connection_profile_id: str) -> list[UploadedDocument]:
        return (
            self.db.query(UploadedDocument)
            .filter(UploadedDocument.connection_profile_id == connection_profile_id)
            .order_by(UploadedDocument.uploaded_at.desc())
            .all()
        )

    def get_document_by_id(self, id: str) -> Optional[UploadedDocument]:
        return (
            self.db.query(UploadedDocument)
            .filter(UploadedDocument.id == id)
            .first()
        )

    def create_document(self, doc: UploadedDocument) -> UploadedDocument:
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def update_document(self, doc: UploadedDocument) -> UploadedDocument:
        self.db.merge(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete_document(self, id: str) -> bool:
        doc = self.get_document_by_id(id)
        if not doc:
            return False
        self.db.delete(doc)
        self.db.commit()
        return True
