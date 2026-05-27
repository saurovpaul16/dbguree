import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ChatSessionCreate(BaseModel):
    connection_profile_id: str
    title: str


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    connection_profile_id: str
    title: str
    created_at: datetime.datetime
    last_active_at: datetime.datetime


class NLQueryRequest(BaseModel):
    question: str
    connection_id: str


class NLQueryResponse(BaseModel):
    sql: str
    explanation: str
    message_id: str
    originated_from_ai: bool
    was_retried: bool


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    role: str
    content: str
    sql_generated: Optional[str] = None
    originated_from_ai: bool
    created_at: datetime.datetime
