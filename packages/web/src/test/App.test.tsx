import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../lib/api', () => ({
  apiClient: { post: vi.fn().mockRejectedValue(new Error('no server')) },
  setAccessToken: vi.fn(),
}));

describe('App routing', () => {
  it('renders Login heading at /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
  });

  it('renders Register heading at /register', () => {
    render(
      <MemoryRouter initialEntries={['/register']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /register/i })).toBeInTheDocument();
  });
});
