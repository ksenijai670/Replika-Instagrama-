const { test, expect } = require('@playwright/test');

test('neulogovan korisnik ne moze da pristupi profilu', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/login/);
});