import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project at /chordpad/, but the local dev server
  // (and its preview tooling) expects the app at the root.
  base: command === 'build' ? '/chordpad/' : '/',
  plugins: [react()],
}))
