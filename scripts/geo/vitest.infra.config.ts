import { defineConfig } from 'vitest/config';
// Infrastructure diagnostics (not part of `npm test`): scripts/geo/infra-*.test.ts.
export default defineConfig({
  test: {
    include: ['scripts/geo/infra-*.test.ts'],
    setupFiles: ['src/testSetup.ts'],
    testTimeout: 900_000,
  },
});
