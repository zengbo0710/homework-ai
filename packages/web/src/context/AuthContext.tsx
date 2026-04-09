import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient, setAccessToken } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login(tokens: AuthTokens): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('refreshToken');
    if (!stored) {
      setIsLoading(false);
      return;
    }
    apiClient
      .post('/auth/refresh', { refreshToken: stored })
      .then((res) => {
        const { accessToken: at, user: u } = res.data;
        setAccessToken(at);
        setAccessTokenState(at);
        setUser(u);
      })
      .catch(() => {
        localStorage.removeItem('refreshToken');
      })
      .finally(() => setIsLoading(false));
  }, []);

  function login(tokens: AuthTokens): void {
    localStorage.setItem('refreshToken', tokens.refreshToken);
    setAccessToken(tokens.accessToken);
    setAccessTokenState(tokens.accessToken);
    setUser(tokens.user);
  }

  async function logout(): Promise<void> {
    const stored = localStorage.getItem('refreshToken');
    if (stored) {
      await apiClient.post('/auth/logout', { refreshToken: stored }).catch(() => {});
    }
    localStorage.removeItem('refreshToken');
    setAccessToken(null);
    setAccessTokenState(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
