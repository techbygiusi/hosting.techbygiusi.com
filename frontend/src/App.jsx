import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Pages
import Setup from './pages/Setup';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';

function PrivateRoute({ children, requiredRole = null }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/login" />;
  }

  return children;
}

export default function App() {
  const { setupRequired, loading, isAuthenticated, user } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div>Initializing...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Setup Route */}
        {setupRequired && (
          <Route path="/setup" element={<Setup />} />
        )}

        {/* Login Route */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
              <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> : 
              <Login />
          } 
        />

        {/* User Dashboard Route */}
        <Route 
          path="/dashboard" 
          element={
            <PrivateRoute requiredRole="user">
              <UserDashboard />
            </PrivateRoute>
          } 
        />

        {/* Admin Dashboard Route */}
        <Route 
          path="/admin" 
          element={
            <PrivateRoute requiredRole="admin">
              <AdminDashboard />
            </PrivateRoute>
          } 
        />

        {/* Default Routes */}
        <Route 
          path="/" 
          element={
            setupRequired ? 
              <Navigate to="/setup" /> : 
              isAuthenticated ? 
                <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> : 
                <Navigate to="/login" />
          } 
        />

        {/* 404 Route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
