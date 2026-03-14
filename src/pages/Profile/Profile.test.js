import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Profile from './Profile';

const mockedNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockedNavigate,
}));

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((msg) => {
    if (msg.includes('React Router Future Flag Warning')) return;
    console.warn(msg);
  });
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

  test('menja stanje dugmeta kada se klikne na Blokiraj', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    const blockButton = screen.getByRole('button', { name: /Blokiraj/i });
    expect(blockButton).toBeInTheDocument();

    fireEvent.click(blockButton);

    expect(screen.getByRole('button', { name: /Odblokiraj/i })).toBeInTheDocument();
  });

  test('otvara modal kada se klikne na dugme "Moj Profil" da uredi podatke', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Profile />
      </BrowserRouter>
    );

    const mojProfilButton = screen.getByRole('button', { name: /Moj Profil/i });
    fireEvent.click(mojProfilButton);

    const editButton = screen.getByRole('button', { name: /Uredi profil/i });
    fireEvent.click(editButton);

    expect(screen.getByText('Ime')).toBeInTheDocument();
    expect(screen.getByText('Korisničko ime')).toBeInTheDocument();
    expect(screen.getByText('Biografija')).toBeInTheDocument();
  });
});