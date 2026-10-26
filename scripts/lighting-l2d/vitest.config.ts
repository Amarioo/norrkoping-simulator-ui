import { defineConfig } from 'vitest/config';
// Lighting Phase L2d harness (not part of `npm test`): generation of the site-lighting files.
export default defineConfig({
  test: {
    include: ['scripts/lighting-l2d/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 1_200_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
