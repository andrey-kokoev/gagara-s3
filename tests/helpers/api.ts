const baseUrl = process.env.GAGARA_S3_SERVER_URL || ""
const token = process.env.GAGARA_S3_SERVICE_TOKEN || ""

export function getApiConfig() {
  return { baseUrl, token }
}

export function requireApiConfig() {
  if (!baseUrl || !token) {
    throw new Error("Missing GAGARA_S3_SERVER_URL or GAGARA_S3_SERVICE_TOKEN")
  }
  return { baseUrl, token }
}


type RequestOptions = {
  includeAuth?: boolean
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
) {
  const { baseUrl: resolvedBaseUrl, token: resolvedToken } = requireApiConfig()
  const headers = new Headers(init.headers)
  const includeAuth = options.includeAuth ?? true
  const timeoutMs = options.timeoutMs ?? 30000
  const retries = options.retries ?? 2
  const retryDelayMs = options.retryDelayMs ?? 1000

  if (includeAuth && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${resolvedToken}`)
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(`${resolvedBaseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal
      })
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await sleep(retryDelayMs)
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

export async function apiJson(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
) {
  const res = await apiRequest(path, init, options)
  let data: unknown = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  return { res, data }
}
