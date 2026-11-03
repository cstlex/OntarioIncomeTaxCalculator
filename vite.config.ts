import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` emits relative asset URLs, so the same build works on the
// custom domain (https://tax.minsookim.dev/) and on the project URL
// (https://cstlex.github.io/OntarioIncomeTaxCalculator/).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
