import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, userApi, getErrorMessage } from '../services/api';
import { readStoredLanguage, storeLanguage } from '../components/LanguageSwitch';
import { getSavedTheme, setDocumentTheme } from '../components/ThemeButton';

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
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          if (parsedUser?.preferredLanguage) storeLanguage(parsedUser.preferredLanguage);
          if (parsedUser?.preferredTheme) setDocumentTheme(parsedUser.preferredTheme);
        }

        const setupState = await refreshSetupStatus();

        if (storedToken) {
          try {
            const verifyResponse = await authApi.verify();
            if (verifyResponse.data?.user) {
              const serverUser = verifyResponse.data.user;
              const preferredLanguage = serverUser.preferredLanguage || readStoredLanguage();
              const verifiedUser = { ...serverUser, preferredLanguage };
              localStorage.setItem('user', JSON.stringify(verifiedUser));
              setUser(verifiedUser);
              storeLanguage(preferredLanguage);
              setDocumentTheme(serverUser.preferredTheme || 'light');
              if (!serverUser.preferredLanguage) {
                await userApi.updateLanguage(preferredLanguage);
              }
            }
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
        setError('Das Backend ist aktuell nicht erreichbar. Bitte prüfe Docker Compose und den Reverse Proxy.');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);


  useEffect(() => {
    const handleLanguageChange = async (event) => {
      if (!token || !user?.id) return;
      const language = event.detail?.language || readStoredLanguage();
      if (!['en', 'de'].includes(language)) return;
      try {
        const response = await userApi.updateLanguage(language);
        const preferredLanguage = response.data?.preferredLanguage || language;
        setUser(current => {
          if (!current) return current;
          const next = { ...current, preferredLanguage };
          localStorage.setItem('user', JSON.stringify(next));
          return next;
        });
      } catch (_) {
        // Keep the local language active if the server is temporarily unavailable.
      }
    };

    window.addEventListener('portal-language-change', handleLanguageChange);
    return () => window.removeEventListener('portal-language-change', handleLanguageChange);
  }, [token, user?.id]);


  useEffect(() => {
    const handleThemeChange = async (event) => {
      const theme = event.detail?.theme || getSavedTheme();
      if (!['light', 'dark'].includes(theme)) return;
      if (!user?.id) return;
      try {
        const response = await userApi.updateTheme(theme);
        const preferredTheme = response.data?.preferredTheme || theme;
        setUser(current => {
          if (!current) return current;
          const next = { ...current, preferredTheme };
          localStorage.setItem('user', JSON.stringify(next));
          return next;
        });
      } catch (_) {
        // Keep the visual theme even when persistence temporarily fails.
      }
    };

    window.addEventListener('portal-theme-change', handleThemeChange);
    return () => window.removeEventListener('portal-theme-change', handleThemeChange);
  }, [user?.id]);

  const login = async (email, password) => {
    try {
      setError(null);
      const setupState = await refreshSetupStatus();

      if (setupState.setupRequired) {
        throw new Error('Die Erstkonfiguration ist noch nicht abgeschlossen.');
      }

      const response = await authApi.login(email, password, readStoredLanguage());
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      storeLanguage(userData.preferredLanguage || 'en');
      setDocumentTheme(userData.preferredTheme || 'light');
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
        smtpPassword: smtpData.smtpPassword,
        preferredLanguage: readStoredLanguage()
      });

      const { token: newToken, user: userData } = response.data;

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      storeLanguage(userData.preferredLanguage || readStoredLanguage());
      setDocumentTheme(userData.preferredTheme || 'light');
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
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
      setError(null);
    }
  };

  const applyUserPatch = (patch) => {
    setUser(current => {
      if (!current) return current;
      const next = { ...current, ...patch };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  };


  const changeEmail = async (email) => {
    try {
      setError(null);
      const response = await userApi.updateEmail(email);
      const nextEmail = response.data?.email || email;
      const nextToken = response.data?.token;

      if (nextToken) {
        localStorage.setItem('token', nextToken);
        setToken(nextToken);
      }
      applyUserPatch({ email: nextEmail });
      return nextEmail;
    } catch (err) {
      const message = getErrorMessage(err, 'E-Mail-Adresse konnte nicht geändert werden.');
      setError(message);
      throw new Error(message);
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
    changeEmail,
    changePassword,
    applyUserPatch,
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
