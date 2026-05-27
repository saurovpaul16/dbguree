import json
import os
import shutil
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from backend.api.deps import get_connection_repo, get_rag_manager, get_rag_repo
from backend.api.schemas.rag import (
    DocumentResponse,
    LearnedPairCreate,
    LearnedPairResponse,
    LearnedPairUpdate,
)
from backend.core.document_parser import DocumentParser, UnsupportedFileTypeError
from backend.core.rag_manager import RAGManager
from backend.db.models import LearnedPair, UploadedDocument
from backend.db.repositories.connection_repository import ConnectionRepository
from backend.db.repositories.rag_repository import RAGRepository

router = APIRouter(prefix="/rag", tags=["rag"])
_parser = DocumentParser()


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/{connection_id}/documents", response_model=list[DocumentResponse])
def list_documents(
    connection_id: str,
    rag_repo: RAGRepository = Depends(get_rag_repo),
):
    return rag_repo.get_documents(connection_id)


@router.post("/{connection_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    connection_id: str,
    file: UploadFile = File(...),
    rag_repo: RAGRepository = Depends(get_rag_repo),
    rag_manager: RAGManager = Depends(get_rag_manager),
    conn_repo: ConnectionRepository = Depends(get_connection_repo),
):
    if not conn_repo.get_by_id(connection_id):
        raise HTTPException(status_code=404, detail="Connection not found")

    file_type = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "txt"

    # Write upload to a temp file for parsing
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_type}") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        text = _parser.parse(tmp_path, file_type)
    except UnsupportedFileTypeError as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    doc_record = UploadedDocument(
        id=str(uuid.uuid4()),
        connection_profile_id=connection_id,
        filename=file.filename,
        file_type=file_type,
        indexing_status="pending",
    )
    doc_record = rag_repo.create_document(doc_record)

    # Index into ChromaDB
    try:
        chroma_ids = rag_manager.index_document(text, file.filename, connection_id)
        doc_record.chroma_ids = json.dumps(chroma_ids)
        doc_record.indexing_status = "indexed"
        rag_repo.update_document(doc_record)
    except Exception as exc:
        doc_record.indexing_status = "error"
        rag_repo.update_document(doc_record)

    return doc_record


@router.delete("/{connection_id}/documents/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    connection_id: str,
    id: str,
    rag_repo: RAGRepository = Depends(get_rag_repo),
):
    if not rag_repo.delete_document(id):
        raise HTTPException(status_code=404, detail="Document not found")


# ── Learned pairs ─────────────────────────────────────────────────────────────

@router.get("/{connection_id}/pairs", response_model=list[LearnedPairResponse])
def list_pairs(
    connection_id: str,
    rag_repo: RAGRepository = Depends(get_rag_repo),
):
    return rag_repo.get_pairs(connection_id)


@router.post("/{connection_id}/pairs", response_model=LearnedPairResponse, status_code=status.HTTP_201_CREATED)
def create_pair(
    connection_id: str,
    body: LearnedPairCreate,
    rag_repo: RAGRepository = Depends(get_rag_repo),
    rag_manager: RAGManager = Depends(get_rag_manager),
):
    pair_id = str(uuid.uuid4())
    chroma_id = rag_manager.add_learned_pair(
        nl=body.nl_question,
        sql=body.sql,
        connection_id=connection_id,
        pair_id=pair_id,
    )
    pair = LearnedPair(
        id=pair_id,
        connection_profile_id=connection_id,
        chroma_id=chroma_id,
        nl_question=body.nl_question,
        sql=body.sql,
        schema_hash=body.schema_hash,
        session_id=body.session_id,
    )
    return rag_repo.create(pair)


@router.put("/{connection_id}/pairs/{id}", response_model=LearnedPairResponse)
def update_pair(
    connection_id: str,
    id: str,
    body: LearnedPairUpdate,
    rag_repo: RAGRepository = Depends(get_rag_repo),
):
    pair = rag_repo.get_by_id(id)
    if not pair or pair.connection_profile_id != connection_id:
        raise HTTPException(status_code=404, detail="Pair not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(pair, field, value)

    return rag_repo.update(pair)


@router.delete("/{connection_id}/pairs/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pair(
    connection_id: str,
    id: str,
    rag_repo: RAGRepository = Depends(get_rag_repo),
):
    pair = rag_repo.get_by_id(id)
    if not pair or pair.connection_profile_id != connection_id:
        raise HTTPException(status_code=404, detail="Pair not found")
    rag_repo.delete(id)


@router.get("/{connection_id}/pairs/flagged", response_model=list[LearnedPairResponse])
def get_flagged_pairs(
    connection_id: str,
    rag_repo: RAGRepository = Depends(get_rag_repo),
):
    return rag_repo.get_flagged_pairs(connection_id)
