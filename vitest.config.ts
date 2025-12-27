import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    timeout: 10000,
    include: ['tests/**/*.test.ts']
  }
})
