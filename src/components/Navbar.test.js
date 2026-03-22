import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

describe('Navbar Komponenta', () => {
  test('prikazuje sve glavne navigacione ikonice na ekranu', () => {
    // Koristimo MemoryRouter jer Navbar koristi useLocation()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/Home/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Search/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/New Post/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Activity Feed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Profile/i)).toBeInTheDocument();
  });
});