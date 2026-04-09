import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { accessToken, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!accessToken) return <Navigate to="/login" replace />;
  return <Outlet />;
}
