const { test, expect } = require('@playwright/test');

test('ulogovani korisnik moze da otvori svoj profil', async ({ page }) => {
  const unique = Date.now();
  const username = `testuser${unique}`;
  const email = `test${unique}@mail.com`;
  const password = 'Test123!';

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  // Register
  await page.goto('/register');
  await page.getByPlaceholder('Ime i prezime (Obavezno)').fill('Test Korisnik');
  await page.getByPlaceholder('Korisničko ime (Obavezno)').fill(username);
  await page.getByPlaceholder('Email adresa (Obavezno)').fill(email);
  await page.getByPlaceholder('Lozinka (Obavezno)').fill(password);
  await page.getByPlaceholder('Opis profila (Opciono)').fill('Ovo je test nalog.');
  await page.getByRole('button', { name: 'Registruj se' }).click();

  await expect(page).toHaveURL(/login/);

  // Login
  await page.getByPlaceholder('Korisničko ime ili email').fill(username);
  await page.getByPlaceholder('Lozinka').fill(password);
  await page.getByRole('button', { name: 'Prijavi se' }).click();

  await expect(page).not.toHaveURL(/login/);

  // Profile
  await page.goto('/profile');

  await expect(page.getByRole('button', { name: 'Odjavi se' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uredi profil' })).toBeVisible();
  await expect(page.getByText(username)).toBeVisible();
});