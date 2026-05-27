from pathlib import Path

import psutil
from fastapi import APIRouter, Depends, HTTPException

from backend.api.deps import get_inference_backend, get_settings
from backend.config import AppSettings
from backend.core.inference import LocalLlamaInference
from backend.core.interfaces import InferenceBackend
from backend.db.credentials import store_api_key
from backend.distribution.model_download import MODEL_MANIFEST

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/status")
def get_llm_status(
    inference: InferenceBackend = Depends(get_inference_backend),
    settings: AppSettings = Depends(get_settings),
):
    ram_gb = psutil.virtual_memory().total / (1024**3)
    # model_name is None when the file doesn't exist on disk yet
    model_name = inference.model_name
    # active_model_key is always the configured key (for UI to highlight the right row)
    active_key = getattr(inference, "active_model_key", model_name)
    return {
        "backend": "local" if inference.is_local else "cloud",
        "model": model_name,           # None if file not on disk
        "active_model_key": active_key, # always set — used by Settings to highlight row
        "model_available": model_name is not None,
        "tier": "local" if inference.is_local else "cloud",
        "ram_gb": round(ram_gb, 1),
    }


@router.post("/load")
def load_model(
    model_key: str,
    inference: InferenceBackend = Depends(get_inference_backend),
    settings: AppSettings = Depends(get_settings),
):
    """
    Activate a downloaded model. Unloads the current model so the next
    inference request lazy-loads the chosen one.
    """
    if model_key not in MODEL_MANIFEST:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_key}")

    model_path = Path(settings.MODELS_DIR) / f"{model_key}.gguf"
    if not model_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Model file not found: {model_path}. Download it first.",
        )

    if not isinstance(inference, LocalLlamaInference):
        raise HTTPException(status_code=400, detail="Cannot swap model on a cloud backend.")

    inference.swap_model(str(model_path))
    return {"status": "loaded", "model": model_key, "path": str(model_path)}


@router.post("/cloud/configure")
def configure_cloud(provider: str, api_key: str):
    """Store cloud LLM API key in OS keychain."""
    store_api_key(provider, api_key)
    return {"status": "configured", "provider": provider}


@router.post("/switch")
def switch_backend(backend: str):
    """Stub for MVP — cloud backend switching not yet implemented."""
    return {"status": "not_implemented", "requested": backend}
