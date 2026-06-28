import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, getErrorMessage } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupStatus, setSetupStatus] = useState(null);

  const refreshSetupStatus = async () => {
    const setupRes = await authApi.setupRequired();
    setSetupStatus(setupRes.data);
    setSetupRequired(Boolean(setupRes.data.setupRequired));
    return setupRes.data;
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }

        const setupState = await refreshSetupStatus();

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

        if (setupState.setupRequired) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Fehler beim Initialisieren der Anmeldung:', err);
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
      const setupState = await refreshSetupStatus();

      if (setupState.setupRequired) {
        throw new Error('Die Erstkonfiguration ist noch nicht abgeschlossen.');
      }

      const response = await authApi.login(email, password);
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      setSetupRequired(false);
      return userData;
    } catch (err) {
      const message = getErrorMessage(err, 'Anmeldung fehlgeschlagen.');
      setError(message);
      throw new Error(message);
    }
  };

  const setup = async (adminData, proxmoxData, smtpData) => {
    try {
      setError(null);
      const response = await authApi.setup({
        adminName: adminData.name,
        adminEmail: adminData.email,
        adminPassword: adminData.password,
        proxmoxName: proxmoxData.name,
        proxmoxUrl: proxmoxData.url,
        proxmoxApiToken: proxmoxData.apiToken,
        smtpHost: smtpData.smtpHost,
        smtpPort: smtpData.smtpPort,
        smtpUser: smtpData.smtpUser,
        smtpPassword: smtpData.smtpPassword
      });

      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      await refreshSetupStatus();
      return userData;
    } catch (err) {
      const message = getErrorMessage(err, 'Erstkonfiguration fehlgeschlagen.');
      setError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Fehler beim Abmelden:', err);
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
      const message = getErrorMessage(err, 'Passwortänderung fehlgeschlagen.');
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
    setupStatus,
    refreshSetupStatus,
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
    throw new Error('useAuth muss innerhalb des AuthProviders verwendet werden.');
  }
  return context;
}
