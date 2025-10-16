import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal config for React + TS
export default defineConfig({
  plugins: [react()],
});
