from abc import ABC, abstractmethod
from typing import Generic, Optional, TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")


class BaseRepository(ABC, Generic[T]):
    """
    Abstract base for all SQLAlchemy repositories.
    Enforces a consistent interface and keeps DB session injected, not imported.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    @abstractmethod
    def get_by_id(self, id: str) -> Optional[T]:
        ...

    @abstractmethod
    def create(self, obj: T) -> T:
        ...

    @abstractmethod
    def delete(self, id: str) -> bool:
        ...

    def save(self) -> None:
        self.db.commit()
