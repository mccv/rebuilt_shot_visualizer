import { defineConfig } from 'vite';

export default defineConfig({
  base: '/rebuilt_shot_visualizer/',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
