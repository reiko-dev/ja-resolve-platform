import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the administrator login page by default', () => {
  render(<App />);
  expect(screen.getByText('Socorre')).toBeInTheDocument();
  expect(screen.getByText('Painel Administrativo')).toBeInTheDocument();
});
