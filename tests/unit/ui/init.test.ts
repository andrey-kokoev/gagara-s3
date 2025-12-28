import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount } from "@vue/test-utils"

const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  query: vi.fn()
}))

vi.mock("@gagara-s3/client", () => ({
  GagaraClient: class {
    getCatalog() {
      return mocks.getCatalog()
    }
    query(sql: string, options?: unknown) {
      return mocks.query(sql, options)
    }
  }
}))

describe("ui/init", () => {
  beforeEach(() => {
    mocks.getCatalog.mockResolvedValue({})
    mocks.query.mockResolvedValue([])
  })

  const setEnv = (serverUrl: string, token: string) => {
    Object.assign(import.meta.env, {
      GAGARA_S3_SERVER_URL: serverUrl,
      GAGARA_S3_SERVICE_TOKEN: token
    })
  }

  it("shows missing config when env vars are absent", async () => {
    vi.resetModules()
    setEnv("", "")

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    expect(wrapper.text()).toContain("Missing env config")
  })

  it("shows client ready when env vars are present", async () => {
    vi.resetModules()
    setEnv("http://localhost:8000", "token")

    const { default: App } = await import("../../../packages/ui/src/App.vue")
    const wrapper = mount(App)

    expect(wrapper.text()).toContain("Client ready")
  })
})
