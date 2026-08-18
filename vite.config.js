import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // strictPort: a silent drift to 3001 leaves netlify.toml's targetPort
    // pointing at nothing, which is a confusing way to fail.
    strictPort: true,
    proxy: {
      // Local functions come from `netlify functions:serve`, which the `dev`
      // script starts alongside this server. `netlify dev` is the nicer front
      // door, but its readiness probe resolves localhost to ::1 and does not
      // fall back, so it cannot see this server on a host with IPv6 disabled.
      '/api': {
        target: `http://127.0.0.1:${process.env.FUNCTIONS_PORT || 9999}/.netlify/functions`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
