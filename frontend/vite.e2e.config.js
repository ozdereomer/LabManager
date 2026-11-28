import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

if (process.env.LABMANAGER_E2E !== '1') {
  throw new Error(
    'Vite requires the isolated LabManager E2E environment'
  )
}

export default defineConfig({
  plugins: [react()],
  cacheDir: '/tmp/labmanager-vite-e2e-cache',

  server: {
    host: '127.0.0.1',
    port: 3100,
    strictPort: true,

    proxy: {
      '/api': {
        target: 'http://labmanager-api-e2e:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
