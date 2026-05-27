import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from backend.api.deps import (
    get_connection_manager,
    get_connection_repo,
    get_rag_manager,
)
from backend.api.schemas.connections import (
    ConnectionProfileCreate,
    ConnectionProfileResponse,
    ConnectionProfileUpdate,
    ConnectionStatusResponse,
    IndexingStatusResponse,
    TestConnectionResponse,
)
from backend.connections.manager import ConnectionManager, connection_status_store
from backend.db.credentials import delete_credential, store_credential
from backend.db.models import ConnectionProfile
from backend.db.repositories.connection_repository import ConnectionRepository
from backend.core.rag_manager import RAGManager

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=list[ConnectionProfileResponse])
def list_connections(repo: ConnectionRepository = Depends(get_connection_repo)):
    return repo.get_all()


@router.post("", response_model=ConnectionProfileResponse, status_code=status.HTTP_201_CREATED)
def create_connection(
    body: ConnectionProfileCreate,
    repo: ConnectionRepository = Depends(get_connection_repo),
):
    profile_id = str(uuid.uuid4())
    credential_key = store_credential(profile_id, body.password)

    profile = ConnectionProfile(
        id=profile_id,
        name=body.name,
        db_type=body.db_type,
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        credential_key=credential_key,
        read_only=body.read_only,
        row_limit=body.row_limit,
        query_timeout_seconds=body.query_timeout_seconds,
        persona_mode=body.persona_mode,
    )
    return repo.create(profile)


@router.get("/{id}", response_model=ConnectionProfileResponse)
def get_connection(id: str, repo: ConnectionRepository = Depends(get_connection_repo)):
    profile = repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")
    return profile


@router.put("/{id}", response_model=ConnectionProfileResponse)
def update_connection(
    id: str,
    body: ConnectionProfileUpdate,
    repo: ConnectionRepository = Depends(get_connection_repo),
):
    profile = repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    for field, value in body.model_dump(exclude_none=True).items():
        if field == "password":
            store_credential(id, value)  # Update keychain
        else:
            setattr(profile, field, value)

    return repo.update(profile)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    id: str,
    repo: ConnectionRepository = Depends(get_connection_repo),
    rag_manager: RAGManager = Depends(get_rag_manager),
):
    profile = repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Delete ChromaDB collection for this connection [TR-6]
    try:
        rag_manager.delete_collection(id)
    except Exception:
        pass  # Collection may not exist yet

    # Delete keychain credential
    delete_credential(profile.credential_key)

    repo.delete(id)


@router.post("/{id}/test", response_model=TestConnectionResponse)
def test_connection(
    id: str,
    repo: ConnectionRepository = Depends(get_connection_repo),
    manager: ConnectionManager = Depends(get_connection_manager),
):
    profile = repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    success, latency_ms, db_version, error = manager.test_connection(profile)
    return TestConnectionResponse(
        success=success, latency_ms=latency_ms, db_version=db_version, error=error
    )


@router.post("/{id}/connect")
def connect(
    id: str,
    repo: ConnectionRepository = Depends(get_connection_repo),
    manager: ConnectionManager = Depends(get_connection_manager),
):
    """Connect to DB, test it, and trigger async schema indexing. Returns immediately."""
    profile = repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    status_obj = manager.connect(profile)
    if status_obj.status == "connected":
        manager.start_async_indexing(id, profile)

    return {"status": status_obj.status, "message": "Indexing started in background"}


@router.get("/{id}/schema")
def get_schema(id: str, repo: ConnectionRepository = Depends(get_connection_repo)):
    from backend.api.deps import get_schema_repo
    from backend.db.session import get_db
    import json

    # Inline schema snapshot retrieval (avoiding circular deps)
    from backend.db.models import SchemaSnapshot
    from sqlalchemy.orm import Session
    from fastapi import Depends

    # We don't have schema_repo injected here — use the profile to find snapshot
    from backend.db.session import _SessionLocal
    if _SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not initialised")
    db = _SessionLocal()
    try:
        snapshot = (
            db.query(SchemaSnapshot)
            .filter(SchemaSnapshot.connection_profile_id == id)
            .order_by(SchemaSnapshot.captured_at.desc())
            .first()
        )
        if not snapshot:
            return {"tables": []}
        return json.loads(snapshot.schema_json)
    finally:
        db.close()


@router.post("/{id}/schema/refresh")
def refresh_schema(
    id: str,
    repo: ConnectionRepository = Depends(get_connection_repo),
    manager: ConnectionManager = Depends(get_connection_manager),
):
    profile = repo.get_by_id(id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    manager.start_async_indexing(id, profile)
    return {"message": "Schema refresh started"}


@router.get("/{id}/indexing-status", response_model=IndexingStatusResponse)
def get_indexing_status(
    id: str,
    manager: ConnectionManager = Depends(get_connection_manager),
):
    data = manager.get_indexing_status(id)
    return IndexingStatusResponse(
        status=data["status"],
        progress_pct=data["progress_pct"],
        message=data["message"],
    )


@router.get("/{id}/status", response_model=ConnectionStatusResponse)
def get_connection_status(id: str):
    from backend.connections.manager import connection_status_store
    from backend.db.models import ConnectionStatus

    status_obj = connection_status_store.get(
        id,
        ConnectionStatus(connection_profile_id=id, status="disconnected"),
    )
    return ConnectionStatusResponse(**status_obj.model_dump())
