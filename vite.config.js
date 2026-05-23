import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase/')) {
            if (id.includes('/auth/')) return 'firebase-auth';
            if (id.includes('/firestore/')) return 'firebase-firestore';
            return 'firebase-core';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
})
