"""
FastAPI dependency providers.
All business objects are injected via Depends() — never imported directly in routes.
"""

from functools import lru_cache
from typing import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from backend.config import AppSettings, get_settings
from backend.connections.manager import ConnectionManager
from backend.core.embeddings import NomicEmbeddingProvider
from backend.core.inference import InferenceBackendFactory, LocalLlamaInference
from backend.core.interfaces import InferenceBackend
from backend.core.nl_to_sql import NLToSQLService
from backend.core.rag_manager import RAGManager
from backend.core.sql_validator import SQLValidator
from backend.db.repositories.chat_repository import ChatRepository
from backend.db.repositories.connection_repository import ConnectionRepository
from backend.db.repositories.rag_repository import RAGRepository
from backend.db.repositories.schema_repository import SchemaRepository
from backend.db.session import get_db


# ── Expensive singletons (lazy, process-scoped) ───────────────────────────────

@lru_cache(maxsize=1)
def _get_embedding_provider(models_dir: str) -> NomicEmbeddingProvider:
    import os
    return NomicEmbeddingProvider(
        model_path=os.path.join(models_dir, "nomic-embed-text-v1.5.gguf")
    )


@lru_cache(maxsize=1)
def _get_rag_manager(chroma_dir: str, models_dir: str) -> RAGManager:
    provider = _get_embedding_provider(models_dir)
    return RAGManager(persist_directory=chroma_dir, embedding_provider=provider)


@lru_cache(maxsize=1)
def _get_inference_backend(models_dir: str) -> LocalLlamaInference:
    return InferenceBackendFactory.create_local(models_dir)


# ── FastAPI dependency functions ─────────────────────────────────────────────

def get_connection_repo(db: Session = Depends(get_db)) -> ConnectionRepository:
    return ConnectionRepository(db)


def get_chat_repo(db: Session = Depends(get_db)) -> ChatRepository:
    return ChatRepository(db)


def get_rag_repo(db: Session = Depends(get_db)) -> RAGRepository:
    return RAGRepository(db)


def get_schema_repo(db: Session = Depends(get_db)) -> SchemaRepository:
    return SchemaRepository(db)


def get_rag_manager(
    settings: AppSettings = Depends(get_settings),
) -> RAGManager:
    return _get_rag_manager(settings.CHROMA_PERSIST_DIR, settings.MODELS_DIR)


def get_inference_backend(
    settings: AppSettings = Depends(get_settings),
) -> InferenceBackend:
    return _get_inference_backend(settings.MODELS_DIR)


def get_connection_manager(
    rag_manager: RAGManager = Depends(get_rag_manager),
    schema_repo: SchemaRepository = Depends(get_schema_repo),
    rag_repo: RAGRepository = Depends(get_rag_repo),
) -> ConnectionManager:
    return ConnectionManager(
        rag_manager=rag_manager,
        schema_repo=schema_repo,
        rag_repo=rag_repo,
    )


def get_nl_to_sql_service(
    inference: InferenceBackend = Depends(get_inference_backend),
    rag_manager: RAGManager = Depends(get_rag_manager),
) -> NLToSQLService:
    # Validator is created per-request — it's cheap and db_type is request-scoped
    # The actual db_type is threaded in at call time inside the route
    return NLToSQLService(
        inference=inference,
        rag_manager=rag_manager,
        validator=SQLValidator("postgresql"),  # overridden per-call
    )
