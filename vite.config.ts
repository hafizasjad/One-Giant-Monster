import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    // The preview pane passes PORT when 5173 is taken by another project.
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
