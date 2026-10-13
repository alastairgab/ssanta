/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production-only Content Security Policy. Everything is served from the same origin;
 * no third-party scripts, styles, fonts or network endpoints are permitted.
 * (The dev server needs inline scripts for hot reload, so CSP is only injected at build time.)
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'secret-santa-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

// Hash-based routing + relative base means the build works at any GitHub Pages
// project path (https://user.github.io/<repo>/) without server rewrites.
// BASE_PATH can override it (e.g. "/secret-santa/") if an absolute base is preferred.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react(), contentSecurityPolicy()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
  },
});
