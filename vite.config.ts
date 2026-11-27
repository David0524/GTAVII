import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
  build: {
    target: 'es2022', chunkSizeWarningLimit: 2500,
    // Vendor code in its own long-cached files: a game update re-downloads only our ~0.5 MB, not three.js
    // and the physics engine (which embeds its wasm). Load bug 2026-11-26.
    // uilab.html: the UI chat's screen lab, built so it works on preview deploys for phone testing (ui response 1)
    rollupOptions: { input: { main: 'index.html', uilab: 'uilab.html' }, output: { manualChunks: (id: string) => (id.includes('@dimforge/rapier3d') ? 'vendor-physics' : id.includes('node_modules/three/') ? 'vendor-three' : undefined) } },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
