import type { GagaraErrorResponse } from '../types'

export class GagaraError extends Error {
  public code: string
  public details?: any

  constructor(response: GagaraErrorResponse) {
    super(response.error)
    this.name = 'GagaraError'
    this.code = response.code
    this.details = response.details
  }
}

export class GagaraHttpError extends Error {
  public status: number
  public statusText: string

  constructor(response: Response) {
    super(`HTTP Error: ${response.status} ${response.statusText}`)
    this.name = 'GagaraHttpError'
    this.status = response.status
    this.statusText = response.statusText
  }
}
