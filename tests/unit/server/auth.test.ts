import { describe, it, expect } from "vitest"
import { readText } from "../../helpers/fs"

describe("server/auth", () => {
  it("expects a Bearer token header", () => {
    const source = readText("packages/server/app/auth.py")
    expect(source).toContain("Bearer")
    expect(source.toLowerCase()).toContain("authorization")
  })
})
