import { defineConfig } from 'vitest/config';
// Lighting Phase L0 harness (not part of `npm test`): writes or checks the L0 review outputs.
export default defineConfig({
  test: {
    include: ['scripts/lighting-city/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 600_000,
  },
});
