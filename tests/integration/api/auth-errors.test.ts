import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/api/auth-errors", () => {
  it("returns 401 for invalid token", async () => {
    const { res, data } = await apiJson(
      "/catalog",
      {
        method: "GET",
        headers: { Authorization: "Bearer invalid" }
      },
      { includeAuth: false }
    )
    expect(res.status).toBe(401)
    expect(data.code).toBe("AUTH_ERROR")
  })
})
