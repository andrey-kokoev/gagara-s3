import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/server/auth-handler", () => {
  it("rejects missing token", async () => {
    const { res, data } = await apiJson(
      "/catalog",
      { method: "GET" },
      { includeAuth: false }
    )
    expect(res.status).toBe(401)
    expect(data.code).toBe("AUTH_ERROR")
  })
})
