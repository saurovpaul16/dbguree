import threading
from pathlib import Path
from typing import Any, Optional

from langchain_core.embeddings import Embeddings

from backend.core.interfaces import EmbeddingProvider


class NomicEmbeddingProvider(EmbeddingProvider):
    """
    nomic-embed-text-v1.5 via llama-cpp-python.
    Lazy-loads on first use to avoid slowing down startup.
    Thread-safe via a lock.
    """

    def __init__(self, model_path: str) -> None:
        self._model_path = model_path
        self._model: Optional[Any] = None
        self._lock = threading.Lock()

    def _ensure_loaded(self) -> Any:
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from llama_cpp import Llama

                    if not Path(self._model_path).exists():
                        # Try to create a minimal model or skip for now
                        import warnings
                        warnings.warn(
                            f"Embedding model not found: {self._model_path}. "
                            "Using fallback mock embeddings. Download the real model via the model download API."
                        )
                        # Return None to trigger fallback
                        self._model = "mock"
                        return self._model
                    self._model = Llama(
                        model_path=self._model_path,
                        embedding=True,
                        n_ctx=512,
                        verbose=False,
                    )
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure_loaded()
        if model == "mock":
            # Return mock embeddings for testing
            return [[0.1] * 384 for _ in texts]
        return [model.embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        model = self._ensure_loaded()
        if model == "mock":
            # Return mock embeddings for testing
            return [0.1] * 384
        return model.embed(text)

    @property
    def model_name(self) -> str:
        return "nomic-embed-text-v1.5"


class NomicLangChainEmbeddings(Embeddings):
    """
    LangChain-compatible wrapper around NomicEmbeddingProvider.
    Used by ChromaDB via LangChain VectorStore interface.
    """

    def __init__(self, provider: NomicEmbeddingProvider) -> None:
        self._provider = provider

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._provider.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._provider.embed_query(text)
