import hashlib
import json

from sqlalchemy import Engine, inspect


class SchemaExtractor:
    """
    Extracts schema metadata from a live database using SQLAlchemy inspection.
    Returns a plain dict — no DB connection is exposed to callers.
    """

    def extract(self, engine: Engine) -> dict:
        inspector = inspect(engine)
        tables = []

        for table_name in inspector.get_table_names():
            columns = [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "default": str(col.get("default") or ""),
                    "primary_key": col["name"]
                    in [pk for pk in inspector.get_pk_constraint(table_name).get("constrained_columns", [])],
                    "foreign_key": False,  # filled below
                }
                for col in inspector.get_columns(table_name)
            ]

            foreign_keys = []
            fk_cols: set[str] = set()
            for fk in inspector.get_foreign_keys(table_name):
                foreign_keys.append(
                    {
                        "constrained_columns": fk.get("constrained_columns", []),
                        "referred_table": fk.get("referred_table", ""),
                        "referred_columns": fk.get("referred_columns", []),
                    }
                )
                fk_cols.update(fk.get("constrained_columns", []))

            for col in columns:
                if col["name"] in fk_cols:
                    col["foreign_key"] = True

            tables.append(
                {
                    "name": table_name,
                    "columns": columns,
                    "foreign_keys": foreign_keys,
                }
            )

        return {"tables": tables}

    def compute_hash(self, schema: dict) -> str:
        """Deterministic SHA-256 of the schema dict (sorted keys)."""
        canonical = json.dumps(schema, sort_keys=True, default=str)
        return hashlib.sha256(canonical.encode()).hexdigest()
