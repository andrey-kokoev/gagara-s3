from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from app import auth, catalog, config, engine
from app.models import QueryRequest


def _error_response(status_code: int, code: str, message: str, hint: str | None = None) -> JSONResponse:
    payload: dict[str, Any] = {"error": message, "code": code}
    if hint:
        payload["details"] = {"hint": hint}
    return JSONResponse(payload, status_code=status_code)


def _is_dev() -> bool:
    return config.NODE_ENV != "production"


def _sql_error_code(message: str) -> str:
    lowered = message.lower()
    if "parser" in lowered or "syntax" in lowered:
        return "PARSE_ERROR"
    return "EXECUTION_ERROR"


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        config.require_env()
        catalog.get_catalog()
    except Exception:
        # Defer failures to request time; startup shouldn't crash containers.
        pass
    yield


app = FastAPI(lifespan=lifespan)


@app.exception_handler(auth.AuthError)
async def auth_error_handler(_request: Request, exc: auth.AuthError) -> JSONResponse:
    return _error_response(exc.status_code, "AUTH_ERROR", exc.message)


@app.post("/query")
async def run_query(
    request: QueryRequest,
    req: Request,
    _token: str = Depends(auth.verify_token),
):
    format_value = req.query_params.get("format", "json")
    if format_value not in {"json", "csv"}:
        return _error_response(400, "FORMAT_ERROR", "Invalid format parameter")

    try:
        tables = catalog.get_catalog()
    except catalog.CatalogError as exc:
        hint = str(exc) if _is_dev() else None
        return _error_response(500, "CATALOG_ERROR", exc.args[0], hint)

    try:
        rows = engine.execute_query(request.sql, tables)
    except Exception as exc:
        message = str(exc) or "Query failed"
        code = _sql_error_code(message)
        hint = message if _is_dev() else None
        return _error_response(400, code, message, hint)

    if format_value == "csv":
        csv_text = _rows_to_csv(rows)
        return PlainTextResponse(csv_text, media_type="text/csv")

    return JSONResponse({"data": rows, "format": "json", "rowCount": len(rows)})


@app.get("/catalog")
async def get_catalog(_token: str = Depends(auth.verify_token)):
    try:
        tables = catalog.get_catalog()
    except catalog.CatalogError as exc:
        hint = str(exc) if _is_dev() else None
        return _error_response(500, "CATALOG_ERROR", exc.args[0], hint)

    return JSONResponse({"tables": tables})


@app.post("/refresh-catalog")
async def refresh_catalog(_token: str = Depends(auth.verify_token)):
    try:
        tables = catalog.refresh_catalog()
    except catalog.CatalogError as exc:
        hint = str(exc) if _is_dev() else None
        return _error_response(500, "CATALOG_ERROR", exc.args[0], hint)

    return JSONResponse({"status": "ok", "message": "Catalog refreshed", "tables": tables})


def _rows_to_csv(rows: list[dict]) -> str:
    if not rows:
        return ""

    headers = list(rows[0].keys())
    lines = [",".join(_escape_csv(value) for value in headers)]

    for row in rows:
        lines.append(",".join(_escape_csv(row.get(header)) for header in headers))

    return "\n".join(lines)


def _escape_csv(value: Any) -> str:
    if value is None:
        return ""

    text = str(value)
    if any(ch in text for ch in [",", "\n", "\r", '"']):
        return '"' + text.replace('"', '""') + '"'
    return text
