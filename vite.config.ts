/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5188,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
