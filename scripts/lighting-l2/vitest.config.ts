import { defineConfig } from 'vitest/config';
// Lighting Phase L2 harness (not part of `npm test`): generation, compact data, heap probes.
export default defineConfig({
  test: {
    include: ['scripts/lighting-l2/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 1_200_000,
    fileParallelism: false,
    pool: 'forks',
    execArgv: ['--expose-gc'],
  },
});
