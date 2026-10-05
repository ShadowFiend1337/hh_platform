import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const proxy = { '/api': { target: 'http://127.0.0.1:8787' } };

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy, fs: { strict: true, allow: [fileURLToPath(new URL('.', import.meta.url))] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  build: { outDir: 'dist', sourcemap: false },
});
