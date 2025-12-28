import { describe, it, expect } from "vitest"
import { readText } from "../../helpers/fs"

describe("server/handlers", () => {
  it("defines query and catalog endpoints", () => {
    const source = readText("packages/server/app/main.py")
    expect(source).toContain("@app.post(\"/query\")")
    expect(source).toContain("@app.get(\"/catalog\")")
    expect(source).toContain("@app.post(\"/refresh-catalog\")")
    expect(source).toContain("@app.post(\"/catalog/tables\")")
  })
})
