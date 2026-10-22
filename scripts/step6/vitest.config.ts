import { defineConfig } from 'vitest/config';
// Step 6 helper harness (not part of `npm test`): resolves the evidence camera poses on the terrain.
export default defineConfig({
  test: {
    include: ['scripts/step6/*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 300_000,
  },
});
