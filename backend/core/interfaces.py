from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class InferenceBackend(ABC):
    """
    Pluggable LLM backend interface.
    Implementations: LocalLlamaInference (llama.cpp), CloudInference (future).
    """

    @abstractmethod
    async def generate(self, prompt: str, max_tokens: int = 1024) -> str:
        """Generate text from prompt. Raises GenerationCancelledError if cancelled."""
        ...

    @abstractmethod
    def cancel(self) -> None:
        """Signal the current generation to stop gracefully."""
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    @property
    @abstractmethod
    def is_local(self) -> bool:
        ...


class EmbeddingProvider(ABC):
    """
    Pluggable embedding backend interface.
    Implementations: NomicEmbeddingProvider (llama.cpp), CloudEmbeddings (future).
    """

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        ...

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        ...


class VectorStoreProvider(ABC):
    """
    Pluggable vector store interface.
    All access is through this interface — no direct ChromaDB calls in application code.
    """

    @abstractmethod
    def add_documents(self, docs: list[Any], connection_id: str) -> list[str]:
        ...

    @abstractmethod
    def similarity_search(
        self, query: str, connection_id: str, k: int = 5
    ) -> list[Any]:
        ...

    @abstractmethod
    def delete_collection(self, connection_id: str) -> None:
        ...


@dataclass
class NLToSQLResult:
    sql: str
    explanation: str
    was_retried: bool
    context_docs: list[Any]


class GenerationCancelledError(Exception):
    """Raised when LLM generation is cancelled via cancel()."""
    pass
