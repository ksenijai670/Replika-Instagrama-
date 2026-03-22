const { test, expect } = require('@playwright/test');

test('register stranica se otvara', async ({ page }) => {
  await page.goto('/register');
  await expect(page).toHaveURL(/register/);
});

test('uspesna registracija novog korisnika', async ({ page }) => {
  const unique = Date.now();
  const username = `testuser${unique}`;
  const email = `test${unique}@mail.com`;
  const password = 'Test123!';

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.goto('/register');

  await page.getByPlaceholder('Ime i prezime (Obavezno)').fill('Test Korisnik');
  await page.getByPlaceholder('Korisničko ime (Obavezno)').fill(username);
  await page.getByPlaceholder('Email adresa (Obavezno)').fill(email);
  await page.getByPlaceholder('Lozinka (Obavezno)').fill(password);
  await page.getByPlaceholder('Opis profila (Opciono)').fill('Ovo je test nalog.');

  await page.getByRole('button', { name: 'Registruj se' }).click();

  await expect(page).toHaveURL(/login/);
});