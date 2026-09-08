import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API base URL is the only build-time input. Nothing else about the
// deployment target is baked into the bundle.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
})
