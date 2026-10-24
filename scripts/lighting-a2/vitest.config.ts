import { defineConfig } from 'vitest/config';
// Lighting Phase A2 harnesses (not part of `npm test`): output writer, capacity/seam reports, timing.
export default defineConfig({
  test: {
    include: ['scripts/lighting-a2/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 300_000,
  },
});
