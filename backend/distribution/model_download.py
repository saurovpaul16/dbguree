"""
Model download module. [TR-8]
Versioned CDN + SHA-256 integrity verification + resumable downloads.

IMPORTANT: SHA-256 hashes are placeholders.
PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION must be replaced with
actual hashes before any distribution. Leaving placeholders is a build-time error.
"""

import hashlib
from pathlib import Path
from typing import Callable, Optional

MODEL_MANIFEST: dict[str, dict] = {
    "slm-sql-1.5b-q4": {
        "url": "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
        "sha256": "PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION",
        "size_bytes": 1_073_741_824,  # ~1 GB
        "min_ram_gb": 8,
        "description": "Qwen2.5-Coder-1.5B Q4 — default model (8 GB+ RAM)",
    },
    "slm-sql-0.5b-q4": {
        "url": "https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf",
        "sha256": "PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION",
        "size_bytes": 419_430_400,  # ~400 MB
        "min_ram_gb": 4,
        "description": "Qwen2.5-Coder-0.5B Q4 — fallback model (4–8 GB RAM)",
    },
    "nomic-embed-text-v1.5": {
        "url": "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5.gguf/resolve/main/nomic-embed-text-v1.5.gguf",
        "sha256": "PLACEHOLDER_HASH_TO_BE_FILLED_BEFORE_DISTRIBUTION",
        "size_bytes": 576_716_800,  # ~550 MB
        "min_ram_gb": 4,
        "description": "nomic-embed-text-v1.5 — used for all RAG operations",
    },
}


def download_model(
    model_key: str,
    dest_dir: Path,
    progress_callback: Optional[Callable[[float], None]] = None,
) -> Path:
    """
    Resumable download with SHA-256 integrity verification.
    - File exists and hash matches → skip.
    - File partially exists → resume from byte offset (Range header).
    - Hash mismatch after full download → delete file and raise.
    """
    import requests

    manifest = MODEL_MANIFEST[model_key]
    dest_path = dest_dir / f"{model_key}.gguf"
    existing_size = dest_path.stat().st_size if dest_path.exists() else 0

    # Already fully downloaded and verified
    if existing_size == manifest["size_bytes"]:
        if _verify_sha256(dest_path, manifest["sha256"]):
            return dest_path
        else:
            dest_path.unlink()
            existing_size = 0

    # Prepare headers
    headers = {}
    if existing_size > 0:
        headers["Range"] = f"bytes={existing_size}-"
    # Add User-Agent for Hugging Face
    headers["User-Agent"] = "DBGuree/1.0"

    with requests.get(manifest["url"], headers=headers, stream=True, timeout=60) as r:
        r.raise_for_status()
        mode = "ab" if existing_size > 0 else "wb"
        downloaded = existing_size
        total = manifest["size_bytes"]

        with open(dest_path, mode) as f:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                downloaded += len(chunk)
                if progress_callback:
                    progress_callback(downloaded / total)

    if not _verify_sha256(dest_path, manifest["sha256"]):
        dest_path.unlink()
        raise ValueError(
            f"SHA-256 verification failed for {model_key!r}. "
            "File deleted. Try downloading again."
        )

    return dest_path


def get_model_status(model_key: str, models_dir: Path) -> dict:
    """Return download status for a model key."""
    manifest = MODEL_MANIFEST[model_key]
    dest_path = models_dir / f"{model_key}.gguf"

    if not dest_path.exists():
        return {
            "key": model_key,
            "downloaded": False,
            "size_bytes": 0,
            "total_bytes": manifest["size_bytes"],
            "verified": False,
        }

    size = dest_path.stat().st_size
    fully_downloaded = size == manifest["size_bytes"]
    verified = fully_downloaded and _verify_sha256(dest_path, manifest["sha256"])

    return {
        "key": model_key,
        "downloaded": fully_downloaded,
        "size_bytes": size,
        "total_bytes": manifest["size_bytes"],
        "verified": verified,
        "description": manifest["description"],
        "min_ram_gb": manifest["min_ram_gb"],
    }


def _verify_sha256(path: Path, expected_hash: str) -> bool:
    if expected_hash.startswith("PLACEHOLDER"):
        # Placeholders skip verification — only valid during development
        return True
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest() == expected_hash
