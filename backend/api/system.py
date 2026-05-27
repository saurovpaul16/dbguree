import threading
from pathlib import Path
from typing import Any

import psutil
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from backend.api.schemas.system import HealthResponse, ModelStatusResponse, RAMResponse
from backend.config import AppSettings, get_settings
from backend.distribution.model_download import MODEL_MANIFEST, download_model, get_model_status

router = APIRouter(tags=["system"])

# In-memory download progress store
_download_progress: dict[str, dict] = {}


@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")


@router.get("/system/ram", response_model=RAMResponse)
def get_ram():
    ram_gb = psutil.virtual_memory().total / (1024**3)
    recommended = "slm-sql-1.5b-q4" if ram_gb >= 8 else "slm-sql-0.5b-q4"
    return RAMResponse(ram_gb=round(ram_gb, 1), recommended_model=recommended)


@router.get("/system/models", response_model=list[ModelStatusResponse])
def list_models(settings: AppSettings = Depends(get_settings)):
    models_dir = Path(settings.MODELS_DIR)
    return [
        ModelStatusResponse(**get_model_status(key, models_dir))
        for key in MODEL_MANIFEST
    ]


@router.post("/system/models/download/{model_key}")
def trigger_download(
    model_key: str,
    background_tasks: BackgroundTasks,
    settings: AppSettings = Depends(get_settings),
):
    if model_key not in MODEL_MANIFEST:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_key}")

    if _download_progress.get(model_key, {}).get("status") == "downloading":
        return {"status": "already_downloading"}

    _download_progress[model_key] = {
        "status": "downloading",
        "progress_pct": 0,
        "downloaded_bytes": 0,
        "total_bytes": MODEL_MANIFEST[model_key]["size_bytes"],
    }

    def _run():
        models_dir = Path(settings.MODELS_DIR)

        def on_progress(fraction: float):
            total = MODEL_MANIFEST[model_key]["size_bytes"]
            _download_progress[model_key].update(
                {
                    "progress_pct": int(fraction * 100),
                    "downloaded_bytes": int(fraction * total),
                }
            )

        try:
            download_model(model_key, models_dir, progress_callback=on_progress)
            _download_progress[model_key]["status"] = "complete"
            _download_progress[model_key]["progress_pct"] = 100
        except Exception as exc:
            _download_progress[model_key]["status"] = "error"
            _download_progress[model_key]["error"] = str(exc)

    background_tasks.add_task(_run)
    return {"status": "started"}


@router.get("/system/models/download/{model_key}/status")
def get_download_status(model_key: str):
    if model_key not in MODEL_MANIFEST:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_key}")
    return _download_progress.get(
        model_key,
        {
            "status": "idle",
            "progress_pct": 0,
            "downloaded_bytes": 0,
            "total_bytes": MODEL_MANIFEST[model_key]["size_bytes"],
        },
    )


@router.delete("/system/models/{model_key}")
def delete_model(model_key: str, settings: AppSettings = Depends(get_settings)):
    """Delete a downloaded model file from disk."""
    if model_key not in MODEL_MANIFEST:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_key}")

    model_path = Path(settings.MODELS_DIR) / f"{model_key}.gguf"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail=f"Model not downloaded: {model_key}")

    model_path.unlink()
    _download_progress.pop(model_key, None)
    return {"status": "deleted", "model": model_key}
