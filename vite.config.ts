import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api/openverse': {
        target: 'https://api.openverse.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/openverse/, ''),
      },
      '/api/nasa': {
        target: 'https://images-api.nasa.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/nasa/, ''),
      },
      '/api/met': {
        target: 'https://collectionapi.metmuseum.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/met/, ''),
      },
      '/api/rijks': {
        target: 'https://data.rijksmuseum.nl',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/rijks/, ''),
      },
      '/api/cleveland': {
        target: 'https://openaccess-api.clevelandart.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/cleveland/, ''),
      },
    },
  },
  build: { target: 'es2019', outDir: 'dist' },
});
