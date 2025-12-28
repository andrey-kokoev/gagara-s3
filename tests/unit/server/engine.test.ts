import { describe, it, expect } from "vitest"
import { readText } from "../../helpers/fs"

describe("server/engine", () => {
  it("configures duckdb httpfs and creates views", () => {
    const source = readText("packages/server/app/engine.py")
    expect(source).toContain("duckdb")
    expect(source).toContain("httpfs")
    expect(source).toContain("CREATE VIEW")
  })
})
