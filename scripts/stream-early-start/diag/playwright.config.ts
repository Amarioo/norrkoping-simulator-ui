// Diagnostic copy of tests/simulation.spec.ts (second-tab timeline). Not part of npm run test:e2e.
import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config';
export default defineConfig({ ...base, testDir: '.', outputDir: '../../../work/stream-early-start/test-results' });
