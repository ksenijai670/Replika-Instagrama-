const { test, expect } = require('@playwright/test');

test('ulogovani korisnik moze da izmeni svoj profil', async ({ page }) => {
  const unique = Date.now();
  const username = `testuser${unique}`;
  const email = `test${unique}@mail.com`;
  const password = 'Test123!';

  const newFirstName = 'Ana';
  const newLastName = 'Test';
  const newBio = 'Izmenjena biografija kroz Playwright test.';

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  // Registracija
  await page.goto('/register');
  await page.getByPlaceholder('Ime i prezime (Obavezno)').fill('Test Korisnik');
  await page.getByPlaceholder('Korisničko ime (Obavezno)').fill(username);
  await page.getByPlaceholder('Email adresa (Obavezno)').fill(email);
  await page.getByPlaceholder('Lozinka (Obavezno)').fill(password);
  await page.getByPlaceholder('Opis profila (Opciono)').fill('Pocetna biografija');
  await page.getByRole('button', { name: 'Registruj se' }).click();

  await expect(page).toHaveURL(/login/);

  // Login
  await page.getByPlaceholder('Korisničko ime ili email').fill(username);
  await page.getByPlaceholder('Lozinka').fill(password);
  await page.getByRole('button', { name: 'Prijavi se' }).click();

  await expect(page).not.toHaveURL(/login/);

  // Profil
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Uredi profil' })).toBeVisible();

  // Otvori modal
  const modalHeading = page.getByRole('heading', { name: 'Uredi profil' });
  await page.getByRole('button', { name: 'Uredi profil' }).click();
  await expect(modalHeading).toBeVisible();

  const textInputs = page.locator('input[type="text"]');
  const bioTextarea = page.locator('textarea').last();

  await textInputs.nth(0).fill(newFirstName);
  await textInputs.nth(1).fill(newLastName);
  await bioTextarea.fill(newBio);

  await page.getByRole('button', { name: 'Sačuvaj' }).click();

  // Najvažnije: modal mora da se zatvori
  await expect(modalHeading).not.toBeVisible({ timeout: 10000 });

  // Osveži profil i proveri da se vidi nova biografija
  await page.goto('/profile');
  await expect(page.getByText(newBio)).toBeVisible({ timeout: 10000 });
});