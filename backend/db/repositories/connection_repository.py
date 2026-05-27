from typing import Optional

from sqlalchemy.orm import Session

from backend.db.models import ConnectionProfile
from backend.db.repositories.base import BaseRepository


class ConnectionRepository(BaseRepository[ConnectionProfile]):

    def __init__(self, db: Session) -> None:
        super().__init__(db)

    def get_all(self) -> list[ConnectionProfile]:
        return self.db.query(ConnectionProfile).order_by(ConnectionProfile.created_at).all()

    def get_by_id(self, id: str) -> Optional[ConnectionProfile]:
        return self.db.query(ConnectionProfile).filter(ConnectionProfile.id == id).first()

    def create(self, profile: ConnectionProfile) -> ConnectionProfile:
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def update(self, profile: ConnectionProfile) -> ConnectionProfile:
        self.db.merge(profile)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def delete(self, id: str) -> bool:
        profile = self.get_by_id(id)
        if not profile:
            return False
        self.db.delete(profile)
        self.db.commit()
        return True
