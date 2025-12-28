import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"
import { pickFixtureTable } from "../../helpers/catalog"

describe("integration/server/catalog-engine", () => {
  it("registers catalog tables for querying", async () => {
    const { res: catalogRes, data: catalog } = await apiJson("/catalog", { method: "GET" })
    const tables = Object.keys(catalog.tables || {})
    expect(catalogRes.status).toBe(200)
    expect(tables.length).toBeGreaterThan(0)

    const table = pickFixtureTable(catalog)
    const { res, data } = await apiJson(`/query?format=json`, {
      method: "POST",
      body: JSON.stringify({ sql: `SELECT * FROM "${table}" LIMIT 1` })
    })
    expect(res.status).toBe(200)
    expect(data).toHaveProperty("data")
  })
})
