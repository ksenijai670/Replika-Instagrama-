const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './ui-tests',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
});