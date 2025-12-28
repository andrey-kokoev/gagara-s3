import { describe, it, expect } from "vitest"
import { apiJson } from "../helpers/api"

describe("e2e/large-results", () => {
  it("returns rows for a larger limit", async () => {
    const { res: catalogRes, data: catalog } = await apiJson("/catalog", { method: "GET" })
    const tables = Object.keys(catalog.tables || {})
    expect(tables.length).toBeGreaterThan(0)

    const table = tables[0]
    const { res, data } = await apiJson(`/query?format=json`, {
      method: "POST",
      body: JSON.stringify({ sql: `SELECT * FROM "${table}" LIMIT 10` })
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(data.data)).toBe(true)
  })
})
