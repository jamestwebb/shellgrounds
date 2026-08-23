import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The pack menu is built in the browser from packs/index.js, which cannot
  // read a Netlify environment variable at run time. Inline the value at build
  // time instead, so ENABLED_PACKS decides the menu as well as the API. It is
  // not secret: it is a list of course names the student is about to be shown.
  define: {
    __ENABLED_PACKS__: JSON.stringify(process.env.ENABLED_PACKS || '')
  },
  server: {
    // Vite binds the ONE address `localhost` resolves to. On this host that is
    // ::1, so nothing listens on 127.0.0.1:3000 and an IPv4 client is refused
    // instantly. That refusal looks exactly like a crashed server and is not
    // one. Anything that probes this port must try both loopback families —
    // scripts/start-dev.sh does — rather than pin one and believe the result.
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
