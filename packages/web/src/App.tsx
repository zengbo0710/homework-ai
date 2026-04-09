import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { InstallPrompt } from './components/InstallPrompt';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ChildSelectorPage } from './pages/ChildSelectorPage';
import { ChildDashboardPage } from './pages/ChildDashboardPage';
import { AddChildPage } from './pages/AddChildPage';
import { EditChildPage } from './pages/EditChildPage';
import { ScanPage } from './pages/ScanPage';
import { SubmissionResultPage } from './pages/SubmissionResultPage';
import { SubjectDetailPage } from './pages/SubjectDetailPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<ChildSelectorPage />} />
            <Route path="/dashboard/:childId" element={<ChildDashboardPage />} />
            <Route path="/children/new" element={<AddChildPage />} />
            <Route path="/children/:id/edit" element={<EditChildPage />} />
            <Route path="/scan/:childId" element={<ScanPage />} />
            <Route path="/submissions/:id" element={<SubmissionResultPage />} />
            <Route path="/subjects/:childId/:subject" element={<SubjectDetailPage />} />
          </Route>
        </Route>
      </Routes>
      <InstallPrompt />
    </AuthProvider>
  );
}
