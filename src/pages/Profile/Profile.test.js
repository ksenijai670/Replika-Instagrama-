import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Profile from './Profile';

const mockedNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockedNavigate,
  useLocation: () => mockUseLocation(),
}));

const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('React Router Future Flag Warning')) return;
    originalWarn(...args);
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.warn = originalWarn;
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  
  if (typeof window.atob === 'undefined') {
    window.atob = (str) => Buffer.from(str, 'base64').toString('binary');
  }

  localStorage.setItem('token', 'header.eyJ1c2VySWQiOjF9.signature');

  // test "Moj Profil"
  mockUseLocation.mockReturnValue({ state: null });

  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ 
        user: { 
          username: "pravi_korisnik", 
          first_name: "Pravi", 
          last_name: "Korisnik", 
          bio: "Prava bio",
          posts: [] 
        } 
      }),
    })
  );
});

describe('Profile Komponenta', () => {
  
  test('prikazuje informacije o korisniku nakon učitavanja sa servera', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/pravi_korisnik/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText('objava')).toBeInTheDocument();
    expect(screen.getByText('pratilaca')).toBeInTheDocument();
    expect(screen.getByText('prati')).toBeInTheDocument();
  });

  test('menja stanje dugmeta kada se klikne na Blokiraj (tuđi profil)', async () => {
    // Simuliramo da smo dosli sa searcha na neciji profil
    mockUseLocation.mockReturnValue({ 
      state: { korisnik: { id: 2, username: 'tudji_profil' } } 
    });

    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );
    
    const blockButton = await screen.findByRole('button', { name: /Blokiraj/i });
    fireEvent.click(blockButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Odblokiraj/i })).toBeInTheDocument();
    });
  });

  test('otvara modal kada se klikne na dugme "Uredi profil" da uredi podatke', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    // na svom smo profilu po defaultu, odmah trazimo dugme uredi
    const editButton = await screen.findByRole('button', { name: /Uredi profil/i });
    fireEvent.click(editButton);

    expect(screen.getByText('Ime')).toBeInTheDocument();
    expect(screen.getByText('Prezime')).toBeInTheDocument();
    expect(screen.getByText('Biografija')).toBeInTheDocument();
  });

  test('poziva logout i preusmerava na login stranicu', async () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    const logoutButton = await screen.findByRole('button', { name: /Odjavi se/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith('/login');
    });
  });
});