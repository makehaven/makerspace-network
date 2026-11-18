import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    // Hosting's /api/events/* rewrites, for `npm run dev:emulated`.
    proxy: {
      '/api/events': {
        target: 'http://127.0.0.1:5101',
        changeOrigin: false,
        rewrite: (p) => {
          const fn: Record<string, string> = { register: 'eventRegister', manage: 'eventManage', mine: 'eventMine', interest: 'eventInterest', sponsor: 'eventSponsor', 'stripe-webhook': 'eventStripeWebhook' };
          return `/makerspace-net/us-central1/${fn[p.split('/').pop() ?? '']}`;
        },
      },
    },
  },
  build: { outDir: 'dist' },
  // Loaded on demand; listed so the dev server doesn't reload the page when it first appears.
  optimizeDeps: { include: ['firebase/storage'] },
  // data/ lives outside src/ on purpose — it is the product, not an
  // implementation detail of the site. import.meta.glob reaches it at build
  // time so there is no generation step to forget to run.
  publicDir: 'public',
});
