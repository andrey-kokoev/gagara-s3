import { describe, it, expect } from "vitest"
import { readJson, readText } from "../../helpers/fs"

describe("server/catalog", () => {
  it("parses catalog fixtures", () => {
    const catalog = readJson<{ tables: Record<string, string> }>("tests/fixtures/catalog.json")
    expect(Object.keys(catalog.tables).length).toBeGreaterThan(0)
  })

  it("uses boto3 to load catalog", () => {
    const source = readText("packages/server/app/catalog.py")
    expect(source).toContain("boto3")
    expect(source).toContain("get_object")
  })

  it("reconciles configured required tables into the persisted catalog", () => {
    const configSource = readText("packages/server/app/config.py")
    const catalogSource = readText("packages/server/app/catalog.py")
    expect(configSource).toContain("GAGARA_S3_REQUIRED_TABLES_JSON")
    expect(catalogSource).toContain("_reconcile_required_tables")
    expect(catalogSource).toContain("return _save_catalog(reconciled)")
  })

  it("forbids catalog-mutating tests against production", () => {
    const fixtureSource = readText("tests/fixtures.ts")
    expect(fixtureSource).toContain('hostname === "gagara-s3.t895.sonar.cloud"')
    expect(fixtureSource).toContain("Catalog-mutating tests cannot target production")
  })
})
