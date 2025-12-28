import { describe, it, expect } from "vitest"
import { readText } from "../../helpers/fs"

describe("server/errors", () => {
  it("mentions canonical error codes", () => {
    const source = readText("packages/server/app/main.py")
    expect(source).toContain("CATALOG_ERROR")
    expect(source).toContain("FORMAT_ERROR")
    expect(source).toContain("PARSE_ERROR")
    expect(source).toContain("EXECUTION_ERROR")
  })
})
