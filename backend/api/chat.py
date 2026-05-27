import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from backend.api.deps import (
    get_chat_repo,
    get_connection_repo,
    get_inference_backend,
    get_rag_manager,
    get_schema_repo,
)
from backend.api.schemas.chat import (
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    NLQueryRequest,
    NLQueryResponse,
)
from backend.connections.manager import connection_status_store
from backend.core.interfaces import GenerationCancelledError, InferenceBackend
from backend.core.nl_to_sql import NLToSQLService
from backend.core.rag_manager import RAGManager
from backend.core.sql_validator import SQLValidator
from backend.db.models import ChatMessage, ChatSession
from backend.db.repositories.chat_repository import ChatRepository
from backend.db.repositories.connection_repository import ConnectionRepository
from backend.db.repositories.schema_repository import SchemaRepository

router = APIRouter(tags=["chat"])


@router.get("/sessions", response_model=list[ChatSessionResponse])
def list_sessions(
    connection_id: Optional[str] = None,
    repo: ChatRepository = Depends(get_chat_repo),
):
    return repo.get_sessions(connection_id)


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    body: ChatSessionCreate,
    repo: ChatRepository = Depends(get_chat_repo),
):
    session = ChatSession(
        id=str(uuid.uuid4()),
        connection_profile_id=body.connection_profile_id,
        title=body.title,
    )
    return repo.create(session)


@router.get("/sessions/{id}/messages", response_model=list[ChatMessageResponse])
def get_messages(id: str, repo: ChatRepository = Depends(get_chat_repo)):
    session = repo.get_by_id(id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return repo.get_messages(id)


@router.post("/sessions/{id}/messages", response_model=NLQueryResponse)
async def send_message(
    id: str,
    body: NLQueryRequest,
    chat_repo: ChatRepository = Depends(get_chat_repo),
    conn_repo: ConnectionRepository = Depends(get_connection_repo),
    rag_manager: RAGManager = Depends(get_rag_manager),
    inference: InferenceBackend = Depends(get_inference_backend),
):
    session = chat_repo.get_by_id(id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    profile = conn_repo.get_by_id(body.connection_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Persist the user message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=id,
        role="user",
        content=body.question,
    )
    chat_repo.add_message(user_msg)

    # Build service with correct db_type validator
    service = NLToSQLService(
        inference=inference,
        rag_manager=rag_manager,
        validator=SQLValidator(profile.db_type),
    )

    try:
        result = await service.generate(
            nl_question=body.question,
            connection_id=body.connection_id,
            db_type=profile.db_type,
            persona=profile.persona_mode,
        )
    except GenerationCancelledError:
        ai_msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=id,
            role="assistant",
            content="Generation stopped.",
            originated_from_ai=True,
        )
        chat_repo.add_message(ai_msg)
        raise HTTPException(status_code=499, detail="Generation cancelled")

    # Persist the AI response
    ai_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=id,
        role="assistant",
        content=result.explanation,
        sql_generated=result.sql,
        originated_from_ai=True,
    )
    chat_repo.add_message(ai_msg)
    chat_repo.update_last_active(id)

    return NLQueryResponse(
        sql=result.sql,
        explanation=result.explanation,
        message_id=ai_msg.id,
        originated_from_ai=True,
        was_retried=result.was_retried,
    )


@router.delete("/sessions/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(id: str, repo: ChatRepository = Depends(get_chat_repo)):
    if not repo.delete(id):
        raise HTTPException(status_code=404, detail="Session not found")


@router.get("/sessions/search", response_model=list[ChatSessionResponse])
def search_sessions(q: str, repo: ChatRepository = Depends(get_chat_repo)):
    """FTS5 keyword search across session messages. [TR-11]"""
    if not q or not q.strip():
        return []
    return repo.search_sessions_fts(q.strip())


@router.post("/chat/cancel")
def cancel_generation(inference: InferenceBackend = Depends(get_inference_backend)):
    """Cancel in-progress LLM generation. [TR-12]"""
    inference.cancel()
    return {"status": "cancelled"}
