"""
NL-to-SQL generation service.

Critical constraint: The LLM receives ONLY RAG context strings.
It never receives a live database connection or raw query results. [architecture rule 1]

Generation strategy: Single generation + one validation retry. No self-consistency. [TR-2]
"""

from langchain_core.documents import Document

from backend.core.interfaces import (
    InferenceBackend,
    NLToSQLResult,
)
from backend.core.rag_manager import RAGManager
from backend.core.sql_validator import SQLValidator

_PERSONA_INSTRUCTIONS: dict[str, str] = {
    "analyst": "You are a SQL expert assisting a data analyst. Use clear, readable SQL with aliases.",
    "developer": "You are a SQL expert assisting a backend developer. Optimise for performance.",
    "dba": "You are a SQL expert assisting a DBA. Include comments and be explicit about indexes.",
}

_PROMPT_TEMPLATE = """\
{persona_instruction}

You are generating SQL for a {db_type} database.

## Schema context:
{schema_context}

## Similar past queries (for reference):
{pair_context}

## User question:
{question}

Generate the SQL query and provide a brief explanation. Keep your response concise.

Output format:
SQL:
```sql
<SQL query>
```
EXPLANATION:
<one short sentence only>
"""


class NLToSQLService:
    """
    Orchestrates RAG retrieval → prompt construction → LLM generation → validation.
    Single generation + one retry on syntax failure. [TR-2]
    """

    def __init__(
        self,
        inference: InferenceBackend,
        rag_manager: RAGManager,
        validator: SQLValidator,
    ) -> None:
        self._inference = inference
        self._rag = rag_manager
        self._validator = validator

    async def generate(
        self,
        nl_question: str,
        connection_id: str,
        db_type: str,
        persona: str = "analyst",
    ) -> NLToSQLResult:
        context_docs = self._rag.retrieve_context(nl_question, connection_id, k=5)
        prompt = self._build_prompt(nl_question, context_docs, db_type, persona)

        raw = await self._inference.generate(prompt)
        sql, explanation = self._parse_output(raw)

        is_valid, error = self._validator.validate(sql)
        was_retried = False

        if not is_valid:
            retry_prompt = (
                prompt
                + f"\n\nThe previous SQL had a syntax error: {error}\n"
                "Please correct it and respond in the same format."
            )
            raw = await self._inference.generate(retry_prompt)
            sql, explanation = self._parse_output(raw)
            was_retried = True

        return NLToSQLResult(
            sql=sql,
            explanation=explanation,
            was_retried=was_retried,
            context_docs=context_docs,
        )

    def _build_prompt(
        self,
        question: str,
        context_docs: list[Document],
        db_type: str,
        persona: str,
    ) -> str:
        schema_docs = [
            d for d in context_docs if d.metadata.get("type") == "schema"
        ]
        pair_docs = [
            d for d in context_docs if d.metadata.get("type") == "learned_pair"
        ]

        schema_context = (
            "\n\n".join(d.page_content for d in schema_docs)
            or "No schema context available."
        )
        pair_context = (
            "\n\n".join(d.page_content for d in pair_docs) or "None."
        )

        persona_instruction = _PERSONA_INSTRUCTIONS.get(
            persona, _PERSONA_INSTRUCTIONS["analyst"]
        )

        return _PROMPT_TEMPLATE.format(
            persona_instruction=persona_instruction,
            db_type=db_type,
            schema_context=schema_context,
            pair_context=pair_context,
            question=question,
        )

    def _parse_output(self, raw: str) -> tuple[str, str]:
        """
        Extract SQL and explanation from the LLM output.
        Falls back gracefully if the model doesn't follow the format exactly.
        Trims explanation to first 20 words max to prevent rambling.
        """
        import re

        sql = ""
        explanation = ""

        sql_match = re.search(r"```sql\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if sql_match:
            sql = sql_match.group(1).strip()
        else:
            # Fallback: take everything between SQL: and EXPLANATION:
            sql_block = re.search(
                r"SQL:\s*(.*?)(?:EXPLANATION:|$)", raw, re.DOTALL | re.IGNORECASE
            )
            if sql_block:
                sql = sql_block.group(1).strip().strip("`").strip()

        exp_match = re.search(
            r"EXPLANATION:\s*(.*?)$", raw, re.DOTALL | re.IGNORECASE
        )
        if exp_match:
            full_explanation = exp_match.group(1).strip()
            # Remove any instruction text that might have been included
            full_explanation = re.sub(r'<[^>]+>', '', full_explanation).strip()
            # Trim to first 20 words to prevent model rambling
            words = full_explanation.split()[:20]
            explanation = " ".join(words).strip()
            if explanation and not explanation.endswith(('.', '!', '?')):
                explanation += '.'

        if not sql:
            sql = raw.strip()

        return sql, explanation
