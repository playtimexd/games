import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' keeps asset URLs relative, so the build works from a repo
// sub-path on GitHub Pages as well as from a domain root.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // three.js ships as its own lazy chunk (loaded after first paint), so its size is expected.
  build: { chunkSizeWarningLimit: 700 },
})
