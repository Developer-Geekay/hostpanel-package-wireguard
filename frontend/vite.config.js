import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds an IIFE bundle (main.js) directly into frontend/.
// React and ReactDOM are bundled in — the plugin is self-contained.
// PackageShell loads this file as a plain <script> tag; no import() available.

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.jsx',
      formats: ['iife'],
      name: 'WgPlugin',          // global var name (unused; registration is via window.__hpkg)
      fileName: () => 'main',    // → main.js
    },
    outDir: '.',                 // output to frontend/ (where vite.config.js lives)
    emptyOutDir: false,          // don't delete src/, package.json, etc.
    sourcemap: false,
  },
});
