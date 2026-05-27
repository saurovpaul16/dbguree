from typing import Any, Optional

from pydantic import BaseModel


class QueryExecuteRequest(BaseModel):
    connection_id: str
    sql: str
    session_id: str
    message_id: Optional[str] = None
    confirmed: bool = False  # Must be True for destructive queries to execute


class QueryExecuteResponse(BaseModel):
    rows: list[list[Any]]
    columns: list[str]
    row_count: int
    execution_time_ms: int
    truncated: bool
    db_messages: list[str]
    require_confirmation: bool = False
    operations: list[str] = []
