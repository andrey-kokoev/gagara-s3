import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GagaraClient } from '../../../packages/client/src/client'
import { GagaraError, GagaraHttpError } from '../../../packages/client/src/utils/errors'

describe('GagaraClient', () => {
  const config = {
    baseUrl: 'http://localhost:8000',
    token: 'test-token',
  }

  let client: GagaraClient

  beforeEach(() => {
    client = new GagaraClient(config)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should initialize with correct config', () => {
    expect(client).toBeDefined()
  })

  describe('query', () => {
    it('should execute a JSON query successfully', async () => {
      const mockData = [{ id: 1, name: 'test' }]
      const mockResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: mockData, format: 'json', rowCount: 1 }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as any)

      const result = await client.query('SELECT * FROM test')

      expect(result).toEqual(mockData)
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/query?format=json',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers),
          body: JSON.stringify({ sql: 'SELECT * FROM test' }),
        })
      )

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer test-token')
    })

    it('should execute a CSV query and parse it', async () => {
      const csvText = 'id,name\n1,test\n2,other'
      const mockResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: async () => csvText,
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as any)

      const result = await client.query('SELECT * FROM test', { format: 'csv' })

      expect(result).toEqual([
        { id: 1, name: 'test' },
        { id: 2, name: 'other' },
      ])
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/query?format=csv',
        expect.any(Object)
      )
    })

    it('should throw GagaraError on API error', async () => {
      const errorPayload = { error: 'Invalid SQL', code: 'PARSE_ERROR' }
      const mockResponse = {
        ok: false,
        json: async () => errorPayload,
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as any)

      try {
        await client.query('INVALID SQL')
        throw new Error('Expected query to throw')
      } catch (e: any) {
        expect(e).toBeInstanceOf(GagaraError)
        expect(e.code).toBe('PARSE_ERROR')
        expect(e.message).toBe('Invalid SQL')
      }
    })

    it('should throw GagaraHttpError on non-JSON error response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON') },
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as any)

      await expect(client.query('SELECT * FROM test')).rejects.toThrow(GagaraHttpError)
    })
  })

  describe('catalog', () => {
    it('should fetch catalog', async () => {
      const mockTables = { users: 's3://bucket/users.parquet' }
      const mockResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ tables: mockTables }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as any)

      const result = await client.getCatalog()

      expect(result).toEqual(mockTables)
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/catalog',
        expect.any(Object)
      )
    })

    it('should refresh catalog', async () => {
      const mockTables = { users: 's3://bucket/users.parquet' }
      const mockResponse = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok', message: 'Refreshed', tables: mockTables }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as any)

      const result = await client.refreshCatalog()

      expect(result).toEqual(mockTables)
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/refresh-catalog',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
