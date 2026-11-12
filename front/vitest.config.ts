import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests de lógica pura del front (sin DOM): utilidades de lib/ y manifiestos
// de los módulos.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['lib/**/*.test.ts', 'modules/**/*.test.ts'],
    environment: 'node',
  },
});
