# Implementation Guide

This document provides concrete technical decisions to guide development. Refer to this when building components.

---

## Technology Stack

### Server (FastAPI Container)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **HTTP Framework** | FastAPI | Simple, fast async API framework |
| **DuckDB** | `duckdb` (Python) | Native DuckDB engine for container runtime |
| **S3 Client** | `boto3` | Standard, supports custom endpoints (R2, MinIO) |
| **Package Structure** | Monorepo (pnpm workspace) | Server + client in single repo, shared types |
| **Container** | Docker | Standard container deployment |
| **Python** | 3.11+ | Modern runtime with good performance |

### Client Library

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **HTTP Client** | `fetch` API | Built-in, no dependencies, modern |
| **Result Formats** | JSON, CSV (server-side only) | No Parquet on client; client gets JSON or CSV |
| **CSV Parsing** | PapaParse | Robust CSV parsing with edge case handling |
| **Build** | Vite + TypeScript | Tree-shakeable, modern tooling |
| **Distribution** | npm package | Standalone, importable |

### UI

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Vue 3 | Lightweight, reactive, good TypeScript support |
| **Build** | Vite | Fast, dev/prod builds |
| **Styling** | Scoped styles in `App.vue` | Single-file component with scoped CSS |
| **Editor** | Textarea + syntax highlighting library (Highlight.js or Prism) | Minimal dependencies, simple |
| **Config** | Environment variables at build time | API URL and token set during build |

---

## Credentials & S3 Integration

### Credentials on Server

Store in environment variables (`.env` locally, container env in production):

```env
# .env (local development)
GAGARA_S3_BUCKET="my-bucket"
GAGARA_S3_REGION="auto"  # For R2, use "auto"; for AWS, use region like "us-east-1"
GAGARA_S3_ACCESS_KEY_ID="..."
GAGARA_S3_SECRET_ACCESS_KEY="..."
GAGARA_S3_ENDPOINT_URL="https://my-endpoint.r2.cloudflarestorage.com"  # Optional; defaults to AWS
GAGARA_S3_DIR="gagara-s3"
GAGARA_S3_DEFAULT_CATALOG="catalogues/catalog.json"
GAGARA_S3_SERVICE_TOKEN="your-secret-token"
```

### Accessing S3 from Server

1. **Read catalog** (on server startup):
   ```python
   import boto3
   import json

   client = boto3.client(
       "s3",
       region_name=os.getenv("GAGARA_S3_REGION"),
       endpoint_url=os.getenv("GAGARA_S3_ENDPOINT_URL"),
       aws_access_key_id=os.getenv("GAGARA_S3_ACCESS_KEY_ID"),
       aws_secret_access_key=os.getenv("GAGARA_S3_SECRET_ACCESS_KEY"),
   )

   key = os.getenv("GAGARA_S3_DEFAULT_CATALOG")
   prefix = (os.getenv("GAGARA_S3_DIR") or "").strip("/")
   if prefix:
       key = f"{prefix}/{key.lstrip('/')}"
   response = client.get_object(
       Bucket=os.getenv("GAGARA_S3_BUCKET"),
       Key=key,
   )
   catalog_json = json.loads(response["Body"].read().decode("utf-8"))
   ```

2. **DuckDB instantiation (per-request)**:
   - Create a fresh DuckDB connection for each query request
   - Set S3 credentials before querying:
   ```python
   import duckdb

   def execute_query(sql: str, tables: dict[str, str]) -> list[dict]:
       con = duckdb.connect(database=":memory:")
       con.execute("INSTALL httpfs")
       con.execute("LOAD httpfs")
       con.execute(f"SET s3_region='{os.getenv('GAGARA_S3_REGION')}'")
       con.execute(f"SET s3_access_key_id='{os.getenv('GAGARA_S3_ACCESS_KEY_ID')}'")
       con.execute(f"SET s3_secret_access_key='{os.getenv('GAGARA_S3_SECRET_ACCESS_KEY')}'")
       if os.getenv("GAGARA_S3_ENDPOINT_URL"):
           con.execute(f"SET s3_endpoint='{os.getenv('GAGARA_S3_ENDPOINT_URL')}'")
           con.execute("SET s3_url_style='path'")
       for alias, s3_path in tables.items():
           con.execute(f"CREATE VIEW \"{alias}\" AS SELECT * FROM '{s3_path}'")
       cursor = con.execute(sql)
       columns = [col[0] for col in cursor.description]
       rows = cursor.fetchall()
       return [dict(zip(columns, row)) for row in rows]
   ```

### Design Decision

- **Per-request DuckDB**: Simpler isolation, no shared state between requests, easier cleanup
- **Credentials on server, not client**: S3 credentials never exposed to client
- **Server retrieves catalog at startup**: Catalog cached in memory, refreshed via `POST /refresh-catalog`

---

## TypeScript Client

### Request/Response Types

```typescript
// Request
interface QueryRequest {
  sql: string
}

// Response (200)
interface QueryResponse {
  data: unknown[] // Array of objects for JSON; string for CSV
  format: "json" | "csv"
  rowCount: number
}

// Error Response
interface ErrorResponse {
  error: string
  code: string
}

// Catalog Response
interface CatalogResponse {
  tables: Record<string, string> // { "table_name": "s3://bucket/path.parquet" }
}
```

### Client Class

```typescript
export class GagaraClient {
  constructor(options: {
    baseUrl: string
    token: string
  }) { ... }

  async query<T = Record<string, unknown>>(options: {
    sql: string
    format?: "json" | "csv"
  }): Promise<{
    data: T[]
    format: string
    rowCount: number
  }> { ... }

  async getCatalog(): Promise<Record<string, string>> { ... }

  async refreshCatalog(): Promise<Record<string, string>> { ... }

  async addCatalogTable(name: string, path: string): Promise<Record<string, string>> { ... }

  async deleteCatalogTable(name: string): Promise<Record<string, string>> { ... }
}
```

### Format Deserialization

1. **JSON** (native):
   - `response.json()` → array of objects
   - Type narrowing left to caller

2. **CSV** (plain text):
   ```typescript
   const text = await response.text()
   const rows = text.split('\n').map(line => line.split(','))
   // Or use PapaParse for robust parsing:
   import Papa from "papaparse"
   const { data } = Papa.parse(text, { header: true })
   ```

**Note:** Parquet format is not supported on client. Server response format is limited to JSON or CSV.

### Error Handling

```typescript
class GagaraS3Error extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message)
  }
}

// Subclasses
class AuthError extends GagaraS3Error { }
class ParseError extends GagaraS3Error { }
class ExecutionError extends GagaraS3Error { }
class NetworkError extends GagaraS3Error { }
```

---

## Development Workflow

### Local Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure `.env`**:
   ```env
   # Server (.env)
   GAGARA_S3_BUCKET="test-bucket"
   GAGARA_S3_REGION="auto"
   GAGARA_S3_ACCESS_KEY_ID="test-key"
   GAGARA_S3_SECRET_ACCESS_KEY="test-secret"
   GAGARA_S3_ENDPOINT_URL="https://test.r2.cloudflarestorage.com"
   GAGARA_S3_DIR="gagara-s3"
   GAGARA_S3_DEFAULT_CATALOG="catalogues/catalog.json"
   GAGARA_S3_SERVICE_TOKEN="test-token"
   
   # UI (.env for dev)
   GAGARA_S3_SERVER_URL="http://localhost:8000"
   GAGARA_S3_SERVICE_TOKEN="test-token"
   ```

3. **Start server locally**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   Server runs on `http://localhost:8000`

4. **Start UI dev server**:
   ```bash
   pnpm run dev:ui
   ```
   UI runs on `http://localhost:5173`

### Testing Strategy

**Unit Tests** (Vitest):
- Server: Mock S3 client, test auth/catalog/DuckDB integration
- Client: Mock fetch, test request/response handling
- UI: Mock client, test component interactions

**Integration Tests** (Vitest + test fixtures):
- Real DuckDB in-memory, mock S3
- Full query flow (catalog → DuckDB → format → response)

**E2E Tests** (Playwright):
- Real server (local), real UI
- Real S3 test bucket (accept latency/cost for realism)

**Mocking S3 Locally**:
- Use real S3 test bucket for dev (no local mock needed)

### Building & Publishing

**Full build** (all packages):
```bash
pnpm build
# Builds server, client, and UI
```

**Client Library** (standalone npm package):
```bash
pnpm --filter @gagara-s3/client build
# Output: packages/client/dist/
# To publish: cd packages/client && pnpm publish
```

**Server (FastAPI container)**:
```bash
docker build -t gagara-s3-server packages/server
```

**UI** (static assets):
```bash
pnpm --filter @gagara-s3/ui build
# Output: packages/ui/dist/ (HTML + JS + CSS)
# Can be hosted separately or behind a reverse proxy with the API
```

**Environment variables for builds:**
- **Server**: `.env` contains S3 credentials and token (container env in production)
- **UI**: `GAGARA_*` env vars for server URL, with token optionally provided at runtime via localStorage
  ```bash
  # Build UI for production
  GAGARA_S3_SERVER_URL="https://your-api.example.com" \
  pnpm --filter @gagara-s3/ui build
  ```

---

## Error Handling

### Error Codes

| Code | HTTP | Meaning | Example |
|------|------|---------|---------|
| `AUTH_ERROR` | 401 | Invalid/missing token | Token expired or wrong |
| `PARSE_ERROR` | 400 | SQL syntax error | `SELEC * FROM...` |
| `EXECUTION_ERROR` | 400 | Query runtime error | Table not found, type mismatch |
| `CATALOG_ERROR` | 500 | Failed to load catalog | S3 access denied, malformed JSON |
| `FORMAT_ERROR` | 400 | Invalid format parameter | `?format=xml` |
| `INTERNAL_ERROR` | 500 | Unexpected server error | DuckDB crash, unknown |
| `CATALOG_ERROR` | 500 | Catalog read/write error | Missing catalog, S3 error |

### Error Response Format

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": {
    "hint": "Optional hint for debugging"
  }
}
```

### Development vs. Production

- **Dev**: Include DuckDB error stack traces in `details.hint`
- **Prod**: Hide implementation details; log server-side only

---

## Performance & Constraints

### Limits (Container-safe)

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| **Query timeout** | No hard limit | Let infrastructure enforce (reverse proxy, orchestration) |
| **Max result size** | 100 MB | Tune via proxy/app limits |
| **Max rows returned** | Unlimited | Trust DuckDB to handle memory |
| **Catalog size** | 10 MB | Cache in memory |
| **Concurrent queries** | Configurable | Controlled by container CPU/worker count |

### Optimizations

1. **Catalog caching**: Loaded once, refreshed on demand
2. **Streaming results**: For large datasets, return paginated results (optional future)
3. **Query compilation**: DuckDB caches prepared statements
4. **S3 object metadata**: Cache headers (ETags) to skip redundant reads

### Monitoring/Logging

- Log to console (development & production)
- Include: query (truncated to 500 chars), execution time, errors
- Do not log sensitive data (credentials, tokens)

---

## Directory Structure (to build out)

```
gagara-s3/
├── packages/
│   ├── server/
│   │   ├── app/
│   │   │   ├── main.py            # FastAPI entry point
│   │   │   ├── config.py          # Env loading + settings
│   │   │   ├── auth.py            # Token validation
│   │   │   ├── catalog.py         # Load & cache catalog
│   │   │   ├── engine.py          # DuckDB executor (per-request)
│   │   │   └── models.py          # Pydantic models
│   │   ├── Dockerfile             # Container build
│   │   └── requirements.txt
│   ├── client/
│   │   ├── src/
│   │   │   ├── index.ts           # Exports
│   │   │   ├── client.ts          # Main class
│   │   │   ├── errors.ts          # Error classes
│   │   │   ├── formats.ts         # JSON/CSV parsers
│   │   │   └── types.ts           # Types
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/
│       ├── src/
│       │   ├── index.html
│       │   ├── main.ts            # Vue app entry
│       │   ├── App.vue            # Root component
│       │   ├── App.vue            # Single-file UI
│       │   └── main.ts            # Vue app entry
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
├── tests/
│   ├── unit/
│   │   ├── server/
│   │   ├── client/
│   │   └── ui/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── .env.example
├── .env.local (gitignored)
├── pnpm-workspace.yaml
├── tsconfig.json (root)
├── vitest.config.ts
├── playwright.config.ts
├── README.md
├── IMPLEMENTATION.md
└── TESTS.md
```

---

## Decision Log

**Why textarea + syntax highlighting?**
- Minimal dependencies
- Sufficient for SQL editor use case
- Faster load time

**Why no Parquet client support?**
- Reduces bundle size significantly
- JSON and CSV cover most use cases
- Simplifies data format handling in client
- Server still supports all formats internally

**Why real S3 bucket for testing?**
- Most realistic test environment
- No extra mock infrastructure
- Accept cost/latency tradeoff for correctness

**Why no hard query timeout?**
- Simpler implementation
- Infrastructure can enforce CPU/time limits (proxy/orchestrator)
- User can observe timeout naturally

**Why console logging only?**
- Simpler, no external service dependency
- Container logs go to stdout/stderr
- Sufficient for debugging

**Why per-request DuckDB?**
- Isolation: no state leaks between requests
- Simpler cleanup: garbage collection after each request
- Memory safety: no accumulation over time
- Trade-off: slight overhead per request, acceptable for use case

**Why UI config via environment variables?**
- Simpler deployment: bake config at build time
- No runtime token/URL exposure
- Works well with containerized deployments and standard reverse proxies
- Production: different env vars per environment
