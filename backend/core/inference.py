import asyncio
import threading
from pathlib import Path
from typing import Any, Optional

import psutil

from backend.core.interfaces import GenerationCancelledError, InferenceBackend


class LocalLlamaInference(InferenceBackend):
    """
    Local LLM inference via llama-cpp-python.
    Lazy-loads on first generate() call.
    Supports cancellation via a threading.Event checked between streamed tokens. [TR-12]
    """

    def __init__(self, model_path: str) -> None:
        self._model_path = model_path
        self._model: Optional[Any] = None
        self._load_lock = threading.Lock()
        self._cancel_event = threading.Event()

    def _ensure_loaded(self) -> Any:
        if self._model is None:
            with self._load_lock:
                if self._model is None:
                    from llama_cpp import Llama
                    import warnings

                    if not Path(self._model_path).exists():
                        warnings.warn(
                            f"LLM model not found: {self._model_path}. "
                            "Using fallback mock model. Download the real model via the model download API."
                        )
                        self._model = "mock"
                        return self._model
                    
                    self._model = Llama(
                        model_path=self._model_path,
                        n_ctx=4096,
                        verbose=False,
                    )
        return self._model

    def _run_inference_sync(self, prompt: str, max_tokens: int) -> str:
        """Runs in a thread via asyncio.to_thread. Checks cancel between tokens."""
        self._cancel_event.clear()
        model = self._ensure_loaded()
        tokens: list[str] = []

        # Mock model for testing
        if model == "mock":
            return "SELECT 1 AS mock_result;"

        for token in model(prompt, max_tokens=max_tokens, stream=True):
            if self._cancel_event.is_set():
                raise GenerationCancelledError("Generation cancelled by user")
            tokens.append(token["choices"][0]["text"])

        return "".join(tokens)

    async def generate(self, prompt: str, max_tokens: int = 1024) -> str:
        return await asyncio.to_thread(self._run_inference_sync, prompt, max_tokens)

    def cancel(self) -> None:
        """Called by POST /chat/cancel. Signals the generation thread to stop."""
        self._cancel_event.set()

    def swap_model(self, new_model_path: str) -> None:
        """
        Hot-swap the model file. Unloads the current model so the next
        generate() call lazy-loads the new one.
        Called by POST /llm/load after a model is downloaded.
        """
        with self._load_lock:
            self._model = None
            self._model_path = new_model_path

    @property
    def model_name(self) -> Optional[str]:
        """Returns the model key (stem) only if the file actually exists on disk."""
        return Path(self._model_path).stem if Path(self._model_path).exists() else None

    @property
    def active_model_key(self) -> Optional[str]:
        """The model key currently configured (regardless of whether file exists)."""
        return Path(self._model_path).stem

    @property
    def is_local(self) -> bool:
        return True


class InferenceBackendFactory:
    """Creates the appropriate local inference backend based on available RAM."""

    @staticmethod
    def create_local(models_dir: str) -> LocalLlamaInference:
        ram_gb = psutil.virtual_memory().total / (1024**3)
        model_file = (
            "slm-sql-1.5b-q4.gguf" if ram_gb >= 8 else "slm-sql-0.5b-q4.gguf"
        )
        model_path = str(Path(models_dir) / model_file)
        return LocalLlamaInference(model_path=model_path)
