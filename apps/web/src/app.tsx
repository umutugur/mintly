import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminShell, ProtectedRoute } from './providers';
import { AnalyticsPage } from './pages/analytics-page';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { NotificationsPage } from './pages/notifications-page';
import { SettingsPage } from './pages/settings-page';
import { TransactionsPage } from './pages/transactions-page';
import { UsersPage } from './pages/users-page';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/notifications" element={<Navigate to="/admin/notifications" replace />} />
            <Route path="/admin/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
