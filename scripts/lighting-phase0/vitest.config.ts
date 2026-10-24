import { defineConfig } from 'vitest/config';
// Lighting Phase 0 harnesses (not part of `npm test`): baseline freezing, resource and lifecycle measurements.
export default defineConfig({
  test: {
    include: ['scripts/lighting-phase0/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 300_000,
  },
});
