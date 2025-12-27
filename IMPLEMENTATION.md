# Implementation Guide

This document provides concrete technical decisions to guide development. Refer to this when building components.

---

## Technology Stack

### Server (Cloudflare Worker)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **HTTP Framework** | Hono | Lightweight, Cloudflare-optimized, good TypeScript support |
| **DuckDB** | `@duckdb/wasm` | Browser/Worker-compatible, streaming support |
| **S3 Client** | AWS SDK v3 (`@aws-sdk/client-s3`) | Standard, supports custom endpoints (R2, MinIO) |
| **Package Structure** | Monorepo (pnpm workspace) | Server + client in single repo, shared types |
| **Bundler** | Wrangler (built-in) | Native Cloudflare Workers tooling |
| **TypeScript** | Latest stable | Strict mode enabled |

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
| **Styling** | CSS modules | Scoped, maintainable |
| **Editor** | Textarea + syntax highlighting library (Highlight.js or Prism) | Minimal dependencies, simple |
| **Config** | Environment variables at build time | Worker URL and token set during build |

---

## Credentials & S3 Integration

### Credentials on Worker

Store in Cloudflare Workers secrets (`.env` locally, environment in production):

```env
# .env (local development)
GAGARA_S3_BUCKET="my-bucket"
GAGARA_S3_REGION="auto"  # For R2, use "auto"; for AWS, use region like "us-east-1"
GAGARA_S3_ACCESS_KEY_ID="..."
GAGARA_S3_SECRET_ACCESS_KEY="..."
GAGARA_S3_ENDPOINT_URL="https://my-endpoint.r2.cloudflarestorage.com"  # Optional; defaults to AWS
GAGARA_S3_DEFAULT_CATALOG="catalogues/catalog.json"
GAGARA_S3_SERVICE_TOKEN="your-secret-token"
```

### Accessing S3 from Worker

1. **Read catalog** (on Worker startup):
   ```typescript
   import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
   
   const s3 = new S3Client({
     region: process.env.GAGARA_S3_REGION,
     credentials: {
       accessKeyId: process.env.GAGARA_S3_ACCESS_KEY_ID,
       secretAccessKey: process.env.GAGARA_S3_SECRET_ACCESS_KEY,
     },
     endpoint: process.env.GAGARA_S3_ENDPOINT_URL, // Optional
   })
   
   const catalogPath = process.env.GAGARA_S3_DEFAULT_CATALOG
   const catalogBuf = await s3.send(
     new GetObjectCommand({ Bucket: process.env.GAGARA_S3_BUCKET, Key: catalogPath })
   )
   const catalogJson = JSON.parse(await catalogBuf.Body.transformToString())
   ```

2. **DuckDB instantiation (per-request)**:
   - Create a fresh DuckDB instance for each query request
   - Set S3 credentials before querying:
   ```typescript
   import * as duckdb from "@duckdb/wasm"
   
   async function executeQuery(sql: string, tables: Record<string, string>) {
     const db = new duckdb.Database()
     const conn = await db.connect()
     
     // Set S3 credentials for this query
     await conn.query(`
       SET secret = (
         TYPE S3,
         KEY_ID '${process.env.GAGARA_S3_ACCESS_KEY_ID}',
         SECRET '${process.env.GAGARA_S3_SECRET_ACCESS_KEY}',
         REGION '${process.env.GAGARA_S3_REGION}',
         ENDPOINT '${process.env.GAGARA_S3_ENDPOINT_URL || ""}'
       )
     `)
     
     // Register tables from catalog
     for (const [alias, s3Path] of Object.entries(tables)) {
       await conn.query(`CREATE VIEW ${alias} AS SELECT * FROM '${s3Path}'`)
     }
     
     // Execute user query
     const result = await conn.query(sql)
     return result
   }
   ```

### Design Decision

- **Per-request DuckDB**: Simpler isolation, no shared state between requests, easier cleanup
- **Credentials on Worker, not client**: S3 credentials never exposed to client
- **Worker retrieves catalog at startup**: Catalog cached in memory, refreshed via `POST /refresh-catalog`

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
export class GagaraS3Client {
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

  async catalog(): Promise<{ tables: Record<string, string> }> { ... }

  async refreshCatalog(): Promise<{ status: string; tables: Record<string, string> }> { ... }
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
   GAGARA_S3_DEFAULT_CATALOG="catalogues/catalog.json"
   GAGARA_S3_SERVICE_TOKEN="test-token"
   
   # UI (.env for dev)
   VITE_GAGARA_WORKER_URL="http://localhost:8787"
   VITE_GAGARA_SERVICE_TOKEN="test-token"
   ```

3. **Start Worker locally**:
   ```bash
   wrangler dev
   ```
   Server runs on `http://localhost:8787`

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
- Real Worker (local), real UI
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

**Server (Cloudflare Worker)**:
```bash
pnpm --filter @gagara-s3/server build
# Wrangler builds automatically via wrangler.toml
# Deploy: wrangler deploy
```

**UI** (static assets):
```bash
pnpm --filter @gagara-s3/ui build
# Output: packages/ui/dist/ (HTML + JS + CSS)
# Can be hosted separately or embedded in Worker
```

**Environment variables for builds:**
- **Server**: `.env` contains S3 credentials and token (Wrangler secrets in production)
- **UI**: `VITE_*` env vars baked into build (e.g., `VITE_GAGARA_WORKER_URL`)
  ```bash
  # Build UI for production
  VITE_GAGARA_WORKER_URL="https://your-worker.example.com" \
  VITE_GAGARA_SERVICE_TOKEN="your-token" \
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

### Limits (Worker-safe)

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| **Query timeout** | No hard limit | Let Cloudflare Workers enforce (30s CPU limit) |
| **Max result size** | 100 MB | Worker response limit |
| **Max rows returned** | Unlimited | Trust DuckDB to handle memory |
| **Catalog size** | 10 MB | Cache in memory |
| **Concurrent queries** | 1 per Worker instance | Single-threaded WASM |

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
│   │   ├── src/
│   │   │   ├── index.ts           # Hono app, routes
│   │   │   ├── auth.ts            # Token validation
│   │   │   ├── catalog.ts         # Load & cache catalog
│   │   │   ├── engine.ts          # DuckDB executor (per-request)
│   │   │   ├── formats/
│   │   │   │   ├── json.ts        # JSON serializer
│   │   │   │   └── csv.ts         # CSV serializer (plain text)
│   │   │   ├── errors.ts          # Error definitions
│   │   │   └── types.ts           # Shared types
│   │   ├── wrangler.toml          # Cloudflare config
│   │   ├── tsconfig.json
│   │   └── package.json
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
│       │   ├── components/
│       │   │   ├── Editor.vue     # SQL editor
│       │   │   ├── Results.vue    # Result viewer
│       │   │   └── Catalog.vue    # Catalog browser
│       │   ├── stores/
│       │   │   └── query.ts       # Query state (Pinia)
│       │   ├── styles/
│       │   │   └── *.css
│       │   └── types.ts
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
- Cloudflare Workers already enforce 30s CPU limit
- User can observe timeout naturally

**Why console logging only?**
- Simpler, no external service dependency
- Cloudflare logs console to dashboard
- Sufficient for debugging

**Why per-request DuckDB?**
- Isolation: no state leaks between requests
- Simpler cleanup: garbage collection after each request
- Memory safety: no accumulation over time
- Trade-off: slight overhead per request, acceptable for use case

**Why UI config via environment variables?**
- Simpler deployment: bake config at build time
- No runtime token/URL exposure
- Works well with Wrangler/Cloudflare Pages deployment
- Production: different env vars per environment
