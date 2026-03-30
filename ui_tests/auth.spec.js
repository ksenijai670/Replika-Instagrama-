const { test, expect } = require('@playwright/test');

test.describe('Login UI', () => {
  test('login stranica prikazuje sva potrebna polja', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByPlaceholder('Korisničko ime ili email')).toBeVisible();
    await expect(page.getByPlaceholder('Lozinka')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prijavi se' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Registrujte se' })).toBeVisible();
  });

  test('klik na Registrujte se vodi na register stranicu', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: 'Registrujte se' }).click();

    await expect(page).toHaveURL(/.*\/register/);
  });

  test('korisnik moze da unese kredencijale u login formu', async ({ page }) => {
    await page.goto('/login');

    const identifierInput = page.getByPlaceholder('Korisničko ime ili email');
    const passwordInput = page.getByPlaceholder('Lozinka');

    await identifierInput.fill('ana123');
    await passwordInput.fill('test123');

    await expect(identifierInput).toHaveValue('ana123');
    await expect(passwordInput).toHaveValue('test123');
  });

  test('login dugme je vidljivo i omoguceno na login stranici', async ({ page }) => {
    await page.goto('/login');

    const loginButton = page.getByRole('button', { name: 'Prijavi se' });

    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeEnabled();
  });

  test('link Registrujte se ostaje vidljiv nakon unosa podataka u formu', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('Korisničko ime ili email').fill('ana123');
    await page.getByPlaceholder('Lozinka').fill('test123');

    await expect(page.getByRole('link', { name: 'Registrujte se' })).toBeVisible();
  });

  test('uspesan login cuva token i refresh token u localStorage', async ({ page }) => {
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

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto('/login');

    await page.getByPlaceholder('Korisničko ime ili email').fill('ana');
    await page.getByPlaceholder('Lozinka').fill('test123');
    await page.getByRole('button', { name: 'Prijavi se' }).click();

    await page.waitForTimeout(500);

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));

    expect(token).toBe('mock-access-token');
    expect(refreshToken).toBe('mock-refresh-token');
  });

  test('neuspesan login ne cuva token u localStorage', async ({ page }) => {
    await page.route('http://localhost:4000/api/authentication/login', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Pogrešno korisničko ime ili lozinka!'
        })
      });
    });

    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/login');

    await page.getByPlaceholder('Korisničko ime ili email').fill('ana');
    await page.getByPlaceholder('Lozinka').fill('pogresna');
    await page.getByRole('button', { name: 'Prijavi se' }).click();

    await page.waitForTimeout(500);

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));

    expect(dialogMessage).toBe('Pogrešno korisničko ime ili lozinka!');
    expect(token).toBeNull();
    expect(refreshToken).toBeNull();
  });
});