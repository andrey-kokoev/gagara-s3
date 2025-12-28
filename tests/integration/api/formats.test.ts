import { describe, it, expect } from "vitest"
import { apiJson, apiRequest } from "../../helpers/api"

describe("integration/api/formats", () => {
  it("returns CSV when requested", async () => {
    const { res: catalogRes, data: catalog } = await apiJson("/catalog", { method: "GET" })
    const tables = Object.keys(catalog.tables || {})
    expect(catalogRes.status).toBe(200)
    expect(tables.length).toBeGreaterThan(0)
    const table = tables[0]

    const res = await apiRequest(`/query?format=csv`, {
      method: "POST",
      body: JSON.stringify({ sql: `SELECT * FROM "${table}" LIMIT 1` })
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(typeof text).toBe("string")
  })
})
