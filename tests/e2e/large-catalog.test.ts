import { describe, it, expect } from "vitest"
import { apiJson } from "../helpers/api"

describe("e2e/large-catalog", () => {
  it("catalog response includes tables map", async () => {
    const { res, data } = await apiJson("/catalog", { method: "GET" })
    expect(res.status).toBe(200)
    expect(data).toHaveProperty("tables")
  })
})
