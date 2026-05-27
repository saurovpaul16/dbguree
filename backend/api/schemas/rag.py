import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LearnedPairCreate(BaseModel):
    nl_question: str
    sql: str
    session_id: str
    schema_hash: str


class LearnedPairUpdate(BaseModel):
    nl_question: Optional[str] = None
    sql: Optional[str] = None
    is_flagged: Optional[bool] = None


class LearnedPairResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    connection_profile_id: str
    nl_question: str
    sql: str
    schema_hash: str
    session_id: str
    is_flagged: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    connection_profile_id: str
    filename: str
    file_type: str
    indexing_status: str
    uploaded_at: datetime.datetime
