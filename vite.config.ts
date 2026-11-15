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
        "default-src 'none'; style-src 'unsafe-inline' 'self'; script-src 'self' https://apis.google.com https://*.firebaseapp.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://accounts.google.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; font-src 'self' data:; img-src 'self' data: https://*.googleusercontent.com; base-uri 'none'; form-action 'none'",
        "default-src 'none'; style-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://accounts.google.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; font-src 'self' data:; img-src 'self' data: https://*.googleusercontent.com; base-uri 'none'; form-action 'none'",
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
