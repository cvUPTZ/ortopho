import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function devCspPlugin(): Plugin {
  return {
    name: 'dev-csp-adapter',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        "default-src 'none'; style-src 'unsafe-inline' 'self'; script-src 'self'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:; base-uri 'none'; form-action 'none'",
        "default-src 'none'; style-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:; base-uri 'none'; form-action 'none'",
      );
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devCspPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
