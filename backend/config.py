import os
import sys
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings


def _default_data_dir() -> Path:
    """Return the platform-standard app data directory for DBGuree."""
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "DBGuree"


_DATA_DIR = _default_data_dir()


class AppSettings(BaseSettings):
    SQLITE_DB_PATH: str = str(_DATA_DIR / "dbguree.db")
    CHROMA_PERSIST_DIR: str = str(_DATA_DIR / "chroma")
    MODELS_DIR: str = str(_DATA_DIR / "models")
    LOG_LEVEL: str = "warning"
    MAX_ROW_LIMIT: int = 10000

    class Config:
        env_prefix = "DBGUREE_"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    settings = AppSettings()
    Path(settings.SQLITE_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.MODELS_DIR).mkdir(parents=True, exist_ok=True)
    return settings
