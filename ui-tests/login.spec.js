const { test, expect } = require('@playwright/test');

test('login stranica se otvara', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/login/);
});

test('prikazuje gresku za neispravan login', async ({ page }) => {
  await page.goto('/login');

  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Pogrešno');
    await dialog.accept();
  });

  await page.getByPlaceholder('Korisničko ime ili email').fill('pogresan_korisnik');
  await page.getByPlaceholder('Lozinka').fill('pogresna_lozinka');
  await page.getByRole('button', { name: 'Prijavi se' }).click();

  await expect(page).toHaveURL(/login/);
});

test('uspesan login cuva token i preusmerava korisnika', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.goto('/login');

  await page.getByPlaceholder('Korisničko ime ili email').fill('ana123');
  await page.getByPlaceholder('Lozinka').fill('ana123');
  await page.getByRole('button', { name: 'Prijavi se' }).click();

  await expect(page).not.toHaveURL(/login/);

  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
});