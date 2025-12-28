import json
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app import config


class CatalogError(Exception):
    def __init__(self, message: str, cause: Exception | None = None):
        super().__init__(message)
        self.cause = cause


_cached_catalog: dict[str, str] | None = None


def _s3_client():
    return boto3.client(
        "s3",
        region_name=config.S3_REGION,
        endpoint_url=config.S3_ENDPOINT_URL,
        aws_access_key_id=config.S3_ACCESS_KEY_ID,
        aws_secret_access_key=config.S3_SECRET_ACCESS_KEY,
    )


def _parse_catalog(payload: str) -> dict[str, str]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise CatalogError("Malformed catalog JSON", exc)

    tables = data.get("tables") if isinstance(data, dict) else None
    if not isinstance(tables, dict):
        return {}

    return {str(key): str(value) for key, value in tables.items()}


def _resolve_catalog_key() -> str:
    if not config.DEFAULT_CATALOG:
        return ""
    if config.S3_DIR:
        return f"{config.S3_DIR}/{config.DEFAULT_CATALOG.lstrip('/')}"
    return config.DEFAULT_CATALOG


def _create_empty_catalog() -> dict[str, str]:
    key = _resolve_catalog_key()
    if not key:
        raise CatalogError("GAGARA_S3_DEFAULT_CATALOG is not set")
    payload = json.dumps({"tables": {}}, indent=2)
    _s3_client().put_object(
        Bucket=config.S3_BUCKET,
        Key=key,
        Body=payload.encode("utf-8"),
        ContentType="application/json",
    )
    return {}


def _save_catalog(tables: dict[str, str]) -> None:
    key = _resolve_catalog_key()
    if not key:
        raise CatalogError("GAGARA_S3_DEFAULT_CATALOG is not set")
    payload = json.dumps({"tables": tables}, indent=2)
    _s3_client().put_object(
        Bucket=config.S3_BUCKET,
        Key=key,
        Body=payload.encode("utf-8"),
        ContentType="application/json",
    )


def _load_catalog() -> dict[str, str]:
    if not config.DEFAULT_CATALOG:
        raise CatalogError("GAGARA_S3_DEFAULT_CATALOG is not set")

    key = _resolve_catalog_key()
    try:
        response = _s3_client().get_object(
            Bucket=config.S3_BUCKET,
            Key=key,
        )
    except ClientError as exc:
        error = exc.response.get("Error", {}) if hasattr(exc, "response") else {}
        code = str(error.get("Code", "")).strip()
        if code in {"NoSuchKey", "404", "NotFound"}:
            return _create_empty_catalog()
        raise CatalogError("Failed to load catalog from S3", exc)
    except BotoCoreError as exc:
        raise CatalogError("Failed to load catalog from S3", exc)

    body = response.get("Body")
    if body is None:
        raise CatalogError("Catalog object has no body")

    raw = body.read().decode("utf-8")
    return _parse_catalog(raw)


def get_catalog() -> dict[str, str]:
    global _cached_catalog
    if _cached_catalog is None:
        _cached_catalog = _load_catalog()
    return _cached_catalog


def refresh_catalog() -> dict[str, str]:
    global _cached_catalog
    _cached_catalog = _load_catalog()
    return _cached_catalog


def add_table(name: str, path: str) -> dict[str, str]:
    if not name or not path:
        raise CatalogError("Table name and path are required")

    global _cached_catalog
    tables = _load_catalog()
    normalized = path.strip()
    if not normalized.startswith("s3://"):
        prefix = f"{config.S3_DIR}/" if config.S3_DIR else ""
        normalized = f"s3://{config.S3_BUCKET}/{prefix}{normalized.lstrip('/')}"
    tables[str(name)] = normalized
    _save_catalog(tables)
    _cached_catalog = tables
    return tables


def delete_table(name: str) -> dict[str, str]:
    if not name:
        raise CatalogError("Table name is required")

    global _cached_catalog
    tables = _load_catalog()
    tables.pop(str(name), None)
    _save_catalog(tables)
    _cached_catalog = tables
    return tables
