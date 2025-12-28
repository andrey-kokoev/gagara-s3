from urllib.parse import urlparse

import duckdb

from app import config


def _quote_identifier(value: str) -> str:
    escaped = value.replace('"', '""')
    return f'"{escaped}"'


def _escape_literal(value: str) -> str:
    return value.replace("'", "''")


def _configure_s3(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("INSTALL httpfs")
    conn.execute("LOAD httpfs")

    if not config.S3_ACCESS_KEY_ID or not config.S3_SECRET_ACCESS_KEY:
        return

    conn.execute(f"SET s3_region='{_escape_literal(config.S3_REGION)}'")
    conn.execute(f"SET s3_access_key_id='{_escape_literal(config.S3_ACCESS_KEY_ID)}'")
    conn.execute(f"SET s3_secret_access_key='{_escape_literal(config.S3_SECRET_ACCESS_KEY)}'")

    if config.S3_ENDPOINT_URL:
        parsed = urlparse(config.S3_ENDPOINT_URL)
        endpoint = parsed.netloc or parsed.path
        conn.execute(f"SET s3_endpoint='{_escape_literal(endpoint)}'")
        conn.execute("SET s3_url_style='path'")
        if parsed.scheme:
            conn.execute(f"SET s3_use_ssl={'true' if parsed.scheme == 'https' else 'false'}")


def _register_tables(conn: duckdb.DuckDBPyConnection, tables: dict[str, str]) -> None:
    for alias, s3_path in tables.items():
        view_name = _quote_identifier(alias)
        source = _escape_literal(s3_path)
        try:
            conn.execute(f"CREATE VIEW {view_name} AS SELECT * FROM '{source}'")
        except Exception:
            # Skip tables with invalid sources so other queries can proceed.
            continue


def execute_query(sql: str, tables: dict[str, str]) -> list[dict]:
    conn = duckdb.connect(database=":memory:")
    try:
        _configure_s3(conn)
        _register_tables(conn, tables)

        cursor = conn.execute(sql)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        conn.close()
