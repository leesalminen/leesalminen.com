import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/_bj': {
        target: 'https://pay.bitcoinjungle.app',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_bj/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
