import { defineConfig } from 'vitest/config';
// Geometry size/time harness (not part of `npm test`): see scripts/geo/measure-geometry.test.ts.
export default defineConfig({
  test: {
    include: ['scripts/geo/measure-geometry.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 900_000,
  },
});
