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
    localStorage.setItem('refreshToken', 'mock-refresh-token');
  }, { tokenValue: token });
}

async function mockOwnProfile(page) {
  await page.route('http://localhost:4000/api/profile/users/123', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 123,
          username: 'ana123',
          first_name: 'Ana',
          last_name: 'Anić',
          bio: 'Frontend developer',
          profile_image_url: '',
          followers_count: 2,
          following_count: 3,
          is_private: false,
          is_following: false,
          posts: [
            {
              id: 10,
              userId: 123,
              caption: 'Moja prva objava',
              likes_count: 5,
              comments: [],
              media: [
                {
                  id: 100,
                  mediaType: 'image',
                  mediaUrl: 'https://example.com/slika1.jpg'
                }
              ]
            },
            {
              id: 11,
              userId: 123,
              caption: 'Druga objava',
              likes_count: 1,
              comments: [],
              media: [
                {
                  id: 101,
                  mediaType: 'image',
                  mediaUrl: 'https://example.com/slika2.jpg'
                }
              ]
            }
          ]
        }
      })
    });
  });

  await page.route('http://localhost:4000/api/interactions/posts/*/likes/status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isLiked: false })
    });
  });
}

test.describe('Profile UI', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAuth(page);
    await mockOwnProfile(page);
  });

  test('prikazuje podatke mog profila i broj objava', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: 'ana123' })).toBeVisible();
    await expect(page.getByText('Ana Anić')).toBeVisible();
    await expect(page.getByText('Frontend developer')).toBeVisible();

    await expect(page.getByText('objava', { exact: true })).toBeVisible();
    await expect(page.getByText('pratilaca', { exact: true })).toBeVisible();
    await expect(page.getByText('prati', { exact: true })).toBeVisible();

    await expect(page.locator('strong').filter({ hasText: '2' }).first()).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: '3' }).first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'Uredi profil' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odjavi se' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Blokirani' })).toBeVisible();
    });

  test('otvara modal za uredjivanje profila', async ({ page }) => {
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Uredi profil' }).click();

    await expect(page.getByRole('heading', { name: 'Uredi profil' })).toBeVisible();
    await expect(page.getByText(/^Ime$/)).toBeVisible();
    await expect(page.getByText(/^Prezime$/)).toBeVisible();
    await expect(page.getByText(/^Biografija$/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Javan/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Privatan/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sačuvaj' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odustani' })).toBeVisible();
    });

  test('prikazuje listu pratilaca', async ({ page }) => {
    await page.route('http://localhost:4000/api/profile/users/123/followers', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          followers: [
            {
              id: 1,
              username: 'marko99',
              first_name: 'Marko',
              last_name: 'Marković',
              profile_image_url: ''
            },
            {
              id: 2,
              username: 'ivana7',
              first_name: 'Ivana',
              last_name: 'Ivić',
              profile_image_url: ''
            }
          ]
        })
      });
    });

    await page.goto('/profile');

    await page.getByText('pratilaca').click();

    await expect(page.getByText('Pratioci')).toBeVisible();
    await expect(page.getByText('Marko Marković')).toBeVisible();
    await expect(page.getByText('@marko99')).toBeVisible();
    await expect(page.getByText('Ivana Ivić')).toBeVisible();
    await expect(page.getByText('@ivana7')).toBeVisible();
  });

  test('prikazuje listu blokiranih korisnika', async ({ page }) => {
    await page.route('http://localhost:4000/api/block/blocked-list', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          blocked: [
            { id: 55 },
            { id: 66 }
          ]
        })
      });
    });

    await page.route('http://localhost:4000/api/profile/users/by-ids', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 55,
              username: 'pera',
              first_name: 'Petar',
              last_name: 'Petrović',
              profile_image_url: ''
            },
            {
              id: 66,
              username: 'mika',
              first_name: 'Milan',
              last_name: 'Milić',
              profile_image_url: ''
            }
          ]
        })
      });
    });

    await page.goto('/profile');

    await page.getByRole('button', { name: 'Blokirani' }).click();

    await expect(page.getByText('Blokirani korisnici')).toBeVisible();
    await expect(page.getByText('Petar Petrović')).toBeVisible();
    await expect(page.getByText('@pera')).toBeVisible();
    await expect(page.getByText('Milan Milić')).toBeVisible();
    await expect(page.getByText('@mika')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odblokiraj' }).first()).toBeVisible();
  });

  test('odjava brise tokene i vodi na login', async ({ page }) => {
    await page.route('http://localhost:4000/api/authentication/logout', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Uspešna odjava' })
      });
    });

    await page.goto('/profile');

    await page.getByRole('button', { name: 'Odjavi se' }).click();

    await expect(page).toHaveURL(/.*\/login/);

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));

    expect(token).toBeNull();
    expect(refreshToken).toBeNull();
  });
});

test.describe('Profile interactions', () => {
  async function openVisitedProfile(page, { isPrivate = false, isFollowing = false } = {}) {
    const token = makeFakeJwt({ userId: 123 });

    await page.addInitScript(
      ({ tokenValue, korisnikState }) => {
        localStorage.setItem('token', tokenValue);
        localStorage.setItem('refreshToken', 'mock-refresh-token');

        window.history.replaceState(
          {
            usr: {
              korisnik: korisnikState
            },
            key: 'playwright',
            idx: 0
          },
          '',
          '/profile'
        );
      },
      {
        tokenValue: token,
        korisnikState: {
          id: 456,
          username: 'marko99',
          fullName: 'Marko Marković',
          avatar: '',
          bio: 'Gost profil'
        }
      }
    );

    await page.route('http://localhost:4000/api/profile/users/456', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 456,
            username: 'marko99',
            first_name: 'Marko',
            last_name: 'Marković',
            bio: 'Gost profil',
            profile_image_url: '',
            followers_count: 10,
            following_count: 4,
            is_private: isPrivate,
            is_following: isFollowing,
            posts:
              isPrivate && !isFollowing
                ? []
                : [
                    {
                      id: 201,
                      userId: 456,
                      caption: 'Markova objava',
                      likes_count: 2,
                      comments: [],
                      media: [
                        {
                          id: 301,
                          mediaType: 'image',
                          mediaUrl: 'https://example.com/post.jpg'
                        }
                      ]
                    }
                  ]
          }
        })
      });
    });

    await page.route('http://localhost:4000/api/interactions/posts/*/likes/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isLiked: false })
      });
    });

    await page.goto('/profile');
  }

  test('zaprati javni profil i dugme prelazi na Praćenje', async ({ page }) => {
    await openVisitedProfile(page, { isPrivate: false, isFollowing: false });

    await page.route('http://localhost:4000/api/follow', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await expect(page.getByRole('button', { name: 'Zaprati' })).toBeVisible();

    await page.getByRole('button', { name: 'Zaprati' }).click();

    await expect(page.getByRole('button', { name: 'Praćenje' })).toBeVisible();
  });

  test('otprati profil i dugme se vraca na Zaprati', async ({ page }) => {
    await openVisitedProfile(page, { isPrivate: false, isFollowing: true });

    await page.route('http://localhost:4000/api/unfollow', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await expect(page.getByRole('button', { name: 'Praćenje' })).toBeVisible();

    await page.getByRole('button', { name: 'Praćenje' }).click();

    await expect(page.getByRole('button', { name: 'Zaprati' })).toBeVisible();
  });

  test('zaprati privatni profil i prikazuje Zahtev poslat', async ({ page }) => {
    await openVisitedProfile(page, { isPrivate: true, isFollowing: false });

    await page.route('http://localhost:4000/api/follow', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await expect(page.getByRole('button', { name: 'Zaprati' })).toBeVisible();

    await page.getByRole('button', { name: 'Zaprati' }).click();

    await expect(page.getByRole('button', { name: 'Zahtev poslat' })).toBeVisible();
  });

  test('privatan profil prikazuje poruku i ne prikazuje objave ako korisnik ne prati profil', async ({ page }) => {
    await openVisitedProfile(page, { isPrivate: true, isFollowing: false });

    await expect(page.getByText('Ovaj profil je privatan')).toBeVisible();
    await expect(page.getByText(/Zaprati ovaj profil da bi video\/la njegove/)).toBeVisible();
    await expect(page.getByText('Markova objava')).toHaveCount(0);
  });

  test('blokiranje korisnika menja dugme u Odblokiraj', async ({ page }) => {
    await openVisitedProfile(page, { isPrivate: false, isFollowing: false });

    await page.route('http://localhost:4000/api/block', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await expect(page.getByRole('button', { name: 'Blokiraj' })).toBeVisible();

    await page.getByRole('button', { name: 'Blokiraj' }).click();

    await expect(page.getByRole('button', { name: 'Odblokiraj' })).toBeVisible();
  });
});