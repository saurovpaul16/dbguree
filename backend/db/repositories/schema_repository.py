from typing import Optional

from sqlalchemy.orm import Session

from backend.db.models import SchemaSnapshot
from backend.db.repositories.base import BaseRepository


class SchemaRepository(BaseRepository[SchemaSnapshot]):

    def __init__(self, db: Session) -> None:
        super().__init__(db)

    def get_by_id(self, id: str) -> Optional[SchemaSnapshot]:
        return (
            self.db.query(SchemaSnapshot).filter(SchemaSnapshot.id == id).first()
        )

    def get_latest_snapshot(
        self, connection_profile_id: str
    ) -> Optional[SchemaSnapshot]:
        return (
            self.db.query(SchemaSnapshot)
            .filter(SchemaSnapshot.connection_profile_id == connection_profile_id)
            .order_by(SchemaSnapshot.captured_at.desc())
            .first()
        )

    def create(self, snapshot: SchemaSnapshot) -> SchemaSnapshot:
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def delete(self, id: str) -> bool:
        snapshot = self.get_by_id(id)
        if not snapshot:
            return False
        self.db.delete(snapshot)
        self.db.commit()
        return True
