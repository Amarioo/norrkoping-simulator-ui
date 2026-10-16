import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
const proxy = {
  '/api': {
    target: process.env.API_TARGET || 'http://127.0.0.1:8080',
    changeOrigin: true,
    timeout: 0,
    proxyTimeout: 0,
  },
};
export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
});
