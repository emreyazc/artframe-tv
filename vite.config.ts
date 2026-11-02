import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api/met': {
        target: 'https://collectionapi.metmuseum.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/met/, ''),
      },
      '/api/chicago': {
        target: 'https://api.artic.edu',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/chicago/, ''),
      },
    },
  },
  build: { target: 'es2019', outDir: 'dist' },
});
