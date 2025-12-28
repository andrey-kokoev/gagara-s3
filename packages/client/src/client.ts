import Papa from 'papaparse'
import type {
  GagaraConfig,
  QueryOptions,
  QueryResponse,
  CatalogResponse,
  RefreshCatalogResponse,
  AddCatalogTableResponse,
  DeleteCatalogTableResponse,
  GagaraErrorResponse,
} from './types'
import { GagaraError, GagaraHttpError } from './utils/errors'

export class GagaraClient {
  private baseUrl: string
  private token: string

  constructor(config: GagaraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
  }

  private async request<T> (
    path: string,
    options: RequestInit = {}
  ): Promise<T | string> {
    const url = `${this.baseUrl}${path}`
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${this.token}`)

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let errorData: GagaraErrorResponse
      try {
        errorData = await response.json()
      } catch {
        throw new GagaraHttpError(response)
      }
      throw new GagaraError(errorData)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }
    return response.text()
  }

  async query<T = any> (sql: string, options: QueryOptions = {}): Promise<T[]> {
    const format = options.format || 'json'
    const path = `/query?format=${format}`

    const result = await this.request<QueryResponse<T> | string>(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: options.signal,
      body: JSON.stringify({ sql }),
    })

    if (format === 'csv') {
      const csvText = result as string
      const parsed = Papa.parse<T>(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      })

      if (parsed.errors.length > 0) {
        throw new Error(`Failed to parse CSV: ${parsed.errors[0].message}`)
      }

      return parsed.data
    }

    return (result as QueryResponse<T>).data
  }

  async getCatalog (): Promise<Record<string, string>> {
    const result = await this.request<CatalogResponse>('/catalog')
    return (result as CatalogResponse).tables
  }

  async refreshCatalog (): Promise<Record<string, string>> {
    const result = await this.request<RefreshCatalogResponse>('/refresh-catalog', {
      method: 'POST',
    })
    return (result as RefreshCatalogResponse).tables
  }

  async addCatalogTable (name: string, path: string): Promise<Record<string, string>> {
    const result = await this.request<AddCatalogTableResponse>('/catalog/tables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, path }),
    })
    return (result as AddCatalogTableResponse).tables
  }

  async deleteCatalogTable (name: string): Promise<Record<string, string>> {
    const result = await this.request<DeleteCatalogTableResponse>('/catalog/tables', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    })
    return (result as DeleteCatalogTableResponse).tables
  }
}
