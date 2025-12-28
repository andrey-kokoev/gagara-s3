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
})
