const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './ui_tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
});