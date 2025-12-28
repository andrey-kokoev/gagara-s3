import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/api/catalog-errors", () => {
  it("returns catalog data shape", async () => {
    const { res, data } = await apiJson("/catalog", { method: "GET" })
    expect(res.status).toBe(200)
    expect(data).toHaveProperty("tables")
  })
})
