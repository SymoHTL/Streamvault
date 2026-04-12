import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useLayoutEffect } from 'react';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import MediaDetailPage from './pages/MediaDetailPage';
import PlayerPage from './pages/PlayerPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import ListsPage from './pages/ListsPage';
import CollectionsPage from './pages/CollectionsPage';
import ProfilePickerPage from './pages/ProfilePickerPage';
import AccountPickerPage from './pages/AccountPickerPage';
import DeviceAuthPage from './pages/DeviceAuthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function HasSessionRoute({ children }: { children: React.ReactNode }) {
  const sessions = useAuthStore((s) => s.sessions);
  if (sessions.length === 0) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ActiveAccountRoute({ children }: { children: React.ReactNode }) {
  const { sessions, activeUserId } = useAuthStore();
  if (sessions.length === 0) return <Navigate to="/login" replace />;
  if (!activeUserId) return <Navigate to="/accounts" replace />;
  return <>{children}</>;
}

function ProfileRoute({ children }: { children: React.ReactNode }) {
  const { sessions, activeUserId, profile } = useAuthStore();
  if (sessions.length === 0) return <Navigate to="/login" replace />;
  if (!activeUserId) return <Navigate to="/accounts" replace />;
  if (!profile) return <Navigate to="/profiles" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { sessions, activeUserId, user } = useAuthStore();
  if (sessions.length === 0) return <Navigate to="/login" replace />;
  if (!activeUserId) return <Navigate to="/accounts" replace />;
  if (user?.role !== 'Admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const theme = useThemeStore((s) => s.theme);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/auth/device" element={<DeviceAuthPage />} />
          <Route path="/accounts" element={
            <HasSessionRoute><AccountPickerPage /></HasSessionRoute>
          } />
          <Route path="/profiles" element={
            <ActiveAccountRoute><ProfilePickerPage /></ActiveAccountRoute>
          } />
          <Route path="/player/:mediaFileId" element={
            <ProfileRoute><PlayerPage /></ProfileRoute>
          } />
          <Route element={<ProfileRoute><Layout /></ProfileRoute>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/library/:id" element={<LibraryPage />} />
            <Route path="/media/:id" element={<MediaDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin/*" element={
              <AdminRoute><AdminPage /></AdminRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
