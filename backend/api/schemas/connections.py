from typing import Optional

from pydantic import BaseModel, ConfigDict


class ConnectionProfileCreate(BaseModel):
    name: str
    db_type: str  # "postgresql" | "mysql" | "mssql"
    host: str
    port: int
    database: str
    username: str
    password: str  # Plaintext input — stored to keychain, never persisted
    read_only: bool = False
    row_limit: int = 1000
    query_timeout_seconds: int = 30
    persona_mode: str = "analyst"


class ConnectionProfileUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None  # Optional — omit to keep existing
    read_only: Optional[bool] = None
    row_limit: Optional[int] = None
    query_timeout_seconds: Optional[int] = None
    persona_mode: Optional[str] = None


class ConnectionProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    read_only: bool
    row_limit: int
    query_timeout_seconds: int
    persona_mode: str
    # credential_key intentionally excluded from response


class TestConnectionResponse(BaseModel):
    success: bool
    latency_ms: int
    db_version: Optional[str] = None
    error: Optional[str] = None


class IndexingStatusResponse(BaseModel):
    status: str  # "idle" | "in_progress" | "complete" | "error"
    progress_pct: int
    message: str


class ConnectionStatusResponse(BaseModel):
    connection_profile_id: str
    status: str
    latency_ms: Optional[int] = None
    last_error: Optional[str] = None
    db_version: Optional[str] = None
