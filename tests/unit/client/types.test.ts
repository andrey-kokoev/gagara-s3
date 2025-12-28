import { describe, it, expect } from 'vitest'
import type { QueryRequest, QueryResponse } from '../../../packages/client/src/types'

describe('Types', () => {
  it('should allow creating objects matching interfaces', () => {
    const request: QueryRequest = {
      sql: 'SELECT * FROM test',
    }
    expect(request.sql).toBe('SELECT * FROM test')

    const response: QueryResponse = {
      data: [{ id: 1 }],
      format: 'json',
      rowCount: 1,
    }
    expect(response.rowCount).toBe(1)
    expect(response.data).toHaveLength(1)
  })
})
