import { defineConfig } from 'vitest/config';
// Elevation measurement harness (not part of `npm test`): see scripts/geo/measure-elevation.test.ts.
export default defineConfig({
  test: {
    include: ['scripts/geo/measure-elevation.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 600_000,
  },
});
