import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devbridgePlugin } from '@devbridge/vite-plugin';

export default defineConfig({
  plugins: [
    devbridgePlugin({
      agentUrl: 'http://127.0.0.1:4321',
      agentToken: process.env.DEVBRIDGE_TOKEN,
    }),
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4000', // Forwards frontend /api calls to Express server.ts
    },
  },
});
