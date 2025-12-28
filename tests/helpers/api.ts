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
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
) {
  const { baseUrl: resolvedBaseUrl, token: resolvedToken } = requireApiConfig()
  const headers = new Headers(init.headers)
  const includeAuth = options.includeAuth ?? true
  const timeoutMs = options.timeoutMs ?? 15000

  if (includeAuth && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${resolvedToken}`)
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(`${resolvedBaseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
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
