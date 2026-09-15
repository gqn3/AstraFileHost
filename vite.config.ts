import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'apps/web', plugins: [react()],
  build: { assetsInlineLimit: 0, outDir: '../../dist/web', emptyOutDir: true },
  server: { port: 18400, strictPort: true, proxy: { '/api': 'http://127.0.0.1:18402', '/health': 'http://127.0.0.1:18402' } }
});
