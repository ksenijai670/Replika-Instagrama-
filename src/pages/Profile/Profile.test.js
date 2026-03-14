import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Profile from './Profile';

const mockedNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockedNavigate,
}));

// Mockujemo globalni fetch da testovi ne bi pokušavali da zovu pravi server
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ user: { username: "mocked_user", fullName: "Mock User" } }),
  })
);

// Mockujemo localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  // Ubacujemo lažni token da ne bi pukao atob() prilikom dekodiranja na profilu
  window.localStorage.setItem('token', 'header.eyJ1c2VySWQiOjF9.signature');
});

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((msg) => {
    if (msg.includes('React Router Future Flag Warning')) return;
    console.warn(msg);
  });
  // Skrivamo console.error da nam ne prlja terminal ako pukne fetch u testu
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe('Profile Komponenta', () => {
  
  test('prikazuje osnovne informacije o korisniku (ime, bio, statistika)', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    expect(screen.getByText(/neko_tajni/i)).toBeInTheDocument();
    expect(screen.getByText('objava')).toBeInTheDocument();
    expect(screen.getByText('pratilaca')).toBeInTheDocument();
    expect(screen.getByText('prati')).toBeInTheDocument();
  });

  test('menja stanje dugmeta kada se klikne na Blokiraj', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );
    
    const blockButton = screen.getByRole('button', { name: /Blokiraj/i });
    expect(blockButton).toBeInTheDocument();

    fireEvent.click(blockButton);

    // Čekamo da asinhroni fetch završi i dugme promeni tekst
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Odblokiraj/i })).toBeInTheDocument();
    });
  });

  test('otvara modal kada se klikne na dugme "Moj Profil" da uredi podatke', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    const mojProfilButton = screen.getByRole('button', { name: /Moj Profil/i });
    fireEvent.click(mojProfilButton);

    await waitFor(() => {
       expect(screen.getByRole('button', { name: /Uredi profil/i })).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /Uredi profil/i });
    fireEvent.click(editButton);

    expect(screen.getByText('Ime')).toBeInTheDocument();
    expect(screen.getByText('Korisničko ime')).toBeInTheDocument();
    expect(screen.getByText('Biografija')).toBeInTheDocument();
  });

  test('poziva logout i preusmerava na login stranicu', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    const mojProfilButton = screen.getByRole('button', { name: /Moj Profil/i });
    fireEvent.click(mojProfilButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Odjavi se/i })).toBeInTheDocument();
    });

    const logoutButton = screen.getByRole('button', { name: /Odjavi se/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      expect(mockedNavigate).toHaveBeenCalledWith('/login');
    });
  });
});