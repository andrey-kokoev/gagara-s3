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


def _create_empty_catalog() -> dict[str, str]:
    payload = json.dumps({"tables": {}}, indent=2)
    _s3_client().put_object(
        Bucket=config.S3_BUCKET,
        Key=config.DEFAULT_CATALOG,
        Body=payload.encode("utf-8"),
        ContentType="application/json",
    )
    return {}


def _load_catalog() -> dict[str, str]:
    if not config.DEFAULT_CATALOG:
        raise CatalogError("GAGARA_S3_DEFAULT_CATALOG is not set")

    try:
        response = _s3_client().get_object(
            Bucket=config.S3_BUCKET,
            Key=config.DEFAULT_CATALOG,
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
