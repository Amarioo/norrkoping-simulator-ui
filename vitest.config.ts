import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,js}', 'scripts/board/**/*.test.mjs'], setupFiles: ['src/testSetup.ts'] },
});
