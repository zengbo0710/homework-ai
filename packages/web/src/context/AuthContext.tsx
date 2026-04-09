import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem('refreshToken');
    if (!stored) {
      setIsLoading(false);
      return;
    }
    apiClient
      .post('/auth/refresh', { refreshToken: stored })
      .then((res) => {
        if (cancelled) return;
        const { accessToken: at, refreshToken: newRt, user: u } = res.data;
        if (newRt) localStorage.setItem('refreshToken', newRt);
        setAccessToken(at);
        setAccessTokenState(at);
        setUser(u);
      })
      .catch(() => {
        if (!cancelled) localStorage.removeItem('refreshToken');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(function(tokens: AuthTokens): void {
    localStorage.setItem('refreshToken', tokens.refreshToken);
    setAccessToken(tokens.accessToken);
    setAccessTokenState(tokens.accessToken);
    setUser(tokens.user);
  }, []);

  const logout = useCallback(async function(): Promise<void> {
    const stored = localStorage.getItem('refreshToken');
    if (stored) {
      await apiClient.post('/auth/logout', { refreshToken: stored }).catch(() => {});
    }
    localStorage.removeItem('refreshToken');
    setAccessToken(null);
    setAccessTokenState(null);
    setUser(null);
  }, []);

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
