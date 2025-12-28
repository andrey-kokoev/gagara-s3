import { describe, it, expect } from "vitest"
import { apiJson } from "../helpers/api"

describe("e2e/joins", () => {
  it("catalog has multiple tables", async () => {
    const { res, data: catalog } = await apiJson("/catalog", { method: "GET" })
    const tables = Object.keys(catalog.tables || {})
    expect(res.status).toBe(200)
    expect(tables.length).toBeGreaterThan(1)
  })
})
