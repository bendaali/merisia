import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

const staticFiles = [
  'auth.html',
  'register.html',
  'dashboard.html',
  'styles.css',
  'navigation.js',
  'script.js',
  'csrf.js',
  'dashboard.js'
];

function copyStaticFiles() {
  return {
    name: 'copy-merisia-static-files',
    closeBundle() {
      mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
      for (const file of staticFiles) {
        copyFileSync(resolve(__dirname, file), resolve(__dirname, 'dist', file));
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html')
      }
    }
  }
});
