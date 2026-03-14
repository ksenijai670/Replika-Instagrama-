import { render, screen } from '@testing-library/react';
import App from './App';

// Gasimo upozorenja za React Router v7 da ne prljaju terminal
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((msg) => {
    if (msg.includes('React Router Future Flag Warning')) return;
    console.warn(msg);
  });
});

test('renderuje Instagram Replica naslov', () => {
  render(<App />);
  
  // koristimo getAllByText jer sada zbog preusmeravanja na Login imamo dva ista naslova 
  const elements = screen.getAllByText(/Instagram Replica/i);
  
  // Proveravamo da li je robot nasao barem jedan (prvi u nizu)
  expect(elements[0]).toBeInTheDocument();
});