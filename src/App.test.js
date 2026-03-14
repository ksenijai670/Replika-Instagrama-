import { render, screen } from '@testing-library/react';
import App from './App';

// ovo je za upozorenja za React Router v7 bezvezna
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((msg) => {
    if (msg.includes('React Router Future Flag Warning')) return;
    console.warn(msg);
  });
});

test('renderuje Instagram Replica naslov', () => {
  render(<App />);
  const element = screen.getByText(/Instagram Replica/i);
  expect(element).toBeInTheDocument();
});