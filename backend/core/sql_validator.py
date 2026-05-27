from typing import Optional

import sqlglot


_DIALECT_MAP: dict[str, str] = {
    "postgresql": "postgres",
    "mysql": "mysql",
    "mssql": "tsql",
}


class SQLValidator:
    """
    Validates SQL syntax using sqlglot for dialect-aware parsing.
    Used for the post-generation validation step in NLToSQLService.
    """

    def __init__(self, db_type: str) -> None:
        self._dialect = _DIALECT_MAP.get(db_type, "postgres")

    def validate(self, sql: str) -> tuple[bool, Optional[str]]:
        """
        Returns (is_valid, error_message).
        error_message is None when valid.
        """
        try:
            errors = sqlglot.transpile(sql, read=self._dialect, error_level=sqlglot.ErrorLevel.RAISE)
            return True, None
        except sqlglot.errors.ParseError as e:
            return False, str(e)
        except Exception as e:
            return False, f"Validation error: {e}"

    @staticmethod
    def dialect_for(db_type: str) -> str:
        return _DIALECT_MAP.get(db_type, "postgres")
