const { test, expect } = require('@playwright/test');

function makeFakeJwt(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return `${header}.${body}.signature`;
}

async function prepareAuth(page) {
  const token = makeFakeJwt({ userId: 123, username: 'ana123' });

  await page.addInitScript(({ tokenValue }) => {
    localStorage.setItem('token', tokenValue);
  }, { tokenValue: token });
}

function mockFeedResponse(posts) {
  return {
    posts
  };
}

test.describe('Timeline UI', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAuth(page);
  });

  test('prikazuje poruku kada nema objava u feed-u', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedResponse([]))
      });
    });

    await page.goto('/');

    await expect(
      page.getByText('Nema objava. Zaprati nekoga ili dodaj svoju prvu objavu!')
    ).toBeVisible();
  });

  test('prikazuje objavu u feed-u', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedResponse([
          {
            id: 1,
            userId: 999,
            caption: 'Moj prvi post',
            likes_count: 3,
            isLiked: false,
            comments: [],
            user: {
              username: 'marko99',
              profile_image_url: ''
            },
            media: [
              {
                mediaType: 'image',
                mediaUrl: 'https://example.com/post1.jpg'
              }
            ]
          }
        ]))
      });
    });

    await page.goto('/');

    await expect(page.getByText('Moj prvi post')).toBeVisible();
    await expect(page.getByText('3 sviđanja')).toBeVisible();
    await expect(page.getByAltText('Post')).toBeVisible();
    await expect(page.locator('strong', { hasText: 'marko99' }).first()).toBeVisible();
  });

  test('lajkovanje objave povecava broj lajkova', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedResponse([
          {
            id: 1,
            userId: 999,
            caption: 'Test objava',
            likes_count: 3,
            isLiked: false,
            comments: [],
            user: {
              username: 'marko99',
              profile_image_url: ''
            },
            media: [
              {
                mediaType: 'image',
                mediaUrl: 'https://example.com/post1.jpg'
              }
            ]
          }
        ]))
      });
    });

    await page.route('http://localhost:4000/api/interactions/posts/1/likes', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/');

    await expect(page.getByText('3 sviđanja')).toBeVisible();

    await page.getByText('♡').click();

    await expect(page.getByText('4 sviđanja')).toBeVisible();
    await expect(page.getByText('♥')).toBeVisible();
  });

  test('otvara i prikazuje postojece komentare', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedResponse([
          {
            id: 1,
            userId: 999,
            caption: 'Objava sa komentarima',
            likes_count: 1,
            isLiked: false,
            comments: [
              {
                id: 101,
                userId: 50,
                username: 'ivana7',
                content: 'Prelepa objava'
              }
            ],
            user: {
              username: 'marko99',
              profile_image_url: ''
            },
            media: [
              {
                mediaType: 'image',
                mediaUrl: 'https://example.com/post1.jpg'
              }
            ]
          }
        ]))
      });
    });

    await page.goto('/');

    await page.getByText('Prikaži sve komentare (1)').click();

    await expect(page.getByText('ivana7 Prelepa objava')).toBeVisible();
    await expect(page.getByText('Sakrij komentare')).toBeVisible();
  });

  test('dodavanje komentara prikazuje novi komentar u listi', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedResponse([
          {
            id: 1,
            userId: 999,
            caption: 'Objava za komentarisanje',
            likes_count: 0,
            isLiked: false,
            comments: [],
            user: {
              username: 'marko99',
              profile_image_url: ''
            },
            media: [
              {
                mediaType: 'image',
                mediaUrl: 'https://example.com/post1.jpg'
              }
            ]
          }
        ]))
      });
    });

    await page.route('http://localhost:4000/api/interactions/posts/1/comments', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 555 })
      });
    });

    await page.goto('/');

    await page.getByPlaceholder('Dodaj komentar...').fill('Moj komentar');
    await page.getByRole('button', { name: 'Objavi' }).click();

    await expect(page.getByText('ana123 Moj komentar')).toBeVisible();
    await expect(page.getByText('Sakrij komentare')).toBeVisible();
  });

  test('moze da obrise sopstvenu objavu iz feed-a', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedResponse([
          {
            id: 1,
            userId: 123,
            caption: 'Moja objava',
            likes_count: 0,
            isLiked: false,
            comments: [],
            user: {
              username: 'ana123',
              profile_image_url: ''
            },
            media: [
              {
                mediaType: 'image',
                mediaUrl: 'https://example.com/post1.jpg'
              }
            ]
          }
        ]))
      });
    });

    await page.route('http://localhost:4000/api/posts/1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto('/');

    await page.getByRole('button', { name: '•••' }).click();
    await page.getByRole('button', { name: 'Obriši objavu' }).click();

    await expect(page.getByText('Moja objava')).toHaveCount(0);
  });

  test('prikazuje poruku ucitavanja dok se feed ucitava', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [] })
      });
    });

    await page.goto('/');

    await expect(page.getByText('Učitavanje feed-a...')).toBeVisible();
  });

  test('vlasnik objave moze da izmeni opis objave', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [
            {
              id: 1,
              userId: 123,
              caption: 'Stari opis',
              likes_count: 0,
              isLiked: false,
              comments: [],
              user: {
                username: 'ana123',
                profile_image_url: ''
              },
              media: [
                {
                  mediaType: 'image',
                  mediaUrl: 'https://example.com/post1.jpg'
                }
              ]
            }
          ]
        })
      });
    });

    await page.route('http://localhost:4000/api/posts/1/caption', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/');

    await page.getByRole('button', { name: '•••' }).click();
    await page.getByRole('button', { name: 'Izmeni opis' }).click();

    const input = page.locator('input').filter({ has: page.locator('..') }).first();
    await input.fill('Novi opis');

    await page.getByRole('button', { name: '✓' }).click();

    await expect(page.getByText('Novi opis')).toBeVisible();
  });

  test('uklanjanje lajka smanjuje broj lajkova', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [
            {
              id: 1,
              userId: 999,
              caption: 'Vec lajkovana objava',
              likes_count: 4,
              isLiked: true,
              comments: [],
              user: {
                username: 'marko99',
                profile_image_url: ''
              },
              media: [
                {
                  mediaType: 'image',
                  mediaUrl: 'https://example.com/post1.jpg'
                }
              ]
            }
          ]
        })
      });
    });

    await page.route('http://localhost:4000/api/interactions/posts/1/likes', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/');

    await expect(page.getByText('4 sviđanja')).toBeVisible();

    await page.getByText('♥').click();

    await expect(page.getByText('3 sviđanja')).toBeVisible();
    await expect(page.getByText('♡')).toBeVisible();
  });

  test('prikazuje gresku kada feed ne moze da se ucita', async ({ page }) => {
    await page.route('http://localhost:4000/api/feed', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });

    await page.goto('/');

    await expect(page.getByText('Greška pri učitavanju feed-a.')).toBeVisible();
  });
});