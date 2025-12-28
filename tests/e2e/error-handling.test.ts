import { describe, it, expect } from "vitest"
import { apiJson } from "../helpers/api"

describe("e2e/error-handling", () => {
  it("invalid SQL returns parse error", async () => {
    const { res, data } = await apiJson(`/query?format=json`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELEC * FROM" })
    })
    expect(res.status).toBe(400)
    expect(data.code).toBe("PARSE_ERROR")
  })
})
