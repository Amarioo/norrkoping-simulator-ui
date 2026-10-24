import { defineConfig } from 'vitest/config';
// Lighting Phase A1 harnesses (not part of `npm test`): output writer, capacity/occupancy reports.
export default defineConfig({
  test: {
    include: ['scripts/lighting-a1/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 300_000,
  },
});
