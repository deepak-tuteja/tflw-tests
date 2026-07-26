import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-mode proxy mirrors what nginx does in the Dockerized build (Dockerfile's nginx.conf):
// same-origin /v1/* against apiV2, so session cookies + CSRF work identically whether the
// storefront is reached via `npm run dev` against a locally-running apiV2 or via the compose
// stack's `webV2` service.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    proxy: {
      '/v1': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
});
