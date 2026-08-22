import { defineConfig, devices } from '@playwright/test';

// TARGET_URL lets the exact same visual contract run against production:
//   npx playwright test                          -> local static server
//   TARGET_URL=https://zen-dive-manila.vercel.app npx playwright test
// That is deliberate. "Passes locally" and "correct on the site the user opens"
// were treated as the same thing once, and they are not.
const TARGET = process.env.TARGET_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',

  use: {
    baseURL: TARGET || 'http://127.0.0.1:8216',
    // Kills the WebGL ocean shader and the drifting bubbles (main.js checks
    // prefers-reduced-motion before mounting them). Without this the背景
    // behind the transparent logo changes every frame and every screenshot
    // differs from the last — the classic reason visual tests get abandoned.
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },

  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // Font rasterisation differs a hair between machines; allow a sliver of
      // noise but nothing structural. A 2x-too-wide wordmark is ~40% of pixels.
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
    },
  },

  webServer: TARGET ? undefined : {
    command: 'python3 -m http.server 8216 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8216/index.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile',  use: { ...devices['Desktop Chrome'], viewport: { width: 390,  height: 844 } } },
  ],
});
