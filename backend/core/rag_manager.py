"""
RAG Manager — ChromaDB via LangChain VectorStore interface only.
One collection per connection_profile_id. [TR-6]
No direct ChromaDB API calls in this module.
"""

from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

from backend.core.embeddings import NomicLangChainEmbeddings
from backend.core.interfaces import EmbeddingProvider, VectorStoreProvider


class RAGManager(VectorStoreProvider):
    """
    Manages one Chroma vector store collection per connection profile.

    Isolation strategy [TR-6]:
    - Stronger data isolation — no cross-contamination between schemas.
    - Simpler metadata filtering — no per-query connection_id filter needed.
    - Clean deletion — dropping a connection drops its entire collection.
    """

    def __init__(
        self, persist_directory: str, embedding_provider: EmbeddingProvider
    ) -> None:
        self._persist_directory = persist_directory
        self._embeddings = NomicLangChainEmbeddings(embedding_provider)
        self._stores: dict[str, Chroma] = {}

    def _get_or_create_store(self, connection_id: str) -> Chroma:
        if connection_id not in self._stores:
            self._stores[connection_id] = Chroma(
                collection_name=f"conn_{connection_id}",
                persist_directory=self._persist_directory,
                embedding_function=self._embeddings,
            )
        return self._stores[connection_id]

    # ── VectorStoreProvider interface ─────────────────────────────────────────

    def add_documents(self, docs: list[Document], connection_id: str) -> list[str]:
        store = self._get_or_create_store(connection_id)
        return store.add_documents(docs)

    def similarity_search(
        self, query: str, connection_id: str, k: int = 5
    ) -> list[Document]:
        store = self._get_or_create_store(connection_id)
        return store.similarity_search(query, k=k)

    def delete_collection(self, connection_id: str) -> None:
        store = self._get_or_create_store(connection_id)
        store.delete_collection()
        self._stores.pop(connection_id, None)

    # ── Domain operations ─────────────────────────────────────────────────────

    def index_schema(self, schema: dict, connection_id: str) -> None:
        """Index schema tables — one document per table."""
        docs = self._schema_to_documents(schema, connection_id)
        if docs:
            self.add_documents(docs, connection_id)

    def index_document(
        self, text: str, filename: str, connection_id: str
    ) -> list[str]:
        """Chunk and index an uploaded document. Returns chroma chunk IDs."""
        from backend.utils.text_chunker import TextChunker

        chunks = TextChunker().chunk(text)
        docs = [
            Document(
                page_content=chunk,
                metadata={"source": filename, "connection_id": connection_id},
            )
            for chunk in chunks
        ]
        return self.add_documents(docs, connection_id)

    def add_learned_pair(
        self, nl: str, sql: str, connection_id: str, pair_id: str
    ) -> str:
        """Index a user-approved NL→SQL pair. Returns chroma document ID."""
        doc = Document(
            page_content=f"Question: {nl}\nSQL: {sql}",
            metadata={"type": "learned_pair", "pair_id": pair_id},
        )
        ids = self.add_documents([doc], connection_id)
        return ids[0]

    def retrieve_context(
        self, query: str, connection_id: str, k: int = 5
    ) -> list[Document]:
        return self.similarity_search(query, connection_id, k=k)

    def _schema_to_documents(
        self, schema: dict, connection_id: str
    ) -> list[Document]:
        """Convert schema dict to one Document per table."""
        docs: list[Document] = []
        for table in schema.get("tables", []):
            cols = ", ".join(
                f"{c['name']} {c['type']}"
                + (" PK" if c.get("primary_key") else "")
                + (" FK" if c.get("foreign_key") else "")
                for c in table.get("columns", [])
            )
            content = f"Table: {table['name']}\nColumns: {cols}"
            if table.get("foreign_keys"):
                fks = ", ".join(
                    f"{fk['constrained_columns']} → {fk['referred_table']}.{fk['referred_columns']}"
                    for fk in table["foreign_keys"]
                )
                content += f"\nForeign keys: {fks}"
            docs.append(
                Document(
                    page_content=content,
                    metadata={
                        "type": "schema",
                        "table": table["name"],
                        "connection_id": connection_id,
                    },
                )
            )
        return docs
