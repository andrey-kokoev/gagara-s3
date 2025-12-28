import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/server/catalog-endpoints", () => {
  it("refreshes catalog", async () => {
    const { res, data } = await apiJson("/refresh-catalog", { method: "POST" })
    expect(res.status).toBe(200)
    expect(data.status).toBe("ok")
  })
})
