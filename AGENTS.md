# Gagara-S3 repository guidance

## Repository identity and authority

- This checkout is the standalone `andrey-kokoev/gagara-s3` repository.
- `andrey-kokoev/gagara` also contains a copy at `packages/gagara-s3`.
- Treat the standalone checkout as the service-focused implementation surface,
  but verify the Railway deployment source before production edits because the
  current Railway service metadata does not expose repository/root-directory
  provenance. Do not edit or deploy both copies by assumption.
- The production service is `t895.gagara-s3` at
  `https://gagara-s3.t895.sonar.cloud`.

## Scope

This repository is the SQL-over-S3 service. Its runtime catalog is an S3 JSON
object selected by `GAGARA_S3_DEFAULT_CATALOG` (and optionally `GAGARA_S3_DIR`),
not a repository file.

## Catalog safety

- `GET /catalog` is observational; `/refresh-catalog`, `POST /catalog/tables`,
  and `DELETE /catalog/tables` can affect catalog state.
- Treat an empty catalog as an incident, not as a successful synchronization.
- Before any production mutation, capture authenticated catalog output and the
  target S3 object identity; after mutation, verify required tables and run a
  representative query.
- Do not print or commit service tokens, S3 credentials, `.env` files, or raw
  secret-bearing request headers.

## Runtime contract and invariants

- The catalog is an S3 JSON object selected by `GAGARA_S3_DEFAULT_CATALOG` and
  optionally prefixed by `GAGARA_S3_DIR`; it is not repository data.
- Production-owned bindings are declared through
  `GAGARA_S3_REQUIRED_TABLES_JSON` and reconciled into the persisted catalog at
  startup and refresh. Required bindings take precedence over mutable entries.
- A production empty catalog is an incident when downstream consumers require
  tables such as `classes`. `/health` success does not establish catalog
  correctness.
- Every required catalog path must resolve to a readable S3 object, and a
  representative consumer query must succeed.

## Downstream diagnosis

Smart Scheduling (`D:\code\smart-scheduling`, published as
`global-maxima/cpy`) consumes this service through its server-side
`server/utils/gagaraS3.ts` adapter and `/api/gagara/query` endpoint, including
the `/analysis/scatter` path. For a reported failure, preserve the exact SQL,
read authenticated `/catalog`, verify the referenced S3 objects, and run the
same query directly before changing production state.

Railway HTTP logs show request metadata but may not show request bodies, direct
S3 writes, or events outside retention. Absence of a recorded mutation request
therefore does not prove that the catalog was never overwritten.

## Diagnosis and tests

- Check the catalog JSON, the referenced S3 objects, and the consumer query as
  one contract.
- Preserve upstream DuckDB/catalog errors in diagnostics.
- Use bounded logs and bounded test output. Add regression coverage for any
  discovered state transition or mutation path.
- Catalog-mutating tests must use an isolated service/catalog and must never
  target `gagara-s3.t895.sonar.cloud`.
