import { defineConfig } from '@playwright/test';

// Device matrix from docs/mobile/02-mobile-design-spec.md (viewports are CSS pixels).
const MOBILE_VIEWPORTS = [
  { name: 's23u', width: 384, height: 824 },
  { name: 'fold-cover', width: 411, height: 667 },
  { name: 'brax', width: 360, height: 806 },
  { name: 'fold-inner', width: 841, height: 627 },
];

const projects = MOBILE_VIEWPORTS.map(({ name, width, height }) => ({
  name,
  use: {
    browserName: 'chromium' as const,
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.5,
  },
}));

// Optional desktop sanity project: E2E_DESKTOP=1 npx playwright test --project=desktop
if (process.env.E2E_DESKTOP) {
  projects.push({
    name: 'desktop',
    use: {
      browserName: 'chromium' as const,
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    },
  });
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // A stray test.only must fail CI instead of silently running one test.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
  },
  // A production build, not the dev server: dev-only StrictMode runs effects twice and masked a
  // login redirect bug that only production showed (2026-10-15).
  webServer: {
    command: 'npm run e2e:serve',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects,
});
