import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

vi.mock('../lib/api', () => ({
  apiClient: { post: vi.fn(), get: vi.fn() },
  setAccessToken: vi.fn(),
}));

import { apiClient } from '../lib/api';

function TestConsumer() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <span>loading</span>;
  return <span>{user ? `user:${user.email}` : 'no-user'}</span>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows no-user when localStorage has no refreshToken', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('no-user')).toBeInTheDocument());
  });

  it('hydrates user when localStorage has valid refreshToken', async () => {
    localStorage.setItem('refreshToken', 'valid-token');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { accessToken: 'at', user: { id: '1', email: 'a@b.com', name: 'A' } },
    });
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('user:a@b.com')).toBeInTheDocument());
  });

  it('clears localStorage when refresh fails', async () => {
    localStorage.setItem('refreshToken', 'bad-token');
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('401'));
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('no-user')).toBeInTheDocument());
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('logout clears user and removes localStorage token', async () => {
    localStorage.setItem('refreshToken', 'valid-token');
    (apiClient.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: { accessToken: 'at', user: { id: '1', email: 'a@b.com', name: 'A' } } })
      .mockResolvedValueOnce({});

    function LogoutConsumer() {
      const { user, logout, isLoading } = useAuth();
      if (isLoading) return <span>loading</span>;
      return (
        <div>
          <span>{user ? `user:${user.email}` : 'no-user'}</span>
          <button onClick={logout}>logout</button>
        </div>
      );
    }

    render(<AuthProvider><LogoutConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('user:a@b.com')).toBeInTheDocument());

    await act(async () => { screen.getByRole('button', { name: 'logout' }).click(); });
    expect(screen.getByText('no-user')).toBeInTheDocument();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
