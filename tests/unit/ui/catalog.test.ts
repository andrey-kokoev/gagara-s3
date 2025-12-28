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

describe("ui/catalog", () => {
  beforeEach(() => {
    Object.assign(import.meta.env, {
      GAGARA_S3_SERVER_URL: "http://localhost:8000",
      GAGARA_S3_SERVICE_TOKEN: "token"
    })
  })

  it("fetches catalog via client", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ tables: { users: "s3://bucket/users.parquet" } }))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await flushPromises()
    await nextTick()

    expect(global.fetch).toHaveBeenCalled()
    expect(wrapper.text()).toContain("users")
  })

  it("inserts table name on click", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ tables: { events: "s3://bucket/events.parquet" } }))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await flushPromises()
    await nextTick()
    await wrapper.find(".catalog-item").trigger("click")

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toContain("events")
  })

  it("handles empty catalog", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ tables: {} }))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain("No tables available")
  })

  it("shows error message on fetch failure", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ error: "boom", code: "CATALOG_ERROR" }, 500))

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain("boom")
  })
})
