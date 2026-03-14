import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from './Login';

const mockedNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockedNavigate,
}));

// laziramo fetch i alert da test ne bi pukao bez pravog pretraivacaa
global.fetch = jest.fn();
window.alert = jest.fn();

describe('Login Komponenta', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('proverava da li Login stranica sadrzi polja za kredencijale i dugme', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    
    expect(screen.getByPlaceholderText(/Korisničko ime ili email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Lozinka/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prijavi se/i })).toBeInTheDocument();
  });

  test('omogućava unos teksta u polja i klik na dugme za prijavu', async () => {
    // laziramo uspesan odgovor servera sa accessToken-om koji moj kod occekuje
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accessToken: 'lazni-test-token' })
    });

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    const identifierInput = screen.getByPlaceholderText(/Korisničko ime ili email/i);
    const passwordInput = screen.getByPlaceholderText(/Lozinka/i);
    const submitButton = screen.getByRole('button', { name: /Prijavi se/i });

    fireEvent.change(identifierInput, { target: { value: 'ksenija_dev' } });
    fireEvent.change(passwordInput, { target: { value: 'tajnalozinka123' } });

    expect(identifierInput.value).toBe('ksenija_dev');
    expect(passwordInput.value).toBe('tajnalozinka123');

    fireEvent.click(submitButton);

    // cekamo da asinhroni fetch prodje i da se pozove preusmeravanjje 
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith('/');
    });
  });
});