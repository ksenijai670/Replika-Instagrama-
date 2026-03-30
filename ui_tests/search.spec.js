const { test, expect } = require('@playwright/test');

function makeFakeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

test.describe('Search UI', () => {
  test.beforeEach(async ({ page }) => {
    const token = makeFakeJwt({ userId: 123 });

    await page.addInitScript((tokenValue) => {
      localStorage.setItem('token', tokenValue);
    }, token);
  });

  test('prikazuje poruku za minimum 2 slova', async ({ page }) => {
    await page.goto('/search');

    await expect(
      page.getByPlaceholder('Pretraži po imenu ili korisničkom imenu...')
    ).toBeVisible();

    await expect(
      page.getByText('Unesite bar 2 slova za pretragu...')
    ).toBeVisible();
  });

  test('korisnik moze da unese tekst u search polje', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder('Pretraži po imenu ili korisničkom imenu...');

    await searchInput.fill('ana');

    await expect(searchInput).toHaveValue('ana');
  });

  test('za jedno slovo ne prikazuje rezultate nego poruku za minimum 2 slova', async ({ page }) => {
    await page.goto('/search');

    await page
      .getByPlaceholder('Pretraži po imenu ili korisničkom imenu...')
      .fill('a');

    await expect(
      page.getByText('Unesite bar 2 slova za pretragu...')
    ).toBeVisible();
  });

  test('prikazuje rezultate pretrage kada backend vrati korisnike', async ({ page }) => {
    await page.route('http://localhost:4000/api/profile/search?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 1,
              username: 'ana123',
              first_name: 'Ana',
              last_name: 'Anić',
              profile_image_url: '',
              bio: 'Frontend developer'
            },
            {
              id: 2,
              username: 'marko99',
              first_name: 'Marko',
              last_name: 'Marković',
              profile_image_url: '',
              bio: 'Backend developer'
            }
          ]
        })
      });
    });

    await page.goto('/search');

    await page
      .getByPlaceholder('Pretraži po imenu ili korisničkom imenu...')
      .fill('an');

    await expect(page.getByText('ana123')).toBeVisible();
    await expect(page.getByText('Ana Anić')).toBeVisible();
    await expect(page.getByText('marko99')).toBeVisible();
    await expect(page.getByText('Marko Marković')).toBeVisible();
  });

  test('prikazuje poruku kada nema rezultata', async ({ page }) => {
    await page.route('http://localhost:4000/api/profile/search?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: []
        })
      });
    });

    await page.goto('/search');

    await page
      .getByPlaceholder('Pretraži po imenu ili korisničkom imenu...')
      .fill('pera');

    await expect(page.getByText('Nema rezultata za "pera".')).toBeVisible();
  });

  test('klik na rezultat vodi na profile stranicu', async ({ page }) => {
    await page.route('http://localhost:4000/api/profile/search?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 1,
              username: 'ana123',
              first_name: 'Ana',
              last_name: 'Anić',
              profile_image_url: '',
              bio: 'Frontend developer'
            }
          ]
        })
      });
    });

    await page.goto('/search');

    await page
      .getByPlaceholder('Pretraži po imenu ili korisničkom imenu...')
      .fill('an');

    await page.getByText('ana123').click();

    await expect(page).toHaveURL(/.*\/profile/);
  });
});