from fastapi import APIRouter, Depends, HTTPException

from backend.api.deps import get_connection_manager, get_connection_repo
from backend.api.schemas.query import QueryExecuteRequest, QueryExecuteResponse
from backend.connections.manager import ConnectionManager
from backend.core.safety import is_destructive
from backend.db.repositories.connection_repository import ConnectionRepository

router = APIRouter(prefix="/query", tags=["query"])


@router.post("/execute", response_model=QueryExecuteResponse)
def execute_query(
    body: QueryExecuteRequest,
    conn_repo: ConnectionRepository = Depends(get_connection_repo),
    manager: ConnectionManager = Depends(get_connection_manager),
):
    """
    SQL execution flow:
    1. AST-based destructive check [TR-7]
    2. read_only + destructive → 400
    3. destructive + not confirmed → require_confirmation response
    4. Execute in read-only transaction if applicable [TR-16]
    """
    profile = conn_repo.get_by_id(body.connection_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Step 1: AST-based destructive check (Layer 1 of read-only enforcement [TR-16])
    destructive, operations = is_destructive(body.sql, profile.db_type)

    # Step 2: Hard block for read-only connections
    if profile.read_only and destructive:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "read_only_violation",
                "message": "Destructive query blocked — connection is in read-only mode.",
                "operations": operations,
            },
        )

    # Step 3: Require explicit confirmation for destructive queries
    if destructive and not body.confirmed:
        return QueryExecuteResponse(
            rows=[],
            columns=[],
            row_count=0,
            execution_time_ms=0,
            truncated=False,
            db_messages=[],
            require_confirmation=True,
            operations=operations,
        )

    # Step 4: Execute (Layer 2 enforced inside ConnectionManager.execute_query) [TR-16]
    try:
        engine = manager.get_engine(profile)
        result = manager.execute_query(
            engine=engine,
            sql=body.sql,
            is_read_only=profile.read_only,
            row_limit=profile.row_limit,
            timeout_seconds=profile.query_timeout_seconds,
        )
        engine.dispose()
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": "query_failed", "message": str(exc)})

    return QueryExecuteResponse(
        rows=result.rows,
        columns=result.columns,
        row_count=result.row_count,
        execution_time_ms=result.execution_time_ms,
        truncated=result.truncated,
        db_messages=result.db_messages,
        require_confirmation=False,
        operations=[],
    )
