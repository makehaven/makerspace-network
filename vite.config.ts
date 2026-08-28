import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3100 },
  build: { outDir: 'dist' },
  // data/ lives outside src/ on purpose — it is the product, not an
  // implementation detail of the site. import.meta.glob reaches it at build
  // time so there is no generation step to forget to run.
  publicDir: 'public',
});
