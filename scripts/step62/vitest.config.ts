import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['scripts/step62/*.test.ts'],testTimeout:30000}});
