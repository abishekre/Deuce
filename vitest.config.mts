import { defineConfig } from 'vitest/config';

/**
 * The rules engine is deliberately pure TypeScript with no React Native
 * imports, so it runs under plain Node with no transform pipeline, no
 * jest-expo preset and no native mocking. That isolation is the reason these
 * tests stay fast enough to run on every keystroke — and the reason the
 * scoring rules can be tested to exhaustion before any screen exists.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
  },
});
