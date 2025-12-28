import { describe, it, expect } from "vitest"
import { apiJson, apiRequest } from "../../helpers/api"

describe("integration/server/catalog-counts", () => {
  it("counts rows for every catalog table", async () => {
    const { res: catalogRes, data: catalog } = await apiJson("/catalog", { method: "GET" })
    const tables = Object.keys(catalog.tables || {})
    expect(catalogRes.status).toBe(200)
    expect(tables.length).toBeGreaterThan(0)

    const failures: string[] = []
    for (const table of tables) {
      const res = await apiRequest(`/query?format=json`, {
        method: "POST",
        body: JSON.stringify({ sql: `SELECT COUNT(*) AS row_count FROM "${table}"` })
      })
      if (!res.ok) {
        const text = await res.text()
        failures.push(`${table}: ${res.status} ${text}`)
        continue
      }
      const data = await res.json().catch(() => ({}))
      const rows = Array.isArray(data?.data) ? data.data : []
      if (rows.length === 0) {
        failures.push(`${table}: empty response`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`Catalog count failures:\n${failures.join("\n")}`)
    }
  })
})
