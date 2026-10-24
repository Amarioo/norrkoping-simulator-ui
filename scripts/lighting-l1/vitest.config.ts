import { defineConfig } from 'vitest/config';
// Lighting Phase L1 harness (not part of `npm test`): stress set and scale figures.
export default defineConfig({
  test: {
    include: ['scripts/lighting-l1/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 600_000,
    fileParallelism: false,
  },
});
