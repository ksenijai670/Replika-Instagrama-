import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Profile from './Profile';

const mockedNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockedNavigate,
}));

// Supresija React Router v7 upozorenja da nam ne prljaju konzolu
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
  // Resetujemo mockove i čistimo pravi JSDOM localStorage
  jest.clearAllMocks();
  localStorage.clear();
  
  // Ako test okruženje zaboravi atob funkciju (dešava se u Node-u), dodajemo je
  if (typeof window.atob === 'undefined') {
    window.atob = (str) => Buffer.from(str, 'base64').toString('binary');
  }

  // Koristimo ugrađeni localStorage (nema više onog hacka sa Object.defineProperty)
  localStorage.setItem('token', 'header.eyJ1c2VySWQiOjF9.signature');

  // Deklarišemo lažni fetch pre SVAKOG testa
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ 
        user: { 
          username: "pravi_korisnik", 
          first_name: "Pravi", 
          last_name: "Korisnik", 
          bio: "Prava bio" 
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

    // Čekamo da podaci sa našeg lažnog servera stignu
    await waitFor(() => {
      expect(screen.getByText(/pravi_korisnik/i)).toBeInTheDocument();
    });
    
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
    
    const javniProfilButton = screen.getByRole('button', { name: /Javni Profil/i });
    fireEvent.click(javniProfilButton);

    const blockButton = await screen.findByRole('button', { name: /Blokiraj/i });
    fireEvent.click(blockButton);

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
      expect(mockedNavigate).toHaveBeenCalledWith('/login');
    });
  });
});