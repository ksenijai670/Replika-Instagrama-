const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Register UI', () => {
  test('register stranica prikazuje sva potrebna polja', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByPlaceholder('Ime i prezime')).toBeVisible();
    await expect(page.getByPlaceholder('Korisničko ime (Obavezno)')).toBeVisible();
    await expect(page.getByPlaceholder('Email (Obavezno)')).toBeVisible();
    await expect(page.getByPlaceholder('Lozinka (Obavezno)')).toBeVisible();
    await expect(page.getByPlaceholder('Opis profila (Opciono)')).toBeVisible();

    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registruj se' })).toBeVisible();
  });

  test('prikazuje alert kada je profilna slika veca od 50MB', async ({ page }) => {
    await page.goto('/register');

    const filePath = path.join(__dirname, 'prevelika-slika.jpg');

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, Buffer.alloc(51 * 1024 * 1024));
    }

    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.locator('input[type="file"]').setInputFiles(filePath);

    await page.waitForTimeout(300);

    expect(dialogMessage).toBe('Fajl je prevelik! Maksimalna veličina je 50MB.');
  });

  test('korisnik moze da unese podatke u register formu', async ({ page }) => {
    await page.goto('/register');

    await page.getByPlaceholder('Ime i prezime').fill('Ana Anic');
    await page.getByPlaceholder('Korisničko ime (Obavezno)').fill('ana123');
    await page.getByPlaceholder('Email (Obavezno)').fill('ana@test.com');
    await page.getByPlaceholder('Lozinka (Obavezno)').fill('test123');
    await page.getByPlaceholder('Opis profila (Opciono)').fill('Opis profila');

    await expect(page.getByPlaceholder('Ime i prezime')).toHaveValue('Ana Anic');
    await expect(page.getByPlaceholder('Korisničko ime (Obavezno)')).toHaveValue('ana123');
    await expect(page.getByPlaceholder('Email (Obavezno)')).toHaveValue('ana@test.com');
    await expect(page.getByPlaceholder('Lozinka (Obavezno)')).toHaveValue('test123');
    await expect(page.getByPlaceholder('Opis profila (Opciono)')).toHaveValue('Opis profila');
  });

  test('register dugme je vidljivo i omoguceno', async ({ page }) => {
    await page.goto('/register');

    const registerButton = page.getByRole('button', { name: 'Registruj se' });

    await expect(registerButton).toBeVisible();
    await expect(registerButton).toBeEnabled();
  });

  test('uspesna registracija vodi na login stranicu', async ({ page }) => {
    await page.route('http://localhost:4000/api/authentication/register', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Uspešna registracija'
        })
      });
    });

    await page.route('http://localhost:4000/api/authentication/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token'
        })
      });
    });

    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/register');

    await page.getByPlaceholder('Ime i prezime').fill('Ana Anic');
    await page.getByPlaceholder('Korisničko ime (Obavezno)').fill('ana123');
    await page.getByPlaceholder('Email (Obavezno)').fill('ana@test.com');
    await page.getByPlaceholder('Lozinka (Obavezno)').fill('test123');
    await page.getByPlaceholder('Opis profila (Opciono)').fill('Test opis');

    await page.getByRole('button', { name: 'Registruj se' }).click();

    await expect(page).toHaveURL(/.*\/login/);
    expect(dialogMessage).toBe('Uspešna registracija!');
  });
});