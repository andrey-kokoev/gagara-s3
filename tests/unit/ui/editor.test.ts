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

describe("ui/editor", () => {
  beforeEach(() => {
    Object.assign(import.meta.env, {
      GAGARA_S3_SERVER_URL: "http://localhost:8000",
      GAGARA_S3_SERVICE_TOKEN: "token"
    })
  })

  it("captures SQL input", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ tables: {} }))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)
    const textarea = wrapper.get("textarea")

    await textarea.setValue("SELECT 1")
    await nextTick()

    expect((textarea.element as HTMLTextAreaElement).value).toBe("SELECT 1")
  })

  it("submits query on button click", async () => {
    global.fetch = vi.fn(async (url: RequestInfo) => {
      if (String(url).includes("/query")) {
        return jsonResponse({ data: [], format: "json", rowCount: 0 })
      }
      return jsonResponse({ tables: {} })
    })

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await wrapper.get("[data-testid=\"run-query\"]").trigger("click")
    await flushPromises()

    expect(global.fetch).toHaveBeenCalled()
  })

  it("disables submit while loading", async () => {
    global.fetch = vi.fn(async () => new Promise(() => {}))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)
    const button = wrapper.get("[data-testid=\"run-query\"]")

    await button.trigger("click")

    expect(button.attributes("disabled")).toBeDefined()
    expect(button.text()).toContain("Running")
  })

  it("applies syntax highlighting", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ tables: {} }))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await wrapper.get("textarea").setValue("SELECT * FROM users")
    await nextTick()

    expect(wrapper.find(".editor-preview").html()).toContain("hljs")
  })
})
