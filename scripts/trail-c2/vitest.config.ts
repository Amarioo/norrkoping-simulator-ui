import { defineConfig } from 'vitest/config';
// Phase C2 harness (not part of `npm test`): generation of the trail-lantern files.
export default defineConfig({
  test: {
    include: ['scripts/trail-c2/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 1_200_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
