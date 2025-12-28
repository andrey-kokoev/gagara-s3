# Test Strategy

## Unit Tests (Component Internals)

### Server (API)

**Auth Module** (`packages/server/app/auth.py`)
1. Validate token matches `GAGARA_S3_SERVICE_TOKEN`
2. Reject missing/invalid tokens
3. Return structured auth error on failure

**Catalog Module** (`packages/server/app/catalog.py`)
1. Parse valid `catalog.json` from S3
2. Handle missing catalog file gracefully
3. Handle malformed JSON (invalid syntax)
4. Handle S3 access denied errors
5. Map table aliases to S3 paths correctly
6. Cache catalog on startup
7. Return empty object for empty catalog (no tables)

**DuckDB Engine** (`packages/server/app/engine.py`)
1. Execute SELECT query against mounted S3 parquet/csv
2. Set S3 credentials (KEY_ID, SECRET, REGION, ENDPOINT) before query
3. Return result rows as objects
4. Throw DuckDB parse errors (invalid SQL)
5. Throw DuckDB execution errors (missing table, type mismatch)
6. Handle timeout/resource limits
7. Verify per-request isolation (no state leaks between queries)

**Format Serializers** (`packages/server/app/main.py`)
1. JSON: convert rows to JSON array
2. CSV: convert rows to CSV plain text with headers
3. All: handle empty result sets
4. All: handle NULL values correctly

**Query Handler** (`packages/server/app/main.py`)
1. Extract & validate request body (sql, format, token)
2. Validate format parameter (json | csv only, reject invalid formats)
3. Call auth, catalog, engine, serializer in sequence
4. Return proper HTTP status codes (200, 400, 401, 500)
5. Return error messages in JSON format with `code` field

### Client Library

**HTTP Client** (`packages/client/src/client.ts`)
1. Build POST request with headers & body
2. Send to correct base URL with Authorization header
3. Parse 200 response (valid result)
4. Parse error responses (400, 401, 500)
5. Deserialize `data` field based on `format`
6. Throw typed errors (AuthError, ParseError, ExecutionError, NetworkError)
7. Handle network errors (fetch failures, timeouts)
8. Implement `getCatalog()` method → GET /catalog
9. Implement `refreshCatalog()` method → POST /refresh-catalog
10. Implement `addCatalogTable()` method → POST /catalog/tables
11. Implement `deleteCatalogTable()` method → DELETE /catalog/tables

**Types & Serialization** (`packages/client/src/types.ts`)
1. Request structure validation (type narrowing)
2. Response deserialization for each format
3. Type safety for query options

### UI

**Editor Component** (`packages/ui/src/App.vue`)
1. Capture SQL input
2. Submit query on button click
3. Disable submit while loading
4. Show loading state
5. Apply syntax highlighting (Highlight.js or Prism)
6. Handle keyboard shortcuts (e.g., Ctrl+Enter to submit)

**Result Viewer** (`packages/ui/src/App.vue`)
1. Display table from JSON result
2. Handle empty results
3. Provide CSV download links
4. Show error messages

**Catalog Browser** (`packages/ui/src/App.vue`)
1. Fetch catalog via client `getCatalog()` method
2. Display table list (names from catalog)
3. Insert table name on click
4. Handle empty catalog gracefully (no tables)
5. Show loading state while fetching
6. Show error message on fetch failure
7. Add table entry via `addCatalogTable()` and delete via `deleteCatalogTable()`

---

## Test Setup (Integration + E2E)

1. `tests/setup.ts` loads `.env` and `packages/ui/.env`.
2. It ensures local fixtures exist at `fixtures/table_1/data.csv` and `fixtures/table_2/data.csv`.
3. It uploads those fixtures to S3 (if missing) and writes them into the catalog at `GAGARA_S3_DIR/GAGARA_S3_DEFAULT_CATALOG`.
4. Integration/E2E tests expect at least two catalog tables (`table_1`, `table_2`) to be present.

Required env vars for seeding:
- `GAGARA_S3_BUCKET`
- `GAGARA_S3_REGION`
- `GAGARA_S3_ENDPOINT_URL`
- `GAGARA_S3_ACCESS_KEY_ID`
- `GAGARA_S3_SECRET_ACCESS_KEY`
- `GAGARA_S3_DIR`
- `GAGARA_S3_DEFAULT_CATALOG`
- `GAGARA_S3_SERVER_URL`
- `GAGARA_S3_SERVICE_TOKEN`

## Integration Tests (Component Interactions)

### Server Internal Flow

**Catalog + DuckDB**
1. Load catalog → register tables in DuckDB
2. Query references table from catalog
3. Verify data returned matches S3 object
4. Verify S3 credentials (KEY_ID, SECRET, REGION) passed to DuckDB before query

**Catalog Endpoints**
1. GET /catalog → returns `{ tables: { "name": "s3://path" } }`
2. POST /refresh-catalog → reloads catalog from S3, returns updated tables
3. GET /catalog with invalid token → 401 AUTH_ERROR
4. POST /refresh-catalog with S3 access denied → 500 CATALOG_ERROR with "S3 access denied" message
5. GET /catalog with malformed catalog.json → 500 CATALOG_ERROR with "malformed JSON" message
6. POST /catalog/tables → adds entry, persists to S3
7. DELETE /catalog/tables → removes entry, persists to S3

**Auth + Query Handler**
1. Request with invalid token → 401 + error JSON
2. Request with valid token → proceeds to execution

**Query Handler + Engine + Serializer**
1. Valid SQL + format=json → JSON rows in 200 response
2. Valid SQL + format=csv → CSV string in 200 response
3. Invalid SQL → 400 PARSE_ERROR + DuckDB error message
4. Missing table in query → 400 EXECUTION_ERROR + "table not found" message
5. Invalid format parameter (e.g., format=xml) → 400 FORMAT_ERROR
6. DuckDB crash/unknown error → 500 INTERNAL_ERROR
7. Verify error response has `error` (message) and `code` fields
8. Dev mode: error includes `details.hint` with stack trace
9. Prod mode: error hides implementation details (stack trace omitted)

### Server ↔ Client API Contract

**Happy Path** (valid token, valid SQL)
1. Client builds request with token, SQL, format
2. Server validates token
3. Server executes query
4. Server serializes result
5. Client receives 200 + parsed data
6. Client returns typed result object

**Auth Failure**
1. Client sends invalid token
2. Server returns 401 + `{ error: "Unauthorized", code: "AUTH_ERROR" }`
3. Client throws `AuthError`

**Parse Error**
1. Client sends malformed SQL
2. Server returns 400 + `{ error: "... syntax error", code: "PARSE_ERROR" }`
3. Client throws `ParseError` with DuckDB message

**Format Error**
1. Client requests format=invalid
2. Server returns 400 + `{ error: "...", code: "FORMAT_ERROR" }`
3. Client throws error

**Catalog Error**
1. Catalog file missing/malformed on server startup
2. Server returns 500 + `{ error: "...", code: "CATALOG_ERROR" }`
3. Query fails immediately if catalog unavailable

**Internal Error**
1. Unexpected DuckDB crash or unknown error
2. Server returns 500 + `{ error: "...", code: "INTERNAL_ERROR" }`

**Network Error**
1. Client encounters network failure (fetch timeout, connection refused)
2. Client throws `NetworkError`

**Result Format Roundtrip** (each format)
1. JSON: rows → JSON array → client deserializes → typed array
2. CSV: rows → CSV text → client parses with PapaParse → typed array

### Client ↔ UI Integration

**Query Submission Flow**
1. User enters SQL in editor
2. User clicks submit
3. UI calls `client.query({ sql, format, token })`
4. UI shows loading state
5. Client returns results
6. UI displays table (JSON) or offers download (CSV)
7. Error bubbles up → UI shows error message

**Catalog Display**
1. UI initializes with `GAGARA_S3_SERVER_URL`, token from env or localStorage
2. UI calls `client.getCatalog()` to fetch table list
3. Client returns table list
4. UI renders clickable table names
5. Click inserts table name into editor
6. Error on fetch → UI shows error message
7. Empty catalog → UI shows "No tables" message
8. Add/delete actions update the catalog list

---

## End-to-End Tests (Full Stack)

**Scenario: Basic Query**
1. Start server with test catalog
2. UI loads in browser
3. User types: `SELECT id, name FROM users WHERE id > 5`
4. User selects format=JSON, clicks submit
5. Results display in table view
6. User downloads as CSV

**Scenario: Multi-Table Join**
1. Catalog has `users` and `events` tables
2. User writes: `SELECT u.name, COUNT(*) FROM users u JOIN events e ON u.id = e.user_id GROUP BY u.name`
3. Query executes
4. Results grouped correctly
5. Download as CSV works

**Scenario: Invalid Query**
1. User types: `SELECT * FROM nonexistent_table`
2. Submit
3. Error message displays: "Table 'nonexistent_table' not found"
4. Query remains in editor for editing

**Scenario: Auth Failure (UI + Server)**
1. Invalid/missing token in UI config
2. User submits query
3. Error: "Unauthorized" 
4. UI prompts for token

**Scenario: Large Result Export**
1. Query returns 100k rows
2. User selects format=csv
3. CSV download completes
4. File contains all rows (plain text, comma-separated)

**Scenario: Catalog Refresh**
1. Server loads initial catalog from S3
2. User refreshes catalog via UI (POST /refresh-catalog)
3. New tables appear in catalog list
4. User can query newly added tables

**Scenario: Large Catalog**
1. Catalog has 1000+ tables (10 MB max)
2. Server loads and caches catalog on startup
3. Catalog browser displays all tables (potentially paginated)
4. Queries against any table succeed

**Scenario: Format Error**
1. User submits request with invalid format parameter
2. Server returns 400 FORMAT_ERROR
3. UI shows error message

**Scenario: Empty Catalog**
1. Catalog file exists but contains no tables
2. Server starts successfully (empty catalog allowed)
3. UI shows "No tables" message
4. Any query fails with "table not found" (EXECUTION_ERROR)

---

## Test Tools & Setup

| Layer | Tool | Notes |
|-------|------|-------|
| **Server unit** | Vitest + mocks | Mock DuckDB, S3, query truncation, logging |
| **Server integration** | Vitest + test fixtures | Real DuckDB in-memory (per-request), mock S3, verify S3 credential setup |
| **API contract** | Vitest + HTTP mocks | Mock fetch, validate req/res, catalog endpoints, all error codes |
| **Client unit** | Vitest + HTTP mocks | Mock fetch responses, network errors, catalog/refresh methods |
| **UI unit** | Vitest + Vue test utils | Mount components, simulate clicks, test syntax highlighting, env var init |
| **UI → Client** | Vitest + mocks | Mock client methods, catalog display, error handling |
| **E2E** | Playwright | Real server (local), real UI, real S3 test bucket, large data boundaries |

---

## Test File Structure

```
gagara-s3/
├── tests/
│   ├── unit/
│   │   ├── server/
│   │   │   ├── auth.test.ts
│   │   │   ├── catalog.test.ts           # Catalog parsing, malformed JSON, S3 errors
│   │   │   ├── engine.test.ts            # DuckDB per-request, S3 credential setup
│   │   │   ├── formats.test.ts
│   │   │   ├── handlers.test.ts          # Query truncation, logging, all error codes
│   │   │   └── errors.test.ts            # Error codes and format (dev vs. prod)
│   │   ├── client/
│   │   │   ├── client.test.ts            # Network errors, catalog(), refreshCatalog()
│   │   │   └── types.test.ts
│   │   └── ui/
│   │       ├── editor.test.ts            # Syntax highlighting, keyboard shortcuts
│   │       ├── results.test.ts
│   │       ├── catalog.test.ts           # Empty catalog, env var init
│   │       └── init.test.ts              # VITE_* env var initialization
│   │
│   ├── integration/
│   │   ├── server/
│   │   │   ├── catalog-engine.test.ts    # S3 credential verification
│   │   │   ├── auth-handler.test.ts
│   │   │   ├── query-flow.test.ts        # Logging, query truncation
│   │   │   └── catalog-endpoints.test.ts # GET /catalog, POST /refresh-catalog
│   │   └── api/
│   │       ├── happy-path.test.ts
│   │       ├── auth-errors.test.ts
│   │       ├── query-errors.test.ts      # PARSE_ERROR, EXECUTION_ERROR, FORMAT_ERROR, INTERNAL_ERROR
│   │       ├── catalog-errors.test.ts    # CATALOG_ERROR scenarios
│   │       └── formats.test.ts
│   │
│   ├── e2e/
│   │   ├── basic-query.test.ts
│   │   ├── joins.test.ts
│   │   ├── error-handling.test.ts        # All error codes end-to-end
│   │   ├── catalog-refresh.test.ts       # Refresh catalog workflow
│   │   ├── large-results.test.ts         # 100k+ rows, CSV export
│   │   └── large-catalog.test.ts         # 1000+ tables, catalog boundary
│   │
│   └── fixtures/
│       ├── catalog.json
│       ├── catalog-empty.json
│       ├── catalog-large.json            # 1000+ tables for boundary testing
│       ├── sample-data.parquet
│       └── sample-data.csv
│
├── packages/
│   ├── server/
│   ├── client/
│   └── ui/
│
└── [root config files]
```
