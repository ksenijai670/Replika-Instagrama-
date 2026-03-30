const { test, expect } = require('@playwright/test');

function makeFakeJwt(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return `${header}.${body}.signature`;
}

async function prepareAuth(page) {
  const token = makeFakeJwt({ userId: 123 });

  await page.addInitScript(({ tokenValue }) => {
    localStorage.setItem('token', tokenValue);
  }, { tokenValue: token });
}

test.describe('Create Post UI', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAuth(page);
  });

  test('prikazuje create post formu', async ({ page }) => {
    await page.goto('/create');

    await expect(page.getByRole('heading', { name: 'Nova objava' })).toBeVisible();
    await expect(page.getByText('Klikni da dodaš sliku/video')).toBeVisible();
    await expect(page.getByText('Max 20 fajlova (do 50MB)')).toBeVisible();
    await expect(page.getByPlaceholder('Dodaj opis ༘˚⋆𐙚｡⋆𖦹.✧˚')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Objavi' })).toBeVisible();
  });

  test('prikazuje alert ako korisnik pokusa da objavi bez slike', async ({ page }) => {
    let dialogMessage = '';

    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/create');
    await page.getByRole('button', { name: 'Objavi' }).click();

    await expect.poll(() => dialogMessage).toBe('Moraš dodati barem jednu sliku!');
  });

  test('dodavanje jedne slike prikazuje preview', async ({ page }) => {
    await page.goto('/create');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'slika1.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-content')
    });

    await expect(page.locator('img[alt="Preview 0"]')).toBeVisible();
  });

  test('uklanjanje slike brise preview', async ({ page }) => {
    await page.goto('/create');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'slika1.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-content')
    });

    await expect(page.locator('img[alt="Preview 0"]')).toBeVisible();

    await page.getByRole('button', { name: '×' }).click();

    await expect(page.locator('img[alt="Preview 0"]')).toHaveCount(0);
  });

  test('prikazuje alert kada korisnik doda vise od 20 fajlova', async ({ page }) => {
    let dialogMessage = '';

    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    const files = Array.from({ length: 21 }, (_, i) => ({
      name: `slika-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(`fake-image-${i + 1}`)
    }));

    await page.goto('/create');
    await page.locator('input[type="file"]').setInputFiles(files);

    await expect.poll(() => dialogMessage).toBe('Maksimalan broj fajlova po objavi je 20!');
  });

  test('uspesno objavljivanje salje post i resetuje formu', async ({ page }) => {
    await page.route('http://localhost:4000/api/posts', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Post created' })
      });
    });

    let dialogMessage = '';

    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/create');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'slika1.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-content')
    });

    await page
      .getByPlaceholder('Dodaj opis ༘˚⋆𐙚｡⋆𖦹.✧˚')
      .fill('Moj novi post');

    await page.getByRole('button', { name: 'Objavi' }).click();

    await expect.poll(() => dialogMessage).toBe('Bravo! Objava je uspešno kreirana!');

    await expect(
      page.getByPlaceholder('Dodaj opis ༘˚⋆𐙚｡⋆𖦹.✧˚')
    ).toHaveValue('');

    await expect(page.locator('img[alt="Preview 0"]')).toHaveCount(0);
  });

  test('prikazuje gresku sa servera kada objava nije uspesna', async ({ page }) => {
    await page.route('http://localhost:4000/api/posts', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Neispravni podaci' })
      });
    });

    let dialogMessage = '';

    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/create');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'slika1.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-content')
    });

    await page.getByRole('button', { name: 'Objavi' }).click();

    await expect.poll(() => dialogMessage).toBe('Greška pri objavljivanju: Neispravni podaci');
  });
});