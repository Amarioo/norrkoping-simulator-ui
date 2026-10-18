import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,js}'], setupFiles: ['src/testSetup.ts'] },
});
