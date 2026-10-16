import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy forwards /api and /uploads to the Express server,
// so the frontend can call "/api/..." without CORS issues during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    },
  },
});
