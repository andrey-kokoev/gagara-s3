import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

describe("ui/results", () => {
  beforeEach(() => {
    Object.assign(import.meta.env, {
      GAGARA_S3_SERVER_URL: "http://localhost:8000",
      GAGARA_S3_SERVICE_TOKEN: "token"
    })
    global.URL.createObjectURL = vi.fn(() => "blob:fake")
    global.URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  it("displays table from JSON result", async () => {
    global.fetch = vi.fn(async (url: RequestInfo) => {
      if (String(url).includes("/query")) {
        return jsonResponse({
          data: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" }
          ],
          format: "json",
          rowCount: 2
        })
      }
      return jsonResponse({ tables: {} })
    })

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await wrapper.get("[data-testid=\"run-query\"]").trigger("click")
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll("th").map((node) => node.text())).toEqual(["id", "name"])
    expect(wrapper.text()).toContain("Alice")
  })

  it("provides CSV download links", async () => {
    global.fetch = vi.fn(async (url: RequestInfo) => {
      if (String(url).includes("/query")) {
        return jsonResponse({
          data: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" }
          ],
          format: "json",
          rowCount: 2
        })
      }
      return jsonResponse({ tables: {} })
    })

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await wrapper.get("[data-testid=\"run-query\"]").trigger("click")
    await flushPromises()
    await wrapper.get(".results .ghost").trigger("click")

    expect(global.URL.createObjectURL).toHaveBeenCalledOnce()
  })
})
