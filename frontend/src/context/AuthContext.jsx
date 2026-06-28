import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);

  // Check setup requirement and verify token on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }

        // Check if setup is required
        const setupRes = await authApi.setupRequired();
        setSetupRequired(setupRes.data.setupRequired);

        // Verify token if exists
        if (storedToken) {
          try {
            await authApi.verify();
          } catch (err) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setToken(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Auth init error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await authApi.login(email, password);
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      setSetupRequired(false);
      return userData;
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      setError(message);
      throw new Error(message);
    }
  };

  const setup = async (adminData, smtpData) => {
    try {
      setError(null);
      const response = await authApi.setup({
        adminName: adminData.name,
        adminEmail: adminData.email,
        adminPassword: adminData.password,
        ...smtpData
      });

      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      setSetupRequired(false);
      return userData;
    } catch (err) {
      const message = err.response?.data?.message || 'Setup failed';
      setError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
      setError(null);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      setError(null);
      await authApi.changePassword(currentPassword, newPassword);
      return true;
    } catch (err) {
      const message = err.response?.data?.message || 'Password change failed';
      setError(message);
      throw new Error(message);
    }
  };

  const value = {
    user,
    token,
    loading,
    error,
    setupRequired,
    login,
    setup,
    logout,
    changePassword,
    isAdmin: user?.role === 'admin',
    isAuthenticated: !!token
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
