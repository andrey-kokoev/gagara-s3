import os
from pathlib import Path
from typing import Optional


def _load_env() -> None:
    """Load a .env file if present by walking up from this file."""
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return

    current = Path(__file__).resolve()
    for parent in [current, *current.parents]:
        env_path = parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path)
            return


_load_env()

SERVICE_TOKEN = os.getenv("GAGARA_S3_SERVICE_TOKEN", "").strip()

S3_BUCKET = os.getenv("GAGARA_S3_BUCKET", "").strip()
S3_REGION = os.getenv("GAGARA_S3_REGION", "auto").strip() or "auto"
S3_ACCESS_KEY_ID = os.getenv("GAGARA_S3_ACCESS_KEY_ID", "").strip()
S3_SECRET_ACCESS_KEY = os.getenv("GAGARA_S3_SECRET_ACCESS_KEY", "").strip()
S3_ENDPOINT_URL: Optional[str] = os.getenv("GAGARA_S3_ENDPOINT_URL", "").strip() or None

DEFAULT_CATALOG = os.getenv("GAGARA_S3_DEFAULT_CATALOG", "").strip()
S3_DIR = os.getenv("GAGARA_S3_DIR", "").strip().strip("/")
REQUIRED_TABLES_JSON = os.getenv("GAGARA_S3_REQUIRED_TABLES_JSON", "").strip()
NODE_ENV = os.getenv("NODE_ENV", "development").strip()


def require_env() -> None:
    missing = []
    if not SERVICE_TOKEN:
        missing.append("GAGARA_S3_SERVICE_TOKEN")
    if not S3_BUCKET:
        missing.append("GAGARA_S3_BUCKET")
    if not S3_ACCESS_KEY_ID:
        missing.append("GAGARA_S3_ACCESS_KEY_ID")
    if not S3_SECRET_ACCESS_KEY:
        missing.append("GAGARA_S3_SECRET_ACCESS_KEY")
    if not DEFAULT_CATALOG:
        missing.append("GAGARA_S3_DEFAULT_CATALOG")

    if missing:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")
