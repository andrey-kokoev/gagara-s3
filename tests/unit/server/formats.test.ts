import { describe, it, expect } from "vitest"
import { readText } from "../../helpers/fs"

describe("server/formats", () => {
  it("includes CSV serialization helper", () => {
    const source = readText("packages/server/app/main.py")
    expect(source).toContain("_rows_to_csv")
    expect(source).toContain("_escape_csv")
  })
})
