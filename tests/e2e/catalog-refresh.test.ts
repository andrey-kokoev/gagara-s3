import { describe, it, expect } from "vitest"
import { apiJson } from "../helpers/api"

describe("e2e/catalog-refresh", () => {
  it("refresh endpoint responds", async () => {
    const { res, data } = await apiJson("/refresh-catalog", { method: "POST" })
    expect(res.status).toBe(200)
    expect(data.status).toBe("ok")
  })
})
