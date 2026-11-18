import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in development: cookies stay first-party and no CORS preflight is needed.
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app: separate chunks stay cached between releases.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[/\\](react|react-dom|react-router|scheduler)[/\\]/,
              priority: 30,
            },
            {
              name: 'data',
              test: /node_modules[/\\](zod|react-hook-form|@hookform|@tanstack)[/\\]/,
              priority: 20,
            },
            {
              name: 'ui',
              test: /node_modules[/\\](radix-ui|@radix-ui|@floating-ui|lucide-react)[/\\]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
