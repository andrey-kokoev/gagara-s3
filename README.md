# gagara-s3
SQL-over-S3

## Table of Contents

- [What it does](#what-it-does)
- [What it builds upon](#what-it-builds-upon)
- [What it consists of](#what-it-consists-of)
- [How It Works](#how-it-works)
- [Query Capabilities](#query-capabilities)
- [Authentication](#authentication)
- [Result Formats](#result-formats)
- [Error Handling](#error-handling)
- [Codebase Blueprint](#codebase-blueprint)
  - [Project Structure](#project-structure)
  - [Core Components](#core-components)
    - [1. Server (FastAPI)](#1-server-fastapi)
    - [2. Catalog System](#2-catalog-system)
    - [3. TypeScript Client](#3-typescript-client)
    - [4. UI Features](#4-ui-features)
  - [Development Workflow](#development-workflow)
  - [Key Implementation Details](#key-implementation-details)
- [Testing](#testing)

## What it does
gagara-s3 is a **self-hosted SQL query engine** that allows developers to run SQL queries against parquet and csv objects stored in S3. It's deployed as a FastAPI container and supports datalake-type table catalogues, enabling developers to query and integrate S3 data into their applications. 

## What it builds upon
- https://github.com/andrey-kokoev/openhub/packages/examples/cf-hono-vite

## What it consists of
- **server**: FastAPI service that exposes HTTP API for running SQL queries against S3 objects (deployable via container)
- **tsclient**: TypeScript client library for developers to integrate query capabilities into their applications
- **ui**: Web UI for running SQL queries against S3 objects using the tsclient library

## How It Works
Developers define a table catalog as a JSON file stored in S3. The `.env` file references the catalog location via `GAGARA_S3_DEFAULT_CATALOG`. At service startup, the catalog is loaded and cached in memory. The TypeScript client sends queries to the FastAPI service, which validates the request token, executes the query against S3 objects via DuckDB, and returns results in the requested format.

## Query Capabilities
- Supports any SQL query that DuckDB executes at runtime
- **Read-only**: SELECT queries only—no INSERT, UPDATE, or DELETE operations
- Full DuckDB feature set including subqueries, CTEs, window functions, aggregations, and JOINs across S3 tables

## Authentication
- **Token-based**: Server stores `GAGARA_S3_SERVICE_TOKEN` in `.env`
- **Request header**: Clients must include token in every request via `Authorization: Bearer <token>` header
- Missing or invalid token returns `401 Unauthorized`

## Result Formats
- Developers specify format at request time via query parameter: `?format=json|csv`
- Supported formats: **JSON** (array of objects), **CSV** (plain text with headers)
- Default format: `json`
- Note: Parquet is not supported for client responses (server-side only)

## Error Handling
- Standard HTTP status codes (200, 400, 401, 500, etc.)
- Errors returned as JSON responses with descriptive messages
- Query errors (parse, execution) from DuckDB are surfaced directly to help developers debug

---

# Codebase Blueprint

## Project Structure
```
gagara-s3/
├── packages/
│   ├── server/                    # FastAPI service
│   │   ├── app/
│   │   │   ├── main.py           # FastAPI entry point
│   │   │   ├── config.py         # Env loading + settings
│   │   │   ├── auth.py           # Token validation dependency
│   │   │   ├── catalog.py        # Load/cache catalog from S3
│   │   │   ├── engine.py         # DuckDB query executor
│   │   │   └── models.py         # Pydantic models
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── client/                    # TypeScript Client Library
│   │   ├── src/
│   │   │   ├── index.ts          # Public exports
│   │   │   ├── client.ts         # HTTP client class
│   │   │   ├── types.ts          # Shared types (request/response)
│   │   │   └── utils/
│   │   │       └── errors.ts     # Error handling
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/                        # Web UI
│       ├── src/
│       │   ├── index.html        # Web app entry
│       │   ├── main.ts           # Vue app entry
│       │   └── App.vue           # Root component
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── tests/                         # Test suite (unit, integration, E2E)
│   ├── unit/
│   │   ├── server/
│   │   │   ├── auth.test.ts       # Token validation
│   │   │   ├── catalog.test.ts    # JSON parsing, S3 errors, empty catalogs
│   │   │   ├── engine.test.ts     # DuckDB per-request, S3 credential setup
│   │   │   ├── formats.test.ts    # JSON/CSV serialization
│   │   │   ├── handlers.test.ts   # Query handler, logging, truncation
│   │   │   └── errors.test.ts     # Error codes (AUTH, PARSE, EXECUTION, CATALOG, FORMAT, INTERNAL)
│   │   ├── client/
│   │   │   ├── client.test.ts     # HTTP client, catalog(), refreshCatalog(), network errors
│   │   │   └── types.test.ts      # Type safety, deserialization
│   │   └── ui/
│   │       ├── editor.test.ts     # Syntax highlighting, input capture
│   │       ├── results.test.ts    # Table rendering, CSV export
│   │       ├── catalog.test.ts    # Catalog browser, empty catalogs
│   │       └── init.test.ts       # VITE_* env var initialization
│   │
│   ├── integration/
│   │   ├── server/
│   │   │   ├── catalog-engine.test.ts    # Catalog loading → DuckDB table registration
│   │   │   ├── auth-handler.test.ts      # Token validation in request flow
│   │   │   ├── query-flow.test.ts        # Full query pipeline + logging
│   │   │   └── catalog-endpoints.test.ts # GET /catalog, POST /refresh-catalog
│   │   └── api/
│   │       ├── happy-path.test.ts        # Valid query → 200 response
│   │       ├── auth-errors.test.ts       # 401 AUTH_ERROR
│   │       ├── query-errors.test.ts      # PARSE_ERROR, EXECUTION_ERROR, FORMAT_ERROR, INTERNAL_ERROR
│   │       ├── catalog-errors.test.ts    # 500 CATALOG_ERROR (S3 access, malformed JSON)
│   │       └── formats.test.ts           # JSON/CSV roundtrip, dev vs. prod error format
│   │
│   ├── e2e/
│   │   ├── basic-query.test.ts           # SELECT query, format selection, results display
│   │   ├── joins.test.ts                 # Multi-table joins, aggregations
│   │   ├── error-handling.test.ts        # All error codes end-to-end
│   │   ├── catalog-refresh.test.ts       # Refresh catalog workflow
│   │   ├── large-results.test.ts         # 100k+ rows, CSV export boundary
│   │   └── large-catalog.test.ts         # 1000+ tables, catalog boundary
│   │
│   └── fixtures/
│       ├── catalog.json                  # Sample catalog
│       ├── catalog-empty.json            # No tables (edge case)
│       ├── catalog-large.json            # Large catalog fixture
│       └── sample-data.csv               # Test data
│
├── .env.example                   # Example environment variables
├── pnpm-workspace.yaml            # Monorepo workspace config
├── tsconfig.json                  # Root TypeScript config
├── vitest.config.ts               # Unit/integration test config
├── playwright.config.ts           # E2E test config
├── package.json                   # Root package (workspaces)
├── README.md
├── IMPLEMENTATION.md
└── TESTS.md
```

## Core Components

### 1. Server (FastAPI)

**`POST /query?format=json|csv`**

Request:
```json
{
  "sql": "SELECT * FROM my_table WHERE id > 100"
}
```

Headers:
```
Authorization: Bearer <GAGARA_S3_SERVICE_TOKEN>
Content-Type: application/json
```

**Response (200 — JSON):**
```json
{
  "data": [{"id": 101, "name": "Alice"}, ...],
  "format": "json",
  "rowCount": 42
}
```

**Response (200 — CSV):**
```
id,name
101,Alice
102,Bob
```

**Response (400):**
```json
{
  "error": "Parse error: syntax error near 'SELEC'",
  "code": "PARSE_ERROR"
}
```

**Response (401):**
```json
{
  "error": "Unauthorized",
  "code": "AUTH_ERROR"
}
```

**`GET /catalog`**

Fetch the current table catalog.

Headers:
```
Authorization: Bearer <GAGARA_S3_SERVICE_TOKEN>
```

Response (200):
```json
{
  "tables": {
    "my_table": "s3://bucket/data/my_table.parquet",
    "users": "s3://bucket/data/users.csv"
  }
}
```

**`POST /refresh-catalog`**

Refresh the cached catalog from S3 (without redeploying the service).

Headers:
```
Authorization: Bearer <GAGARA_S3_SERVICE_TOKEN>
```

Response (200):
```json
{
  "status": "ok",
  "message": "Catalog refreshed",
  "tables": {...}
}
```

### 2. Catalog System

**`.env` structure:**
```env
GAGARA_S3_SERVICE_TOKEN="your-secret-token"
GAGARA_S3_BUCKET="your-bucket"
GAGARA_S3_ACCESS_KEY_ID="..."
GAGARA_S3_SECRET_ACCESS_KEY="..."
GAGARA_S3_ENDPOINT_URL="..."
GAGARA_S3_DEFAULT_CATALOG="catalogues/catalog.json"
```

**`catalogues/catalog.json` (in S3):**
```json
{
  "tables": {
    "my_table": "s3://bucket/data/my_table.parquet",
    "users": "s3://bucket/data/users.csv",
    "events": "s3://bucket/data/events.parquet"
  }
}
```

**Notes:**
- Table names (keys) become queryable table aliases in SQL
- Paths (values) are exact S3 object URIs (no glob patterns; one file per table)
- Paths can reference different buckets or endpoints
- File type (parquet/csv) is auto-detected by DuckDB

### 3. TypeScript Client

```typescript
import { GagaraS3Client } from "gagara-s3-client"

const client = new GagaraS3Client({
  baseUrl: "https://your-worker.example.com",
  token: "your-GAGARA_S3_SERVICE_TOKEN"
})

// Query with format
const result = await client.query({
  sql: "SELECT * FROM my_table",
  format: "json" // or "csv" (default: "json")
})

// result.data is typed array of objects
console.log(result.data)

// Fetch catalog
const catalog = await client.catalog()
console.log(catalog.tables)
```

**Client responsibility:** Includes token in `Authorization: Bearer` header for all requests.

### 4. UI Features

- SQL editor with syntax highlighting
- Result viewer (table, grid, or raw)
- Export options (CSV, JSON download)
- Catalog browser (list available tables)
- UI build uses a Vite alias so `@gagara-s3/client` resolves to `packages/client/src` (no separate client build needed)

## Development Workflow

1. **Local setup**: `pnpm install` (client + UI)
2. **Configuration**: Create `.env` with S3 credentials & catalog
3. **Dev mode (server)**: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` from `packages/server`
4. **Build**: `pnpm build` (client lib + UI)
5. **Deploy**: Build/push container from `packages/server/Dockerfile`

## Key Implementation Details

- **Auth**: Every request validates `Authorization` header token against `GAGARA_S3_SERVICE_TOKEN` (from `.env`)
- **Catalog**: Loaded from S3 on service startup and cached in memory; can be refreshed via `POST /refresh-catalog` without redeployment
- **DuckDB**: Executes inside the FastAPI container; mounts S3 objects and runs queries in-process
- **Formats**: Result transformation (JSON/CSV) happens in handler based on `format` query parameter
- **Error boundaries**: Parse/execution errors from DuckDB are surfaced as JSON with error code and message

---

## Testing

See [TESTS.md](TESTS.md) for comprehensive test strategy, including unit, integration, and E2E test coverage organized by component interaction boundaries.
