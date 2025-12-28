import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GagaraClient',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['papaparse'],
      output: {
        globals: {
          papaparse: 'Papa',
        },
      },
    },
  },
  plugins: [dts({ rollupTypes: true })],
})
