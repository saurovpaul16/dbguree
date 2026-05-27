"""
AST-based destructive query detection using sqlglot. [TR-7]

String matching is NOT used anywhere in this module.
All detection is done by inspecting the sqlglot AST node types.

Correctly handles:
- Multi-statement queries (SELECT 1; DELETE FROM ...)
- DML inside CTEs
- Keywords in string literals (safely ignored by the parser)
"""

import sqlglot
from sqlglot import exp

_DIALECT_MAP: dict[str, str] = {
    "postgresql": "postgres",
    "mysql": "mysql",
    "mssql": "tsql",
}

DESTRUCTIVE_NODE_TYPES = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,      # CREATE TABLE, CREATE INDEX, etc.
    exp.Alter,
    exp.TruncateTable,
)


def is_destructive(
    sql: str, db_type: str = "postgresql"
) -> tuple[bool, list[str]]:
    """
    Returns (is_destructive, list_of_detected_operation_names).
    Fails safe: if parsing fails, treats as destructive.
    """
    dialect = _DIALECT_MAP.get(db_type, "postgres")

    try:
        statements = sqlglot.parse(sql, dialect=dialect)
    except Exception:
        return True, ["PARSE_ERROR"]

    detected: list[str] = []
    for stmt in statements:
        for node_type in DESTRUCTIVE_NODE_TYPES:
            if stmt.find(node_type):
                name = node_type.__name__.upper()
                if name not in detected:
                    detected.append(name)

    return len(detected) > 0, detected


def check_read_only_violation(
    sql: str, db_type: str = "postgresql"
) -> tuple[bool, list[str]]:
    """Alias for is_destructive — used in read-only mode enforcement."""
    return is_destructive(sql, db_type)
