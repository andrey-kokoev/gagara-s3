import { describe, it, expect } from "vitest"
import { apiJson } from "../../helpers/api"

describe("integration/server/catalog-endpoints", () => {
  it("refreshes catalog", async () => {
    const { res, data } = await apiJson("/refresh-catalog", { method: "POST" })
    expect(res.status).toBe(200)
    expect(data.status).toBe("ok")
  })

  it("adds and deletes a catalog table", async () => {
    const tableName = `temp_table_${Date.now()}`
    const tablePath = "fixtures/table_1/data.csv"

    await apiJson(
      "/catalog/tables",
      { method: "DELETE", body: JSON.stringify({ name: tableName }) }
    )

    const { res: addRes, data: addData } = await apiJson("/catalog/tables", {
      method: "POST",
      body: JSON.stringify({ name: tableName, path: tablePath })
    })
    expect(addRes.status).toBe(200)
    expect(addData.tables).toHaveProperty(tableName)

    const { res: deleteRes, data: deleteData } = await apiJson("/catalog/tables", {
      method: "DELETE",
      body: JSON.stringify({ name: tableName })
    })
    expect(deleteRes.status).toBe(200)
    expect(deleteData.tables).not.toHaveProperty(tableName)
  })
})
