import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/server/query-flow", () => {
  it("rejects invalid format", async () => {
    const { res, data } = await apiJson(`/query?format=xml`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT 1" })
    })
    expect(res.status).toBe(400)
    expect(data.code).toBe("FORMAT_ERROR")
  })
})
