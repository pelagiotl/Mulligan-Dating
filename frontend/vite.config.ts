import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  build: {
    /** Avoid CSS preload helper that can reject app startup on iOS PWA. */
    modulePreload: false,
    /** Keep hashed filenames unique per build so stale lazy chunks are obvious after deploy. */
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  plugins: [
    react({
      // Completely disable type checking
      typescript: {
        ignoreBuildErrors: true
      }
    }),
    {
      name: 'spa-404-fallback',
      closeBundle() {
        const indexHtml = resolve(__dirname, 'dist', 'index.html')
        const dest404 = resolve(__dirname, 'dist', '404.html')
        if (existsSync(indexHtml)) {
          try {
            copyFileSync(indexHtml, dest404)
          } catch {
            /* ignore */
          }
        }
      },
    },
  ],
  esbuild: {
    // Disable type checking in esbuild
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Listen on all interfaces (both IPv4 and IPv6)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})

