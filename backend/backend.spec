# PyInstaller spec for DBGuree backend
# Produces a one-directory bundle: backend-dist/backend/
# Run from the project root:
#   pyinstaller backend/backend.spec

import os
from pathlib import Path

ROOT = Path(SPECPATH).parent   # project root (dbguree2/)
BACKEND = ROOT / "backend"

block_cipher = None

a = Analysis(
    [str(BACKEND / "main.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        # Alembic migrations must ship with the app
        (str(BACKEND / "alembic"), "backend/alembic"),
        # alembic.ini if present
        *( [(str(ROOT / "alembic.ini"), ".")] if (ROOT / "alembic.ini").exists() else [] ),
    ],
    hiddenimports=[
        # FastAPI / Starlette / Uvicorn
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "starlette.middleware",
        "starlette.middleware.cors",

        # SQLAlchemy dialects used at runtime
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.postgresql",
        "sqlalchemy.dialects.mysql",

        # Database drivers (loaded dynamically)
        "psycopg2",
        "pymysql",

        # Pydantic
        "pydantic.deprecated.class_validators",
        "pydantic.deprecated.config",
        "pydantic_settings",

        # Alembic
        "alembic.runtime.migration",
        "alembic.operations.ops",

        # LangChain / ChromaDB
        "langchain_community.vectorstores",
        "langchain_community.vectorstores.chroma",
        "chromadb",
        "chromadb.api",
        "chromadb.api.client",

        # Keyring backends
        "keyring.backends",
        "keyring.backends.Windows",
        "keyring.backends.macOS",
        "keyrings.alt.file",

        # Misc
        "psutil",
        "sqlglot",
        "pypdf",
        "docx",
        "markdown_it",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Exclude heavy ML libraries not needed at startup
        "torch", "tensorflow", "keras",
        "matplotlib", "PIL", "cv2",
        "jupyter", "IPython",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,          # Keep console so stdout port signal works [TR-3]
    icon=str(ROOT / "electron" / "assets" / "icon.ico") if os.path.exists(str(ROOT / "electron" / "assets" / "icon.ico")) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="backend",
)
