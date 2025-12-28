import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  envPrefix: ['VITE_', 'GAGARA_'],
  resolve: {
    alias: {
      '@gagara-s3/client': fileURLToPath(
        new URL('../client/src', import.meta.url)
      ),
    },
  },
  server: {
    port: 5173
  }
})
