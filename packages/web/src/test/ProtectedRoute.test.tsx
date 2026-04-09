import { describe, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../lib/api', () => ({
  apiClient: { post: vi.fn().mockRejectedValue(new Error('no server')) },
  setAccessToken: vi.fn(),
}));

describe('ProtectedRoute', () => {
  it('redirects to /login when not authenticated', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<span>Login page</span>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<span>Dashboard</span>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    // Wait for isLoading to settle (refresh fails → no-user → redirect)
    await screen.findByText('Login page');
  });
});
