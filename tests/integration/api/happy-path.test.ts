import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/api/happy-path", () => {
  it("queries first table", async () => {
    const { res: catalogRes, data: catalog } = await apiJson("/catalog", { method: "GET" })
    const tables = Object.keys(catalog.tables || {})
    expect(Array.isArray(tables)).toBe(true)
    expect(catalogRes.status).toBe(200)
    expect(tables.length).toBeGreaterThan(0)

    const table = tables[0]
    const { res, data } = await apiJson(`/query?format=json`, {
      method: "POST",
      body: JSON.stringify({ sql: `SELECT * FROM "${table}" LIMIT 1` })
    })
    expect(res.status).toBe(200)
    expect(data).toHaveProperty("data")
  })
})
