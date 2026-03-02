import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const browser = process.env.BROWSER || 'chrome';

function loadManifest() {
  const base = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));
  const overridePath = resolve(__dirname, `manifest.${browser}.json`);
  let overrides = {};
  try {
    overrides = JSON.parse(readFileSync(overridePath, 'utf-8'));
  } catch {
    // No browser-specific overrides
  }
  return { ...base, ...overrides };
}

export default defineConfig({
  plugins: [
    preact(),
    crx({ manifest: loadManifest() }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: `dist-${browser}`,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // CRXJS auto-discovers index.html from Chrome's side_panel key but not
        // from Firefox's sidebar_action, so include it explicitly for Firefox.
        ...(browser === 'firefox'
          ? { sidepanel: resolve(__dirname, 'src/sidepanel/index.html') }
          : {}),
        editor: resolve(__dirname, 'src/sidepanel/editor.html'),
      },
    },
  },
});
