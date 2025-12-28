export type GagaraFormat = 'json' | 'csv'

export interface GagaraConfig {
  baseUrl: string
  token: string
}

export interface QueryRequest {
  sql: string
}

export interface QueryResponse<T = any> {
  data: T[]
  format: 'json'
  rowCount: number
}

export interface CatalogResponse {
  tables: Record<string, string>
}

export interface RefreshCatalogResponse {
  status: 'ok'
  message: string
  tables: Record<string, string>
}

export interface AddCatalogTableResponse {
  status: 'ok'
  message: string
  tables: Record<string, string>
}

export interface GagaraErrorResponse {
  error: string
  code: string
  details?: {
    hint?: string;
    [key: string]: any
  }
}

export interface QueryOptions {
  format?: GagaraFormat
}
